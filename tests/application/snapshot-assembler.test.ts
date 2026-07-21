import {
  CoherentSnapshotAssembler,
  type SnapshotMetadataEvidence,
  type SnapshotSourcePort,
} from "../../packages/application/src";
import type { CompletedBarLexemes } from "../../packages/domain/src";
import { describe, expect, it, vi } from "vitest";

const start = "2026-07-21T16:59:00Z";
const end = "2026-07-21T17:00:00Z";

function metadata(
  barStartUtc: string | null = start,
  barEndUtc: string | null = end,
): SnapshotMetadataEvidence {
  return {
    epoch: "1784653200000000000",
    createdAtUtc: "2026-07-21T17:00:01Z",
    granularity: "1m",
    instrumentCount: 35,
    barStartUtc,
    barEndUtc,
    available: ["EURUSD", "GBPUSD", "USDJPY"],
  };
}

function bar(
  currency: string,
  barStartUtc = start,
  barEndUtc = end,
): CompletedBarLexemes {
  return {
    currency,
    epoch: "1784653140000000000",
    barStartUtc,
    barEndUtc,
    granularity: "1m",
    open: "1.1",
    high: "1.2",
    low: "1.0",
    close: "1.15",
  };
}

function source(
  metadataResponses: readonly SnapshotMetadataEvidence[],
  barFactory: (instrument: string) => Promise<CompletedBarLexemes> = (
    instrument,
  ) => Promise.resolve(bar(instrument)),
): SnapshotSourcePort {
  let metadataIndex = 0;
  return {
    getSnapshotMetadata: vi.fn(() => {
      const value = metadataResponses[metadataIndex];
      metadataIndex += 1;
      if (value === undefined) throw new Error("Unexpected metadata call");
      return Promise.resolve(value);
    }),
    getLatestObservation: vi.fn(barFactory),
  };
}

describe("coherent snapshot assembler", () => {
  it("reads metadata before, fans out in stable order, and reads metadata after", async () => {
    const events: string[] = [];
    let metadataCalls = 0;
    const port: SnapshotSourcePort = {
      getSnapshotMetadata: () => {
        metadataCalls += 1;
        events.push(`meta-${metadataCalls}`);
        return Promise.resolve(metadata());
      },
      getLatestObservation: (instrument) => {
        events.push(`bar-${instrument}`);
        return Promise.resolve(bar(instrument));
      },
    };
    const result = await new CoherentSnapshotAssembler(port, {
      maximumConcurrency: 2,
    }).assemble(["USDJPY", "EURUSD", "GBPUSD"]);

    expect(result).toMatchObject({ state: "COHERENT", callCount: 5 });
    expect(result.bars.map((value) => value.currency)).toEqual([
      "EURUSD",
      "GBPUSD",
      "USDJPY",
    ]);
    expect(events[0]).toBe("meta-1");
    expect(events.at(-1)).toBe("meta-2");
  });

  it("never exceeds the configured concurrency and rejects values above six", async () => {
    let active = 0;
    let maximumActive = 0;
    const port = source([metadata(), metadata()], async (instrument) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return bar(instrument);
    });
    await new CoherentSnapshotAssembler(port, {
      maximumConcurrency: 2,
    }).assemble(["AUDUSD", "EURUSD", "GBPUSD", "USDJPY"]);
    expect(maximumActive).toBe(2);
    expect(
      () => new CoherentSnapshotAssembler(port, { maximumConcurrency: 7 }),
    ).toThrow(/1 through 6/);

    active = 0;
    maximumActive = 0;
    const sixWidePort = source([metadata(), metadata()], async (instrument) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return bar(instrument);
    });
    await new CoherentSnapshotAssembler(sixWidePort, {
      maximumConcurrency: 6,
    }).assemble([
      "AUDCAD",
      "AUDCHF",
      "AUDJPY",
      "AUDNZD",
      "AUDUSD",
      "CADCHF",
      "CADJPY",
      "CHFJPY",
      "EURAUD",
      "EURCAD",
      "EURCHF",
      "EURGBP",
    ]);
    expect(maximumActive).toBe(6);
  });

  it("returns ROLLOVER without merging metadata targets", async () => {
    const result = await new CoherentSnapshotAssembler(
      source([
        metadata(),
        metadata("2026-07-21T17:00:00Z", "2026-07-21T17:01:00Z"),
      ]),
      { maximumConcurrency: 1 },
    ).assemble(["EURUSD"]);
    expect(result).toMatchObject({
      state: "INCOHERENT",
      reason: "ROLLOVER",
      callCount: 3,
    });
  });

  it("reports repeated rollover attempts independently without merging minutes", async () => {
    const before = metadata();
    const after = metadata("2026-07-21T17:00:00Z", "2026-07-21T17:01:00Z");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await new CoherentSnapshotAssembler(
        source([before, after]),
        { maximumConcurrency: 1 },
      ).assemble(["EURUSD"]);
      expect(result).toMatchObject({
        state: "INCOHERENT",
        reason: "ROLLOVER",
      });
    }
  });

  it("returns MIXED_BAR_INTERVAL when any bar differs from the stable target", async () => {
    const result = await new CoherentSnapshotAssembler(
      source([metadata(), metadata()], (instrument) =>
        Promise.resolve(
          instrument === "GBPUSD"
            ? bar(instrument, "2026-07-21T16:58:00Z", "2026-07-21T16:59:00Z")
            : bar(instrument),
        ),
      ),
      { maximumConcurrency: 2 },
    ).assemble(["EURUSD", "GBPUSD"]);
    expect(result).toMatchObject({
      state: "INCOHERENT",
      reason: "MIXED_BAR_INTERVAL",
    });
  });

  it("returns METADATA_TARGET_MISSING and rejects empty or duplicate requests", async () => {
    const port = source([metadata(null, null), metadata(null, null)]);
    const assembler = new CoherentSnapshotAssembler(port, {
      maximumConcurrency: 1,
    });
    await expect(assembler.assemble(["EURUSD"])).resolves.toMatchObject({
      state: "INCOHERENT",
      reason: "METADATA_TARGET_MISSING",
    });
    await expect(assembler.assemble([])).rejects.toThrow(/non-empty unique/);
    await expect(assembler.assemble(["EURUSD", "EURUSD"])).rejects.toThrow(
      /non-empty unique/,
    );
  });
});
