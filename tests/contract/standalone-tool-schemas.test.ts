import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { MCP_TOOL_SCHEMAS } from "../../generated/standalone-tool-schemas";
import { materializeToolSchemas } from "../../scripts/mcp-schema-materializer.mjs";
import { describe, expect, it } from "vitest";

const expectedTools = [
  "get_fx_market_board",
  "get_fx_instrument",
  "summarize_fx_movements",
  "assess_fx_data_service",
  "get_fx_product_profile",
] as const;

const disclaimer = {
  label: "MARKET DATA DEMO",
  statement:
    "MARKET DATA DEMO. This API and application are provided solely to demonstrate app functionality for the competition. Use at your own risk. Data may be delayed, incomplete, unavailable, inaccurate, or contain errors. The provider accepts no responsibility for use of the API, application, or data and gives no guarantee regarding data accuracy or service availability. Nothing presented is investment advice, a recommendation, or an offer to buy or sell any financial instrument. The API, application, and data must not be used for live trading or order execution.",
  policyVersion: "1.3.0",
};

describe("standalone MCP tool schemas", () => {
  it("materializes exactly ten independently compilable schemas", () => {
    expect(Object.keys(MCP_TOOL_SCHEMAS)).toEqual(expectedTools);
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const identifiers = new Set<string>();
    let count = 0;
    for (const pair of Object.values(MCP_TOOL_SCHEMAS)) {
      for (const schema of [pair.input, pair.output]) {
        expect(schema.type).toBe("object");
        expect(JSON.stringify(schema)).not.toContain("#/schemas/");
        expect(() => ajv.compile(schema)).not.toThrow();
        identifiers.add(schema.$id);
        count += 1;
      }
    }
    expect(count).toBe(10);
    expect(identifiers.size).toBe(10);
  });

  it("admits the same typed safe error result for every tool output", () => {
    const errorResult = {
      status: "ERROR",
      code: "CONTRACT_UNAVAILABLE",
      message: "Governed contract evidence is temporarily unavailable.",
      retryable: false,
      safeNextAction: "Try product discovery again after contract validation.",
      correlationId: "oms_contract_0001",
      disclaimer,
    };
    for (const tool of expectedTools) {
      const ajv = new Ajv2020({ allErrors: true, strict: true });
      addFormats(ajv);
      const validate = ajv.compile(MCP_TOOL_SCHEMAS[tool].output);
      expect(validate(errorResult), JSON.stringify(validate.errors)).toBe(true);
      expect(MCP_TOOL_SCHEMAS[tool].output.$defs).toHaveProperty(
        "ToolErrorOutput",
      );
    }
  });

  it("keeps every generated descriptor paired with one declared handler name", () => {
    const declaredHandlers = new Set(expectedTools);
    expect(new Set(Object.keys(MCP_TOOL_SCHEMAS))).toEqual(declaredHandlers);
  });

  it("fails materialization on missing references and cycles", () => {
    const missing = contractFixture({ $ref: "#/schemas/Missing" });
    expect(() => materializeToolSchemas(missing)).toThrow(
      /missing schema Missing/,
    );

    const cycle = contractFixture(
      { $ref: "#/schemas/Cycle" },
      {
        Cycle: { $ref: "#/schemas/Input" },
      },
    );
    expect(() => materializeToolSchemas(cycle)).toThrow(
      /unsupported schema reference cycle/,
    );
  });

  it("fails materialization on duplicate tools and non-local root references", () => {
    const duplicate = contractFixture({ type: "object" });
    const duplicateTool = duplicate.tools[0];
    if (duplicateTool === undefined)
      throw new Error("Fixture has no first tool.");
    duplicate.tools[1] = duplicateTool;
    expect(() => materializeToolSchemas(duplicate)).toThrow(
      /Duplicate MCP tool name/,
    );

    const external = contractFixture({ type: "object" });
    const externalTool = external.tools[0];
    if (externalTool === undefined)
      throw new Error("Fixture has no first tool.");
    external.tools[0] = {
      ...externalTool,
      inputSchema: { $ref: "https://example.invalid/input.json" },
    };
    expect(() => materializeToolSchemas(external)).toThrow(
      /unsupported reference/,
    );
  });
});

function contractFixture(
  input: Record<string, unknown>,
  extraSchemas: Record<string, unknown> = {},
) {
  return {
    metadata: { version: "test" },
    tools: Array.from({ length: 5 }, (_, index) => ({
      name: `tool_${index}`,
      inputSchema: { $ref: "#/schemas/Input" },
      outputSchema: { $ref: "#/schemas/Output" },
    })),
    schemas: {
      Input: input,
      Output: { type: "object", additionalProperties: false },
      ...extraSchemas,
    },
  };
}
