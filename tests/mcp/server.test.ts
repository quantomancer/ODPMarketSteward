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

async function connectInMemory() {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = await createStewardMcpServer();
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
      productVersion: "1.1.0",
      odpsVersion: 4.1,
      governance: {
        bundleVersion: "1.2.0",
        validation: {
          completeForRequiredLayers: false,
          summary: { passed: 3, failed: 0, notTested: 3 },
        },
      },
      disclaimer: { label: "MARKET DATA DEMO", policyVersion: "1.1.0" },
    });
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
