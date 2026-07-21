import {
  GovernedSnapshotAcquirer,
  type GovernedSnapshotSourcePort,
  type SnapshotMetadataEvidence,
} from "../../packages/application/src";
import type { CompletedBarLexemes } from "../../packages/domain/src";
import { describe, expect, it, vi } from "vitest";

const start = "2026-07-21T16:59:00Z";
const end = "2026-07-21T17:00:00Z";

function metadata(
  barStartUtc = start,
  barEndUtc = end,
): SnapshotMetadataEvidence {
  return {
    epoch: "1784653200000000000",
    createdAtUtc: "2026-07-21T17:00:01Z",
    granularity: "1m",
    instrumentCount: 3,
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

function port(options: {
  readonly metadata: readonly (SnapshotMetadataEvidence | Error)[];
  readonly bars?: Readonly<Record<string, CompletedBarLexemes | Error>>;
  readonly health?: "PASS" | "FAIL";
}): GovernedSnapshotSourcePort & {
  getHealth: ReturnType<typeof vi.fn<GovernedSnapshotSourcePort["getHealth"]>>;
  getSnapshotMetadata: ReturnType<
    typeof vi.fn<GovernedSnapshotSourcePort["getSnapshotMetadata"]>
  >;
} {
  let metadataIndex = 0;
  const getHealth = vi.fn<GovernedSnapshotSourcePort["getHealth"]>(() =>
    options.health === "FAIL"
      ? Promise.reject(new Error("health failed"))
      : Promise.resolve({ ok: true, service: "FXLive" }),
  );
  const getSnapshotMetadata = vi.fn<
    GovernedSnapshotSourcePort["getSnapshotMetadata"]
  >(() => {
    const value = options.metadata[metadataIndex];
    metadataIndex += 1;
    if (value instanceof Error) return Promise.reject(value);
    if (value === undefined)
      return Promise.reject(new Error("unexpected metadata call"));
    return Promise.resolve(value);
  });
  return {
    getHealth,
    getSnapshotMetadata,
    getLatestObservation: (instrument) => {
      const value = options.bars?.[instrument] ?? bar(instrument);
      return value instanceof Error
        ? Promise.reject(value)
        : Promise.resolve(value);
    },
  };
}

function acquirer(
  source: GovernedSnapshotSourcePort,
  maximumCallsPerInvocation: number,
  allowOneFullRolloverReread = true,
): GovernedSnapshotAcquirer {
  return new GovernedSnapshotAcquirer(source, {
    maximumConcurrency: 2,
    maximumCallsPerInvocation,
    allowOneFullRolloverReread,
  });
}

describe("governed snapshot acquisition outcomes", () => {
  it("returns COMPLETE/AVAILABLE with explicit zero-failure counts", async () => {
    const source = port({ metadata: [metadata(), metadata()] });
    const result = await acquirer(source, 10).acquire(["GBPUSD", "EURUSD"]);
    expect(result).toMatchObject({
      availabilityState: "AVAILABLE",
      coverageState: "COMPLETE",
      coherenceState: "COHERENT",
      reason: "COMPLETE",
      attemptCount: 1,
      callCount: 4,
      coverage: {
        requestedCount: 2,
        successfulCount: 2,
        failedCount: 0,
        missingCount: 0,
        unexpectedCount: 0,
        duplicateCount: 0,
      },
      healthDiagnostic: { status: "NOT_RUN" },
    });
    expect(source.getHealth.mock.calls).toHaveLength(0);
  });

  it("returns honest PARTIAL live evidence with identifiers and never calls health", async () => {
    const source = port({
      metadata: [metadata(), metadata()],
      bars: { GBPUSD: new Error("bar failed") },
    });
    const result = await acquirer(source, 10).acquire(["EURUSD", "GBPUSD"]);
    expect(result).toMatchObject({
      availabilityState: "PARTIAL",
      coverageState: "PARTIAL",
      coherenceState: "COHERENT",
      reason: "PARTIAL_COVERAGE",
      coverage: {
        successfulCount: 1,
        failedCount: 1,
        missingCount: 1,
        failedInstruments: ["GBPUSD"],
        missingInstruments: ["GBPUSD"],
      },
    });
    expect(result.bars.map((value) => value.currency)).toEqual(["EURUSD"]);
    expect(source.getHealth.mock.calls).toHaveLength(0);
  });

  it("counts mismatched returned instruments as unexpected and requested members as missing", async () => {
    const source = port({
      metadata: [metadata(), metadata()],
      bars: { EURUSD: bar("AUDUSD") },
    });
    const result = await acquirer(source, 10).acquire(["EURUSD"]);
    expect(result).toMatchObject({
      availabilityState: "UNAVAILABLE",
      coverageState: "NONE",
      coverage: {
        successfulCount: 0,
        failedCount: 1,
        missingCount: 1,
        unexpectedCount: 1,
        unexpectedInstruments: ["AUDUSD"],
      },
      healthDiagnostic: { status: "REACHABLE" },
    });
  });

  it("runs health exactly once only after no usable evidence and never upgrades availability", async () => {
    const reachable = port({
      metadata: [metadata(), metadata()],
      bars: { EURUSD: new Error("missing") },
      health: "PASS",
    });
    const reachableResult = await acquirer(reachable, 4).acquire(["EURUSD"]);
    expect(reachableResult).toMatchObject({
      availabilityState: "UNAVAILABLE",
      coherenceState: "NOT_EVALUATED",
      healthDiagnostic: {
        status: "REACHABLE",
        establishesMarketState: false,
        establishesFreshness: false,
        establishesCoherence: false,
        establishesFitness: false,
      },
      callCount: 4,
    });
    expect(reachable.getHealth.mock.calls).toHaveLength(1);

    const unreachable = port({
      metadata: [new Error("meta failed")],
      health: "FAIL",
    });
    const unreachableResult = await acquirer(unreachable, 4).acquire([
      "EURUSD",
    ]);
    expect(unreachableResult).toMatchObject({
      availabilityState: "UNAVAILABLE",
      reason: "METADATA_BEFORE_UNAVAILABLE",
      healthDiagnostic: { status: "UNREACHABLE" },
      callCount: 2,
    });
    expect(unreachable.getHealth.mock.calls).toHaveLength(1);
  });

  it("skips health when the configured budget has no remaining call", async () => {
    const source = port({
      metadata: [metadata(), metadata()],
      bars: { EURUSD: new Error("missing") },
    });
    const result = await acquirer(source, 3).acquire(["EURUSD"]);
    expect(result).toMatchObject({
      availabilityState: "UNAVAILABLE",
      healthDiagnostic: { status: "SKIPPED_BUDGET" },
      callCount: 3,
    });
    expect(source.getHealth.mock.calls).toHaveLength(0);
  });

  it("performs exactly one full rollover reread when the total budget permits", async () => {
    const rolledStart = "2026-07-21T17:00:00Z";
    const rolledEnd = "2026-07-21T17:01:00Z";
    const source = port({
      metadata: [
        metadata(),
        metadata(rolledStart, rolledEnd),
        metadata(rolledStart, rolledEnd),
        metadata(rolledStart, rolledEnd),
      ],
      bars: { EURUSD: bar("EURUSD", rolledStart, rolledEnd) },
    });
    const result = await acquirer(source, 6).acquire(["EURUSD"]);
    expect(result).toMatchObject({
      availabilityState: "AVAILABLE",
      reason: "COMPLETE",
      attemptCount: 2,
      callCount: 6,
    });
    expect(source.getSnapshotMetadata.mock.calls).toHaveLength(4);
  });

  it("fails safely when rollover reread is disabled or lacks total budget", async () => {
    const rolled = metadata("2026-07-21T17:00:00Z", "2026-07-21T17:01:00Z");
    for (const [budget, enabled] of [
      [3, true],
      [6, false],
    ] as const) {
      const source = port({ metadata: [metadata(), rolled] });
      const result = await acquirer(source, budget, enabled).acquire([
        "EURUSD",
      ]);
      expect(result).toMatchObject({
        availabilityState: "INCOHERENT",
        reason: "ROLLOVER_BUDGET_UNAVAILABLE",
        attemptCount: 1,
        callCount: 3,
      });
      expect(source.getSnapshotMetadata.mock.calls).toHaveLength(2);
    }
  });

  it("returns INCOHERENT after the sole reread also rolls", async () => {
    const firstAfter = metadata("2026-07-21T17:00:00Z", "2026-07-21T17:01:00Z");
    const secondAfter = metadata(
      "2026-07-21T17:01:00Z",
      "2026-07-21T17:02:00Z",
    );
    const source = port({
      metadata: [metadata(), firstAfter, firstAfter, secondAfter],
      bars: {
        EURUSD: bar("EURUSD", firstAfter.barStartUtc!, firstAfter.barEndUtc!),
      },
    });
    const result = await acquirer(source, 6).acquire(["EURUSD"]);
    expect(result).toMatchObject({
      availabilityState: "INCOHERENT",
      reason: "ROLLOVER_AFTER_REREAD",
      attemptCount: 2,
      callCount: 6,
      healthDiagnostic: { status: "NOT_RUN" },
    });
  });

  it("keeps mixed intervals INCOHERENT and does not run health when bars exist", async () => {
    const source = port({
      metadata: [metadata(), metadata()],
      bars: {
        EURUSD: bar("EURUSD", "2026-07-21T16:58:00Z", "2026-07-21T16:59:00Z"),
      },
    });
    const result = await acquirer(source, 10).acquire(["EURUSD"]);
    expect(result).toMatchObject({
      availabilityState: "INCOHERENT",
      reason: "MIXED_BAR_INTERVAL",
      healthDiagnostic: { status: "NOT_RUN" },
    });
    expect(source.getHealth.mock.calls).toHaveLength(0);
  });
});
