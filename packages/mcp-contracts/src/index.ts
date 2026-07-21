import { Validator } from "@cfworker/json-schema";
import { z } from "zod";
import {
  MCP_TOOL_SCHEMAS,
  type McpToolName,
  type McpToolSchemaPair,
} from "../../../generated/standalone-tool-schemas";

export { MCP_TOOL_SCHEMAS, type McpToolName, type McpToolSchemaPair };

export const productProfileSections = [
  "identity",
  "purpose",
  "use_cases",
  "access",
  "SLA",
  "quality",
  "instruments",
  "monitoring",
  "calculations",
  "publication",
  "limitations",
  "validation",
] as const;

export type ProductProfileSection = (typeof productProfileSections)[number];

export interface ProductProfileInput {
  readonly sections: readonly ProductProfileSection[];
}

export interface MarketBoardInput {
  readonly evidenceMode: "LIVE_ONLY" | "ALLOW_RECORDED_FALLBACK";
  readonly previousBarEndUtc?: string | null;
}

export interface AcknowledgementInput {
  readonly affirmed: true;
  readonly policyVersion: "1.2.0";
  readonly disclaimerDigest: string;
  readonly challengeToken: string;
}

export interface ArtifactPointer {
  readonly artifactId: string;
  readonly artifactVersion: string;
  readonly path: string;
  readonly sha256: string;
}

export type ValidationLayer =
  | "syntax"
  | "controlling-schema"
  | "semantic-policy"
  | "cross-reference"
  | "source-alignment"
  | "sdk-compatibility";

export type ValidationStatus =
  "PASS" | "FAIL" | "WARNING" | "NOT_APPLICABLE" | "NOT_TESTED";

export interface ValidationLayerResult {
  readonly artifact: ArtifactPointer;
  readonly layer: ValidationLayer;
  readonly status: ValidationStatus;
  readonly validatorName: string;
  readonly validatorVersion: string;
  readonly evaluatedAtUtc: string;
  readonly schemaUri: string | null;
  readonly schemaSha256: string | null;
  readonly evidence: readonly string[];
}

export interface GovernanceValidation {
  readonly evaluatedAtUtc: string;
  readonly completeForRequiredLayers: boolean;
  readonly summary: {
    readonly passed: number;
    readonly failed: number;
    readonly warnings: number;
    readonly notApplicable: number;
    readonly notTested: number;
  };
  readonly results: readonly ValidationLayerResult[];
}

export interface GovernanceContext {
  readonly productId: "fxlive-market-data-demo-fx35";
  readonly productVersion: string;
  readonly bundleVersion: string;
  readonly odpsVersion: 4.1;
  readonly artifacts: readonly ArtifactPointer[];
  readonly validation: GovernanceValidation;
}

export interface Disclaimer {
  readonly label: "MARKET DATA DEMO";
  readonly statement: string;
  readonly policyVersion: string;
}

export interface DisclosureRequiredOutput {
  readonly status: "DISCLOSURE_REQUIRED";
  readonly summary: "Explicit acknowledgement is required before market-data retrieval.";
  readonly nextAction: "Review the disclaimer in the component and activate Acknowledge and continue.";
  readonly evidence: {
    readonly evidenceMode: "NONE";
    readonly attemptedAtUtc: string;
    readonly calendarEvaluatedAtUtc: null;
    readonly cacheAgeSeconds: null;
    readonly displayLabel: "No market evidence available.";
    readonly liveBadgePermitted: false;
    readonly reason: string;
  };
  readonly disclaimer: Disclaimer;
}

export interface MarketBoardSuccessOutput {
  readonly productId: "fxlive-market-data-demo-fx35";
  readonly bundleVersion: string;
  readonly summary: string;
  readonly governance: GovernanceContext;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly availabilityState:
    "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "INCOHERENT";
  readonly serviceState:
    "OPEN" | "MARKET_CLOSED" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
  readonly snapshot: Readonly<Record<string, unknown>> | null;
  readonly bars: readonly Readonly<Record<string, unknown>>[];
  readonly quality: Readonly<Record<string, unknown>>;
  readonly plausibility: Readonly<Record<string, unknown>>;
  readonly refresh: Readonly<Record<string, unknown>>;
  readonly limitations: readonly string[];
  readonly disclaimer: Disclaimer;
}

export interface ProductDeclaration {
  readonly artifact: ArtifactPointer;
  readonly pointer: string;
  readonly value: unknown;
}

export interface ProductProfile {
  readonly summary: string;
  readonly governance: GovernanceContext;
  readonly generatedAtUtc: string;
  readonly productId: "fxlive-market-data-demo-fx35";
  readonly productVersion: string;
  readonly odpsVersion: 4.1;
  readonly artifactDigest: string;
  readonly declarations: readonly ProductDeclaration[];
  readonly validation: GovernanceValidation;
  readonly disclaimer: Disclaimer;
}

interface StandardSchemaResult<Output> {
  readonly value?: Output;
  readonly issues?: readonly {
    readonly message: string;
    readonly path?: readonly PropertyKey[];
  }[];
}

export interface StandaloneStandardSchema<Input, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: "odp-market-steward";
    readonly types?: { readonly input: Input; readonly output: Output };
    readonly validate: (value: unknown) => StandardSchemaResult<Output>;
    readonly jsonSchema: {
      readonly input: (options: {
        readonly target: string;
      }) => Record<string, unknown>;
      readonly output: (options: {
        readonly target: string;
      }) => Record<string, unknown>;
    };
  };
}

export function createMcpToolSchema<Input = unknown, Output = Input>(
  tool: McpToolName,
  direction: "input" | "output",
): StandaloneStandardSchema<Input, Output> {
  const schema = MCP_TOOL_SCHEMAS[tool][direction] as unknown as Record<
    string,
    unknown
  >;
  const validator = new Validator(schema, "2020-12", false);
  const convert = (options: { readonly target: string }) => {
    if (options.target !== "draft-2020-12") {
      throw new Error(
        `Unsupported JSON Schema target ${options.target}; expected draft-2020-12.`,
      );
    }
    return schema;
  };
  const zodCompatibilitySchema = z
    .object({})
    .passthrough()
    .superRefine((value, context) => {
      const validation = validator.validate(value);
      if (validation.valid) return;
      context.addIssue({
        code: "custom",
        message: validation.errors.map(formatValidationError).join("; "),
      });
    });
  Object.defineProperty(zodCompatibilitySchema["~standard"], "jsonSchema", {
    value: { input: convert, output: convert },
  });
  return zodCompatibilitySchema as unknown as StandaloneStandardSchema<
    Input,
    Output
  >;
}

function formatValidationError(error: {
  readonly instanceLocation: string;
  readonly error: string;
}): string {
  const location = error.instanceLocation === "" ? "/" : error.instanceLocation;
  return `${location} ${error.error}`;
}

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
