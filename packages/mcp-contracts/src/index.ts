import { z } from "zod";
export {
  MCP_TOOL_SCHEMAS,
  type McpToolName,
  type McpToolSchemaPair,
} from "../../../generated/standalone-tool-schemas";

export const productProfileInputSchema = z.object({}).strict();

export const productProfileOutputSchema = z.object({
  product: z.string().min(1),
  application: z.literal("ODP Market Steward"),
  classification: z.literal("MARKET DATA DEMO"),
  timeBasis: z.literal("UTC"),
  instrumentCount: z.number().int().positive(),
  standards: z.array(z.string()),
  evidenceMode: z.literal("DECLARED_PRODUCT_PROFILE"),
  limitations: z.array(z.string()),
});

export type ProductProfile = z.infer<typeof productProfileOutputSchema>;

export const toolErrorCodes = [
  "INVALID_INPUT",
  "INVALID_SESSION",
  "CONTRACT_UNAVAILABLE",
  "SOURCE_UNAVAILABLE",
  "SOURCE_INVALID",
  "OUTPUT_INVALID",
  "MODEL_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type ToolErrorCode = (typeof toolErrorCodes)[number];

export interface ToolErrorOutput {
  readonly status: "ERROR";
  readonly code: ToolErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly safeNextAction: string;
  readonly correlationId: string;
  readonly disclaimer: {
    readonly label: "MARKET DATA DEMO";
    readonly statement: string;
    readonly policyVersion: string;
  };
}
