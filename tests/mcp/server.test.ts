import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  COMPONENT_URI,
  createStewardMcpServer,
} from "../../apps/worker/src/mcp/server";
import { MCP_TOOL_SCHEMAS } from "../../generated/standalone-tool-schemas";
import {
  InMemoryAcknowledgementState,
  SessionAcknowledgementService,
  type GovernedSnapshotSourcePort,
} from "../../packages/application/src";
import type { CompletedBarLexemes } from "../../packages/domain/src";
import { afterEach, describe, expect, it, vi } from "vitest";

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(
    closeCallbacks.splice(0).map(async (close) => await close()),
  );
});

async function connectInMemory(
  dependencies: Parameters<typeof createStewardMcpServer>[0] = {},
) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = await createStewardMcpServer(dependencies);
  const client = new Client({
    name: "odp-market-steward-test-client",
    version: "0.1.0",
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closeCallbacks.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

describe("MCP product-profile vertical slice", () => {
  it("discovers and calls a typed read-only app tool", async () => {
    const client = await connectInMemory();
    const tools = await client.listTools();
    const tool = tools.tools.find(
      (candidate) => candidate.name === "get_fx_product_profile",
    );

    expect(tools.tools.map((candidate) => candidate.name)).toEqual([
      "acknowledge_market_data_demo",
      "get_fx_market_board",
      "get_fx_product_profile",
    ]);
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?._meta?.ui).toEqual({ visibility: ["model"] });
    expect(tool?._meta?.securitySchemes).toEqual([{ type: "noauth" }]);
    expect(tool?.inputSchema).toEqual(
      MCP_TOOL_SCHEMAS.get_fx_product_profile.input,
    );
    expect(tool?.outputSchema).toEqual(
      MCP_TOOL_SCHEMAS.get_fx_product_profile.output,
    );

    const result = await client.callTool({
      name: "get_fx_product_profile",
      arguments: { sections: ["identity", "instruments", "validation"] },
    });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      productId: "fxlive-market-data-demo-fx35",
      productVersion: "1.1.4",
      odpsVersion: 4.1,
      governance: {
        bundleVersion: "1.8.0",
        validation: {
          completeForRequiredLayers: false,
          summary: { passed: 3, failed: 0, notTested: 3 },
        },
      },
      disclaimer: { label: "MARKET DATA DEMO", policyVersion: "1.2.0" },
    });
    const summary = (
      result.structuredContent as Record<string, unknown> | undefined
    )?.summary;
    expect(typeof summary).toBe("string");
    if (typeof summary !== "string") {
      throw new Error("Expected the profile summary to be a string.");
    }
    expect(summary).toContain("Readiness is DEGRADED");
    const structured = result.structuredContent as {
      declarations?: Array<{
        artifact: { artifactId: string };
        pointer: string;
      }>;
    };
    expect(
      structured.declarations?.map((declaration) => [
        declaration.artifact.artifactId,
        declaration.pointer,
      ]),
    ).toEqual([
      ["product-contract", "/product/details/en"],
      ["instrument-set", "/spec/members"],
      ["mcp-application-contract", "/marketResultStateContract/validation"],
    ]);
  });

  it("returns the schema-valid typed contract error when readiness is blocked", async () => {
    const client = await connectInMemory({
      correlationId: () => "oms_contract_test_0001",
      additionalReadinessObservations: [
        {
          artifactId: "product-contract",
          layer: "semantic-policy",
          status: "FAIL",
          evidence: ["fixture:product-contract:semantic-policy"],
        },
      ],
    });
    const result = await client.callTool({
      name: "get_fx_product_profile",
      arguments: { sections: ["identity"] },
    });

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        status: "ERROR",
        code: "CONTRACT_UNAVAILABLE",
        retryable: false,
        correlationId: "oms_contract_test_0001",
        disclaimer: { label: "MARKET DATA DEMO" },
      },
    });
  });

  it("generates an opaque schema-valid correlation ID for blocked readiness", async () => {
    const client = await connectInMemory({
      additionalReadinessObservations: [
        {
          artifactId: "product-contract",
          layer: "semantic-policy",
          status: "FAIL",
        },
      ],
    });
    const result = await client.callTool({
      name: "get_fx_product_profile",
      arguments: { sections: ["identity"] },
    });
    const correlationId = (
      result.structuredContent as Record<string, unknown> | undefined
    )?.correlationId;

    expect(result.isError).toBe(true);
    expect(typeof correlationId).toBe("string");
    expect(correlationId).toMatch(/^oms_contract_[a-f0-9]{32}$/);
  });

  it("continues an isolated profile request and discloses unrelated failures", async () => {
    const client = await connectInMemory({
      additionalReadinessObservations: [
        {
          artifactId: "api-contract",
          layer: "controlling-schema",
          status: "FAIL",
          evidence: ["fixture:api-contract:controlling-schema"],
        },
      ],
    });
    const result = await client.callTool({
      name: "get_fx_product_profile",
      arguments: { sections: ["identity"] },
    });

    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      productId: "fxlive-market-data-demo-fx35",
    });
    const summary = (
      result.structuredContent as Record<string, unknown> | undefined
    )?.summary;
    expect(typeof summary).toBe("string");
    if (typeof summary !== "string") {
      throw new Error("Expected the profile summary to be a string.");
    }
    expect(summary).toContain(
      "Non-blocking contract failures: api-contract/controlling-schema.",
    );
  });

  it("rejects arguments that do not satisfy the advertised profile schema", async () => {
    const client = await connectInMemory();
    const result = await client.callTool({
      name: "get_fx_product_profile",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });

  it("serves the versioned MCP Apps component resource", async () => {
    const client = await connectInMemory();
    const result = await client.readResource({ uri: COMPONENT_URI });
    const item = result.contents[0];
    expect(item?.mimeType).toBe("text/html;profile=mcp-app");
    if (item === undefined || !("text" in item)) {
      throw new Error("Expected a text MCP Apps resource.");
    }
    expect(item.text).toContain("ODP Market Steward");
    expect(item.text).toContain("MARKET DATA DEMO");
  });
});

