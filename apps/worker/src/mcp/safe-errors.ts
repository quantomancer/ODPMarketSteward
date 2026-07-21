import type { ToolErrorOutput } from "@odp-market-steward/mcp-contracts";

export type SafeToolErrorResult = {
  readonly isError: true;
  readonly structuredContent: ToolErrorOutput & Record<string, unknown>;
  readonly content: [{ readonly type: "text"; readonly text: string }];
} & Record<string, unknown>;

export const MCP_PROTOCOL_ERROR_POLICY = {
  malformedArguments: {
    mapping: "invalid_params",
    typedToolOutputReturned: false,
  },
  transportOrProtocolFailure: {
    mapping: "standard_json_rpc_error",
    typedToolOutputReturned: false,
  },
} as const;

export function mapApplicationToolError(
  error: ToolErrorOutput,
): SafeToolErrorResult {
  return {
    isError: true,
    structuredContent: error as ToolErrorOutput & Record<string, unknown>,
    content: [{ type: "text", text: error.message }],
  };
}
