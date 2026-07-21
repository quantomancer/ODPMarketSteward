import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { FxLiveClient } from "@odp-market-steward/adapter-source-api";
import {
  GovernedSnapshotAcquirer,
  acknowledgementPolicy,
  disclosureRequired,
  getMarketBoard,
  getProductProfile,
  type GovernedSnapshotAcquirerConfig,
  type GovernedSnapshotSourcePort,
  type SessionAcknowledgementService,
} from "@odp-market-steward/application";
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
  type AcknowledgementInput,
  type AcknowledgementSuccessOutput,
  type MarketBoardInput,
  type MarketBoardSuccessOutput,
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
  readonly marketDataAcknowledged?: () => boolean | Promise<boolean>;
  readonly snapshotSource?: GovernedSnapshotSourcePort;
  readonly snapshotConfig?: GovernedSnapshotAcquirerConfig;
  readonly acknowledgementService?: SessionAcknowledgementService;
}

export async function createStewardMcpServer(
  dependencies: StewardMcpServerDependencies = {},
): Promise<McpServer> {
  const registry = dependencies.registry ?? (await loadRegistry());
  const profileSource = registry.productProfile();
  const profileTool = registry.mcpTool("get_fx_product_profile");
  const boardTool = registry.mcpTool("get_fx_market_board");
  const acknowledgementTool = registry.mcpTool("acknowledge_market_data_demo");
  assertDescriptorSchemaParity(
    "get_fx_product_profile",
    profileTool.inputSchemaRef,
    "input",
  );
  assertDescriptorSchemaParity(
    "acknowledge_market_data_demo",
    acknowledgementTool.inputSchemaRef,
    "input",
  );
  assertDescriptorSchemaParity(
    "acknowledge_market_data_demo",
    acknowledgementTool.outputSchemaRef,
    "output",
  );
  assertDescriptorSchemaParity(
    "get_fx_product_profile",
    profileTool.outputSchemaRef,
    "output",
  );
  assertDescriptorSchemaParity(
    "get_fx_market_board",
    boardTool.inputSchemaRef,
    "input",
  );
  assertDescriptorSchemaParity(
    "get_fx_market_board",
    boardTool.outputSchemaRef,
    "output",
  );
  const profileInputSchema = createMcpToolSchema<ProductProfileInput>(
    "get_fx_product_profile",
    "input",
  );
  const profileOutputSchema = createMcpToolSchema<ProductProfile>(
    "get_fx_product_profile",
    "output",
  );
  const boardInputSchema = createMcpToolSchema<MarketBoardInput>(
    "get_fx_market_board",
    "input",
  );
  const boardOutputSchema = createMcpToolSchema<MarketBoardSuccessOutput>(
    "get_fx_market_board",
    "output",
  );
  const acknowledgementInputSchema = createMcpToolSchema<AcknowledgementInput>(
    "acknowledge_market_data_demo",
    "input",
  );
  const acknowledgementOutputSchema =
    createMcpToolSchema<AcknowledgementSuccessOutput>(
      "acknowledge_market_data_demo",
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

  registerAppTool(
    server,
    boardTool.name,
    {
      title: boardTool.title,
      description: boardTool.description,
      inputSchema: boardInputSchema,
      outputSchema: boardOutputSchema,
      annotations: boardTool.annotations,
      _meta: boardTool.meta,
    },
    async (input: MarketBoardInput) => {
      const requestedAtUtc =
        dependencies.nowUtc?.() ?? new Date().toISOString();
      const policy = acknowledgementPolicy(profileSource.disclaimer);
      const acknowledged =
        (await dependencies.marketDataAcknowledged?.()) ??
        (await dependencies.acknowledgementService?.isAcknowledged(policy)) ??
        false;
      if (!acknowledged) {
        const required = disclosureRequired(
          profileSource.disclaimer,
          requestedAtUtc,
        );
        const challenge =
          await dependencies.acknowledgementService?.issue(policy);
        return {
          content: [{ type: "text" as const, text: required.summary }],
          structuredContent: required as unknown as Record<string, unknown>,
          ...(challenge === undefined
            ? {}
            : {
                _meta: {
                  "odpMarketSteward/acknowledgementChallenge": challenge,
                  "odpMarketSteward/pendingRequest": {
                    requestId: `oms_pending_${crypto.randomUUID().replaceAll("-", "")}`,
                    toolName: "get_fx_market_board",
                    validatedArguments: input,
                  },
                },
              }),
        };
      }
      const validation = profileSource.validation(requestedAtUtc);
      const readiness = registry.readiness({
        operation: "get_fx_market_board",
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
      const source =
        dependencies.snapshotSource ??
        new FxLiveClient({
          timeoutMilliseconds: 3_500,
          maximumResponseBytes: 65_536,
        });
      const acquirer = new GovernedSnapshotAcquirer(
        source,
        dependencies.snapshotConfig ?? {
          maximumConcurrency: 6,
          maximumCallsPerInvocation: 74,
          allowOneFullRolloverReread: true,
        },
      );
      const instrumentSet = registry.instrumentSet();
      const ohlcRulesArtifact = profileSource.artifacts.find(
        (artifact) => artifact.artifactId === "ohlc-rules",
      );
      if (ohlcRulesArtifact === undefined) {
        return mapApplicationToolError(
          contractUnavailableError(
            profileSource.disclaimer,
            dependencies.correlationId?.() ?? opaqueCorrelationId(),
          ),
        );
      }
      const board = await getMarketBoard(input, {
        profile: profileSource,
        instruments: instrumentSet.members.map((member) => member.symbol),
        ohlcRulesArtifact,
        acquirer,
        requestedAtUtc,
        completedAtUtc: () =>
          dependencies.nowUtc?.() ?? new Date().toISOString(),
      });
      return {
        content: [{ type: "text" as const, text: board.summary }],
        structuredContent: board as unknown as Record<string, unknown>,
      };
    },
  );

  registerAppTool(
    server,
    acknowledgementTool.name,
    {
      title: acknowledgementTool.title,
      description: acknowledgementTool.description,
      inputSchema: acknowledgementInputSchema,
      outputSchema: acknowledgementOutputSchema,
      annotations: acknowledgementTool.annotations,
      _meta: acknowledgementTool.meta,
    },
    async (input: AcknowledgementInput) => {
      const service = dependencies.acknowledgementService;
      if (service === undefined) {
        return mapApplicationToolError(
          invalidSessionError(
            profileSource.disclaimer,
            dependencies.correlationId?.() ?? opaqueCorrelationId(),
          ),
        );
      }
      const policy = acknowledgementPolicy(profileSource.disclaimer);
      const committed = await service.commit(input, policy);
      if (committed.status === "REJECTED") {
        const required = disclosureRequired(
          profileSource.disclaimer,
          dependencies.nowUtc?.() ?? new Date().toISOString(),
        );
        const rejected = {
          ...required,
          evidence: {
            ...required.evidence,
            reason: `ACKNOWLEDGEMENT_${committed.reason}`,
          },
        };
        return {
          content: [{ type: "text" as const, text: rejected.summary }],
          structuredContent: rejected as unknown as Record<string, unknown>,
        };
      }
      const output: AcknowledgementSuccessOutput = {
        status: "ACKNOWLEDGED",
        policyVersion: "1.2.0",
        disclaimerDigest: committed.disclaimerDigest,
        acknowledgedAtUtc: committed.acknowledgedAtUtc,
        disclaimer: profileSource.disclaimer,
        nextAction:
          "Reissue the previously validated pending market-data request.",
      };
      return {
        content: [
          {
            type: "text" as const,
            text: "Market Data Demo acknowledgement recorded for this MCP session.",
          },
        ],
        structuredContent: output as unknown as Record<string, unknown>,
      };
    },
  );

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: acknowledgementTool.name,
        title: acknowledgementTool.title,
        description: acknowledgementTool.description,
        inputSchema: MCP_TOOL_SCHEMAS.acknowledge_market_data_demo.input,
        outputSchema: MCP_TOOL_SCHEMAS.acknowledge_market_data_demo.output,
        annotations: acknowledgementTool.annotations,
        securitySchemes: acknowledgementTool.securitySchemes,
        _meta: acknowledgementTool.meta,
      },
      {
        name: boardTool.name,
        title: boardTool.title,
        description: boardTool.description,
        inputSchema: MCP_TOOL_SCHEMAS.get_fx_market_board.input,
        outputSchema: MCP_TOOL_SCHEMAS.get_fx_market_board.output,
        annotations: boardTool.annotations,
        securitySchemes: boardTool.securitySchemes,
        _meta: boardTool.meta,
      },
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

function invalidSessionError(
  disclaimer: ToolErrorOutput["disclaimer"],
  correlationId: string,
): ToolErrorOutput {
  return {
    status: "ERROR",
    code: "INVALID_SESSION",
    message: "Acknowledgement state is unavailable for this MCP session.",
    retryable: false,
    safeNextAction:
      "Reinitialize the MCP session and review the disclosure again.",
    correlationId,
    disclaimer,
  };
}

function opaqueCorrelationId(): string {
  return `oms_contract_${crypto.randomUUID().replaceAll("-", "")}`;
}

function assertDescriptorSchemaParity(
  tool:
    | "acknowledge_market_data_demo"
    | "get_fx_market_board"
    | "get_fx_product_profile",
  declaredReference: string,
  direction: "input" | "output",
): void {
  const generatedReference = MCP_TOOL_SCHEMAS[tool][direction].$ref;
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