describe("MCP governed market-board vertical slice", () => {
  it("advertises the exact governed board schemas and annotations", async () => {
    const client = await connectInMemory();
    const tool = (await client.listTools()).tools.find(
      (candidate) => candidate.name === "get_fx_market_board",
    );
    expect(tool).toMatchObject({
      name: "get_fx_market_board",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    });
    expect(tool?.inputSchema).toEqual(
      MCP_TOOL_SCHEMAS.get_fx_market_board.input,
    );
    expect(tool?.outputSchema).toEqual(
      MCP_TOOL_SCHEMAS.get_fx_market_board.output,
    );
  });

  it("returns DISCLOSURE_REQUIRED and makes zero source calls by default", async () => {
    const source = boardSource();
    const client = await connectInMemory({
      snapshotSource: source,
      nowUtc: () => "2026-07-21T18:30:00Z",
    });
    const result = await client.callTool({
      name: "get_fx_market_board",
      arguments: { evidenceMode: "LIVE_ONLY" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      status: "DISCLOSURE_REQUIRED",
      evidence: {
        evidenceMode: "NONE",
        liveBadgePermitted: false,
        reason: "MARKET_DATA_DEMO_ACKNOWLEDGEMENT_REQUIRED",
      },
      disclaimer: { label: "MARKET DATA DEMO" },
    });
    expect(source.getSnapshotMetadata.mock.calls).toHaveLength(0);
    expect(source.getLatestObservation.mock.calls).toHaveLength(0);
    expect(source.getHealth.mock.calls).toHaveLength(0);
  });

  it("returns a schema-valid complete governed FX-35 board after acknowledgement", async () => {
    const source = boardSource();
    const client = await connectInMemory({
      snapshotSource: source,
      marketDataAcknowledged: () => true,
      nowUtc: () => "2026-07-21T18:30:00Z",
    });
    const result = await client.callTool({
      name: "get_fx_market_board",
      arguments: { evidenceMode: "LIVE_ONLY", previousBarEndUtc: null },
    });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      productId: "fxlive-market-data-demo-fx35",
      bundleVersion: "1.8.0",
      availabilityState: "AVAILABLE",
      serviceState: "UNKNOWN",
      evidence: {
        evidenceMode: "LIVE",
        liveBadgePermitted: false,
      },
      snapshot: {
        expectedCount: 35,
        returnedCount: 35,
        barStartUtc: "2026-07-21T18:29:00Z",
        barEndUtc: "2026-07-21T18:30:00Z",
      },
      refresh: { outcome: "INITIAL" },
      quality: { passed: 35, failed: 0 },
      plausibility: { state: "NOT_EVALUATED" },
      disclaimer: { label: "MARKET DATA DEMO" },
    });
    expect(
      (result.structuredContent as { bars?: readonly unknown[] }).bars,
    ).toHaveLength(35);
    expect(source.getSnapshotMetadata.mock.calls).toHaveLength(2);
    expect(source.getLatestObservation.mock.calls).toHaveLength(35);
    expect(source.getHealth.mock.calls).toHaveLength(0);
  });

  it("issues a component-only challenge, commits once, and then permits retrieval", async () => {
    const source = boardSource();
    const acknowledgementService = acknowledgementFixture();
    const client = await connectInMemory({
      snapshotSource: source,
      acknowledgementService,
      nowUtc: () => "2026-07-21T18:45:00.000Z",
    });
    const disclosure = await client.callTool({
      name: "get_fx_market_board",
      arguments: { evidenceMode: "LIVE_ONLY" },
    });
    expect(disclosure.structuredContent).toMatchObject({
      status: "DISCLOSURE_REQUIRED",
      disclaimer: { policyVersion: "1.2.0" },
    });
    const challenge = (
      disclosure as {
        _meta?: {
          "odpMarketSteward/acknowledgementChallenge"?: {
            challengeToken: string;
            policyVersion: "1.2.0";
            disclaimerDigest: string;
          };
        };
      }
    )._meta?.["odpMarketSteward/acknowledgementChallenge"];
    expect(challenge).toBeDefined();
    if (challenge === undefined)
      throw new Error("Expected challenge metadata.");
    expect(source.getSnapshotMetadata.mock.calls).toHaveLength(0);

    const acknowledgement = await client.callTool({
      name: "acknowledge_market_data_demo",
      arguments: {
        affirmed: true,
        policyVersion: challenge.policyVersion,
        disclaimerDigest: challenge.disclaimerDigest,
        challengeToken: challenge.challengeToken,
      },
    });
    expect(acknowledgement.isError).not.toBe(true);
    expect(acknowledgement.structuredContent).toMatchObject({
      status: "ACKNOWLEDGED",
      policyVersion: "1.2.0",
      disclaimerDigest: challenge.disclaimerDigest,
      nextAction:
        "Reissue the previously validated pending market-data request.",
    });

    const board = await client.callTool({
      name: "get_fx_market_board",
      arguments: { evidenceMode: "LIVE_ONLY" },
    });
    expect(board.isError, JSON.stringify(board)).not.toBe(true);
    expect(board.structuredContent).toMatchObject({
      availabilityState: "AVAILABLE",
      snapshot: { returnedCount: 35 },
    });
    expect(source.getSnapshotMetadata.mock.calls).toHaveLength(2);

    const replay = await client.callTool({
      name: "acknowledge_market_data_demo",
      arguments: {
        affirmed: true,
        policyVersion: challenge.policyVersion,
        disclaimerDigest: challenge.disclaimerDigest,
        challengeToken: challenge.challengeToken,
      },
    });
    expect(replay.structuredContent).toMatchObject({
      status: "DISCLOSURE_REQUIRED",
      evidence: { reason: "ACKNOWLEDGEMENT_ALREADY_ACKNOWLEDGED" },
    });
  });

  it("rejects a modified component challenge and keeps source-call count zero", async () => {
    const source = boardSource();
    const client = await connectInMemory({
      snapshotSource: source,
      acknowledgementService: acknowledgementFixture(),
      nowUtc: () => "2026-07-21T18:45:00.000Z",
    });
    const disclosure = await client.callTool({
      name: "get_fx_market_board",
      arguments: { evidenceMode: "LIVE_ONLY" },
    });
    const challenge = (
      disclosure as {
        _meta?: {
          "odpMarketSteward/acknowledgementChallenge"?: {
            challengeToken: string;
            policyVersion: "1.2.0";
            disclaimerDigest: string;
          };
        };
      }
    )._meta?.["odpMarketSteward/acknowledgementChallenge"];
    if (challenge === undefined)
      throw new Error("Expected challenge metadata.");
    const last = challenge.challengeToken.at(-1)!;
    const modified = `${challenge.challengeToken.slice(0, -1)}${last === "A" ? "B" : "A"}`;
    const rejected = await client.callTool({
      name: "acknowledge_market_data_demo",
      arguments: {
        affirmed: true,
        policyVersion: challenge.policyVersion,
        disclaimerDigest: challenge.disclaimerDigest,
        challengeToken: modified,
      },
    });
    expect(rejected.structuredContent).toMatchObject({
      status: "DISCLOSURE_REQUIRED",
      evidence: { reason: "ACKNOWLEDGEMENT_INVALID_SIGNATURE" },
    });
    const stillBlocked = await client.callTool({
      name: "get_fx_market_board",
      arguments: { evidenceMode: "LIVE_ONLY" },
    });
    expect(stillBlocked.structuredContent).toMatchObject({
      status: "DISCLOSURE_REQUIRED",
    });
    expect(source.getSnapshotMetadata.mock.calls).toHaveLength(0);
    expect(source.getLatestObservation.mock.calls).toHaveLength(0);
    expect(source.getHealth.mock.calls).toHaveLength(0);
  });

  it("preserves honest partial live evidence without recorded substitution", async () => {
    const source = boardSource("AUDCAD");
    const client = await connectInMemory({
      snapshotSource: source,
      marketDataAcknowledged: () => true,
      nowUtc: () => "2026-07-21T18:30:00Z",
    });
    const result = await client.callTool({
      name: "get_fx_market_board",
      arguments: { evidenceMode: "ALLOW_RECORDED_FALLBACK" },
    });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      availabilityState: "PARTIAL",
      serviceState: "DEGRADED",
      evidence: { evidenceMode: "LIVE" },
      snapshot: { returnedCount: 34 },
    });
    expect(
      (result.structuredContent as { bars?: readonly unknown[] }).bars,
    ).toHaveLength(34);
    expect(
      (result.structuredContent as { limitations?: readonly string[] })
        .limitations,
    ).toContain(
      "Recorded fallback is not enabled; honest live partial or unavailable evidence is returned.",
    );
  });

  it("blocks failed required contract readiness before any source call", async () => {
    const source = boardSource();
    const client = await connectInMemory({
      snapshotSource: source,
      marketDataAcknowledged: () => true,
      correlationId: () => "oms_contract_board_0001",
      additionalReadinessObservations: [
        {
          artifactId: "api-contract",
          layer: "controlling-schema",
          status: "FAIL",
        },
      ],
    });
    const result = await client.callTool({
      name: "get_fx_market_board",
      arguments: { evidenceMode: "LIVE_ONLY" },
    });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        code: "CONTRACT_UNAVAILABLE",
        correlationId: "oms_contract_board_0001",
      },
    });
    expect(source.getSnapshotMetadata.mock.calls).toHaveLength(0);
    expect(source.getLatestObservation.mock.calls).toHaveLength(0);
  });
});

