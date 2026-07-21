import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  COMPONENT_URI,
  createStewardMcpServer,
} from "../../apps/worker/src/mcp/server";
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

    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?._meta?.ui).toEqual({ resourceUri: COMPONENT_URI });

    const result = await client.callTool({
      name: "get_fx_product_profile",
      arguments: {},
    });
    expect(result.structuredContent).toMatchObject({
      application: "ODP Market Steward",
      classification: "MARKET DATA DEMO",
      instrumentCount: 35,
      product: "FXLive Market Data Demo - Standard FX-35",
      timeBasis: "UTC",
    });
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
