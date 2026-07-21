import { FxLiveClient } from "../../packages/adapter-source-api/src";
import { GovernedSnapshotAcquirer } from "../../packages/application/src";
import { createStewardMcpServer } from "../../apps/worker/src/mcp/server";
import {
  BundleLoader,
  ContractRegistry,
} from "../../packages/contract-runtime/src";
import { governedBundle } from "../../generated/governed-bundle";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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
  "returns a schema-valid governed FX-35 board through the acknowledged MCP tool",
  async () => {
    const startedAt = performance.now();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = await createStewardMcpServer({
      marketDataAcknowledged: () => true,
    });
    const client = new Client({
      name: "odp-market-steward-live-compatibility",
      version: "0.1.0",
    });
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: "get_fx_market_board",
        arguments: { evidenceMode: "LIVE_ONLY" },
      });
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        productId: "fxlive-market-data-demo-fx35",
        availabilityState: "AVAILABLE",
        evidence: { evidenceMode: "LIVE", liveBadgePermitted: false },
        snapshot: { expectedCount: 35, returnedCount: 35 },
        quality: { passed: 35, failed: 0 },
        plausibility: { state: "NOT_EVALUATED" },
        disclaimer: { label: "MARKET DATA DEMO" },
      });
      expect(
        (result.structuredContent as { bars?: readonly unknown[] }).bars,
      ).toHaveLength(35);
      console.info(
        JSON.stringify({
          status: "PASS_FOCUSED_LIVE_MCP_MARKET_BOARD",
          returnedCount: 35,
          availabilityState: "AVAILABLE",
          elapsedMilliseconds: Math.round(performance.now() - startedAt),
          marketValuesLogged: false,
        }),
      );
    } finally {
      await client.close();
      await server.close();
    }
  },
  60_000,
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
