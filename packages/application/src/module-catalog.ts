/**
 * IMPLEMENTED means a buildable focused implementation exists in this increment;
 * it does not claim full DLD feature or release acceptance.
 */
export type ModuleImplementationState = "IMPLEMENTED" | "PORT_DEFINED";

export interface ArchitectureModuleRecord {
  readonly id: `M${string}`;
  readonly name: string;
  readonly source: string;
  readonly state: ModuleImplementationState;
}

export const architectureModuleCatalog = [
  {
    id: "M01",
    name: "EdgeRouter",
    source: "apps/worker/src/routing/edge-router.ts",
    state: "IMPLEMENTED",
  },
  {
    id: "M02",
    name: "SessionIdCodec",
    source: "apps/worker/src/security/session-id-codec.ts",
    state: "PORT_DEFINED",
  },
  {
    id: "M03",
    name: "OdpMarketStewardAgent",
    source: "apps/worker/src/transport/agent.ts",
    state: "IMPLEMENTED",
  },
  {
    id: "M04",
    name: "McpServerFactory",
    source: "apps/worker/src/mcp/server.ts",
    state: "IMPLEMENTED",
  },
  {
    id: "M05",
    name: "BundleLoader",
    source: "packages/contract-runtime/src/bundle.ts",
    state: "IMPLEMENTED",
  },
  {
    id: "M06",
    name: "ContractRegistry",
    source: "packages/contract-runtime/src/registry.ts",
    state: "IMPLEMENTED",
  },
  {
    id: "M07",
    name: "AcknowledgementService",
    source: "packages/application/src/module-ports.ts",
    state: "PORT_DEFINED",
  },
  {
    id: "M08",
    name: "MarketSourceClient",
    source: "packages/adapter-source-api/src/module-port.ts",
    state: "PORT_DEFINED",
  },
  {
    id: "M09",
    name: "SnapshotAssembler",
    source: "packages/application/src/module-ports.ts",
    state: "PORT_DEFINED",
  },
  {
    id: "M10",
    name: "BarNormalizer",
    source: "packages/domain/src/module-ports.ts",
    state: "PORT_DEFINED",
  },
  {
    id: "M11",
    name: "EvaluationEngine",
    source: "packages/domain/src/module-ports.ts",
    state: "PORT_DEFINED",
  },
  {
    id: "M12",
    name: "StateClassifier",
    source: "packages/application/src/module-ports.ts",
    state: "PORT_DEFINED",
  },
  {
    id: "M13",
    name: "EvidenceSelector",
    source: "packages/application/src/module-ports.ts",
    state: "PORT_DEFINED",
  },
  {
    id: "M14",
    name: "ProductDiscoveryService",
    source: "packages/application/src/index.ts",
    state: "IMPLEMENTED",
  },
  {
    id: "M15",
    name: "StewardBriefService",
    source: "packages/application/src/module-ports.ts",
    state: "PORT_DEFINED",
  },
  {
    id: "M16",
    name: "ResultEnvelopeBuilder",
    source: "packages/application/src/module-ports.ts",
    state: "PORT_DEFINED",
  },
  {
    id: "M17",
    name: "TelemetrySanitizer",
    source: "packages/telemetry/src/index.ts",
    state: "IMPLEMENTED",
  },
  {
    id: "M18",
    name: "MarketBoardComponent",
    source: "apps/component/src/main.tsx",
    state: "IMPLEMENTED",
  },
] as const satisfies readonly ArchitectureModuleRecord[];
