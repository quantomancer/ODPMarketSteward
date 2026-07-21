import { FxLiveClient } from "../../packages/adapter-source-api/src";
import { GovernedSnapshotAcquirer } from "../../packages/application/src";
import {
  BundleLoader,
  ContractRegistry,
} from "../../packages/contract-runtime/src";
import { governedBundle } from "../../generated/governed-bundle";
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

it.runIf(liveCompatibilityEnabled)(
  "assembles one complete governed FX-35 live snapshot within the 37/74-call bound",
  async () => {
    const startedAt = performance.now();
    const registry = new ContractRegistry(
      await new BundleLoader().load(governedBundle),
    );
    const instruments = registry
      .instrumentSet()
      .members.map((member) => member.symbol);
    expect(instruments).toHaveLength(35);

    const source = new FxLiveClient({
      timeoutMilliseconds: 10_000,
      maximumResponseBytes: 65_536,
    });
    const result = await new GovernedSnapshotAcquirer(source, {
      maximumConcurrency: 6,
      maximumCallsPerInvocation: 74,
      allowOneFullRolloverReread: true,
    }).acquire(instruments);

    expect(result).toMatchObject({
      availabilityState: "AVAILABLE",
      coverageState: "COMPLETE",
      coherenceState: "COHERENT",
      reason: "COMPLETE",
      coverage: {
        requestedCount: 35,
        successfulCount: 35,
        failedCount: 0,
        missingCount: 0,
        unexpectedCount: 0,
        duplicateCount: 0,
      },
      healthDiagnostic: { status: "NOT_RUN" },
    });
    expect([37, 74]).toContain(result.callCount);
    expect([1, 2]).toContain(result.attemptCount);
    expect(result.bars).toHaveLength(35);
    console.info(
      JSON.stringify({
        status: "PASS_FOCUSED_LIVE_FX35",
        callCount: result.callCount,
        attemptCount: result.attemptCount,
        requestedCount: result.coverage.requestedCount,
        successfulCount: result.coverage.successfulCount,
        failedCount: result.coverage.failedCount,
        elapsedMilliseconds: Math.round(performance.now() - startedAt),
        marketValuesLogged: false,
      }),
    );
  },
  60_000,
);
