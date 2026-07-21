import type { ToolErrorOutput } from "@odp-market-steward/mcp-contracts";

export interface SafeToolErrorResult {
  readonly isError: true;
  readonly structuredContent: ToolErrorOutput;
  readonly content: readonly [{ readonly type: "text"; readonly text: string }];
}

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
    structuredContent: error,
    content: [{ type: "text", text: error.message }],
  };
}