function boardSource(failedInstrument?: string): GovernedSnapshotSourcePort & {
  readonly getHealth: ReturnType<
    typeof vi.fn<GovernedSnapshotSourcePort["getHealth"]>
  >;
  readonly getSnapshotMetadata: ReturnType<
    typeof vi.fn<GovernedSnapshotSourcePort["getSnapshotMetadata"]>
  >;
  readonly getLatestObservation: ReturnType<
    typeof vi.fn<GovernedSnapshotSourcePort["getLatestObservation"]>
  >;
} {
  return {
    getHealth: vi.fn(() => Promise.resolve({ ok: true, service: "FXLive" })),
    getSnapshotMetadata: vi.fn(() =>
      Promise.resolve({
        epoch: "1784658600000000000",
        createdAtUtc: "2026-07-21T18:30:01Z",
        granularity: "1m" as const,
        instrumentCount: 35,
        barStartUtc: "2026-07-21T18:29:00Z",
        barEndUtc: "2026-07-21T18:30:00Z",
        available: [],
      }),
    ),
    getLatestObservation: vi.fn((instrument: string) => {
      if (instrument === failedInstrument) {
        return Promise.reject(new Error("fixture source failure"));
      }
      const value: CompletedBarLexemes = {
        currency: instrument,
        epoch: "1784658540000000000",
        barStartUtc: "2026-07-21T18:29:00Z",
        barEndUtc: "2026-07-21T18:30:00Z",
        granularity: "1m",
        open: "1.1",
        high: "1.2",
        low: "1.0",
        close: "1.15",
      };
      return Promise.resolve(value);
    }),
  };
}

function acknowledgementFixture(): SessionAcknowledgementService {
  return new SessionAcknowledgementService({
    sessionIdentifier: "oms_mcp_session_fixture_000000000001",
    currentKey: {
      id: "fixture",
      secret: new Uint8Array(32).fill(31),
    },
    challengeLifetimeSeconds: 600,
    maximumClockSkewSeconds: 30,
    state: new InMemoryAcknowledgementState(),
    now: () => new Date("2026-07-21T18:45:00.000Z"),
    randomBytes: (length) => new Uint8Array(length).fill(47),
  });
}
