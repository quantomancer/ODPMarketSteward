import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  COMPONENT_URI,
  createStewardMcpServer,
} from "../../apps/worker/src/mcp/server";
import { MCP_TOOL_SCHEMAS } from "../../generated/standalone-tool-schemas";
import { afterEach, describe, expect, it } from "vitest";

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
      productVersion: "1.1.2",
      odpsVersion: 4.1,
      governance: {
        bundleVersion: "1.5.0",
        validation: {
          completeForRequiredLayers: false,
          summary: { passed: 3, failed: 0, notTested: 3 },
        },
      },
      disclaimer: { label: "MARKET DATA DEMO", policyVersion: "1.1.0" },
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
