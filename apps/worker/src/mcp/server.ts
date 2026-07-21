import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getProductProfile } from "@odp-market-steward/application";
import {
  BundleLoader,
  ContractRegistry,
  readinessArtifactIds,
  type ReadinessArtifactId,
  type ReadinessObservation,
} from "@odp-market-steward/contract-runtime";
import {
  MCP_TOOL_SCHEMAS,
  createMcpToolSchema,
  type ProductProfile,
  type ProductProfileInput,
  type ToolErrorOutput,
  type ValidationLayerResult,
} from "@odp-market-steward/mcp-contracts";
import { componentHtml } from "../../../../generated/component-resource";
import { governedBundle } from "../../../../generated/governed-bundle";
import { mapApplicationToolError } from "./safe-errors";
export {
  MCP_PROTOCOL_ERROR_POLICY,
  mapApplicationToolError,
} from "./safe-errors";

export const COMPONENT_URI =
  "ui://odp-market-steward/product-passport-v0.1.0.html";

let registryPromise: Promise<ContractRegistry> | undefined;

async function loadRegistry(): Promise<ContractRegistry> {
  registryPromise ??= new BundleLoader()
    .load(governedBundle)
    .then((bundle) => new ContractRegistry(bundle));
  return await registryPromise;
}

export interface StewardMcpServerDependencies {
  readonly registry?: ContractRegistry;
  readonly nowUtc?: () => string;
  readonly correlationId?: () => string;
  readonly additionalReadinessObservations?: readonly ReadinessObservation[];
}

export async function createStewardMcpServer(
  dependencies: StewardMcpServerDependencies = {},
): Promise<McpServer> {
  const registry = dependencies.registry ?? (await loadRegistry());
  const profileSource = registry.productProfile();
  const profileTool = registry.mcpTool("get_fx_product_profile");
  assertDescriptorSchemaParity(profileTool.inputSchemaRef, "input");
  assertDescriptorSchemaParity(profileTool.outputSchemaRef, "output");
  const profileInputSchema = createMcpToolSchema<ProductProfileInput>(
    "get_fx_product_profile",
    "input",
  );
  const profileOutputSchema = createMcpToolSchema<ProductProfile>(
    "get_fx_product_profile",
    "output",
  );
  const server = new McpServer(
    {
      name: "odp-market-steward",
      version: "0.1.0",
    },
    {
      instructions:
        "ODP Market Steward is a read-only MARKET DATA DEMO. Clearly distinguish declared product facts from observed runtime evidence and never present output as investment advice.",
    },
  );

  registerAppResource(
    server,
    "ODP Market Steward product passport",
    COMPONENT_URI,
    {
      description:
        "Professional governed-data passport for the FXLive Standard FX-35 MARKET DATA DEMO.",
      mimeType: RESOURCE_MIME_TYPE,
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: [],
          },
        },
      },
    },
    () => ({
      contents: [
        {
          uri: COMPONENT_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: componentHtml,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: [],
              },
            },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    profileTool.name,
    {
      title: profileTool.title,
      description: profileTool.description,
      inputSchema: profileInputSchema,
      outputSchema: profileOutputSchema,
      annotations: profileTool.annotations,
      _meta: profileTool.meta,
    },
    (input: ProductProfileInput) => {
      const generatedAtUtc =
        dependencies.nowUtc?.() ?? new Date().toISOString();
      const validation = profileSource.validation(generatedAtUtc);
      const readiness = registry.readiness({
        operation: "get_fx_product_profile",
        profileSections: input.sections,
        observations: [
          ...readinessObservations(validation.results),
          ...(dependencies.additionalReadinessObservations ?? []),
        ],
      });
      if (readiness.state === "BLOCKED") {
        return mapApplicationToolError(
          contractUnavailableError(
            profileSource.disclaimer,
            dependencies.correlationId?.() ?? opaqueCorrelationId(),
          ),
        );
      }
      const profile = getProductProfile(input, profileSource, generatedAtUtc, {
        state: readiness.state,
        disabledCapabilities:
          readiness.state === "DEGRADED" ? readiness.disabledCapabilities : [],
        nonBlockingFailures: readiness.nonBlockingFailures,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: profile.summary,
          },
        ],
        structuredContent: profile as unknown as Record<string, unknown>,
      };
    },
  );

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: profileTool.name,
        title: profileTool.title,
        description: profileTool.description,
        inputSchema: MCP_TOOL_SCHEMAS.get_fx_product_profile.input,
        outputSchema: MCP_TOOL_SCHEMAS.get_fx_product_profile.output,
        annotations: profileTool.annotations,
        securitySchemes: profileTool.securitySchemes,
        _meta: profileTool.meta,
      },
    ],
  }));

  return server;
}

function readinessObservations(
  results: readonly ValidationLayerResult[],
): readonly ReadinessObservation[] {
  return results.flatMap((result): readonly ReadinessObservation[] => {
    if (
      result.status !== "PASS" &&
      result.status !== "FAIL" &&
      result.status !== "NOT_TESTED"
    ) {
      return [];
    }
    if (!isReadinessArtifactId(result.artifact.artifactId)) {
      throw new Error(
        `Validation result references unknown runtime artifact ${result.artifact.artifactId}.`,
      );
    }
    return [
      {
        artifactId: result.artifact.artifactId,
        layer: result.layer,
        status: result.status,
        evidence: result.evidence,
      },
    ];
  });
}

function isReadinessArtifactId(value: string): value is ReadinessArtifactId {
  return readinessArtifactIds.some((artifactId) => artifactId === value);
}

function contractUnavailableError(
  disclaimer: ToolErrorOutput["disclaimer"],
  correlationId: string,
): ToolErrorOutput {
  return {
    status: "ERROR",
    code: "CONTRACT_UNAVAILABLE",
    message: "Governed contract evidence is unavailable for this request.",
    retryable: false,
    safeNextAction:
      "Retry after the governed contract validation issue has been resolved.",
    correlationId,
    disclaimer,
  };
}

function opaqueCorrelationId(): string {
  return `oms_contract_${crypto.randomUUID().replaceAll("-", "")}`;
}

function assertDescriptorSchemaParity(
  declaredReference: string,
  direction: "input" | "output",
): void {
  const generatedReference =
    MCP_TOOL_SCHEMAS.get_fx_product_profile[direction].$ref;
  const expectedReference = generatedReference.replace(
    "#/$defs/",
    "#/schemas/",
  );
  if (declaredReference !== expectedReference) {
    throw new Error(
      `Generated ${direction} schema root ${generatedReference} does not match governed reference ${declaredReference}.`,
    );
  }
}
