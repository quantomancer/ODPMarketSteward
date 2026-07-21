import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  MCP_PROTOCOL_ERROR_POLICY,
  mapApplicationToolError,
} from "../../apps/worker/src/mcp/safe-errors";
import { MCP_TOOL_SCHEMAS } from "../../generated/standalone-tool-schemas";
import type { ToolErrorOutput } from "../../packages/mcp-contracts/src/index";
import { describe, expect, it } from "vitest";

const error: ToolErrorOutput = {
  status: "ERROR",
  code: "SOURCE_UNAVAILABLE",
  message: "Market evidence is temporarily unavailable.",
  retryable: true,
  safeNextAction: "Retry the same request later.",
  correlationId: "oms_safe_error_0001",
  disclaimer: {
    label: "MARKET DATA DEMO",
    statement:
      "MARKET DATA DEMO. For technical demonstration and evaluation only. Data may be delayed, incomplete, unavailable, or contain errors. Nothing presented is investment advice, a recommendation, or an offer to buy or sell any financial instrument. The product must not be used for live trading or order execution.",
    policyVersion: "1.1.0",
  },
};

describe("MCP safe error mapping", () => {
  it("returns an MCP error result whose structured content matches every output", () => {
    const result = mapApplicationToolError(error);
    expect(result).toMatchObject({
      isError: true,
      structuredContent: error,
      content: [{ type: "text", text: error.message }],
    });
    for (const pair of Object.values(MCP_TOOL_SCHEMAS)) {
      const ajv = new Ajv2020({ allErrors: true, strict: true });
      addFormats(ajv);
      const validate = ajv.compile(pair.output);
      expect(
        validate(result.structuredContent),
        JSON.stringify(validate.errors),
      ).toBe(true);
    }
  });

  it("keeps malformed arguments and transport failures at the protocol boundary", () => {
    expect(MCP_PROTOCOL_ERROR_POLICY).toEqual({
      malformedArguments: {
        mapping: "invalid_params",
        typedToolOutputReturned: false,
      },
      transportOrProtocolFailure: {
        mapping: "standard_json_rpc_error",
        typedToolOutputReturned: false,
      },
    });
  });
});
