import { FxLiveClient } from "../../packages/adapter-source-api/src";
import { expect, it } from "vitest";

const liveCompatibilityEnabled = process.env.ODPMS_LIVE_COMPAT === "1";

it.runIf(liveCompatibilityEnabled)(
  "accepts one bounded current FXLive metadata and bar sample without persisting values",
  async () => {
    const source = new FxLiveClient({
      timeoutMilliseconds: 10_000,
      maximumResponseBytes: 65_536,
    });
    const metadata = await source.getSnapshotMetadata();
    const instrument = metadata.available[0];
    expect(instrument).toBeDefined();
    if (instrument === undefined) return;

    const bar = await source.getLatestObservation(instrument);
    expect(bar).toMatchObject({
      currency: instrument,
      granularity: "1m",
      barStartUtc: metadata.barStartUtc,
      barEndUtc: metadata.barEndUtc,
    });
    expect(metadata.instrumentCount).toBeGreaterThan(0);
    expect(metadata.available.length).toBeGreaterThan(0);
  },
  25_000,
);
