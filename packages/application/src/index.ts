import type { ProductProfile } from "@odp-market-steward/mcp-contracts";

export * from "./module-catalog";
export * from "./module-ports";

export interface ProductProfileSource {
  readonly product: string;
  readonly application: "ODP Market Steward";
  readonly classification: "MARKET DATA DEMO";
  readonly timeBasis: "UTC";
  readonly instrumentCount: number;
  readonly standards: readonly string[];
}

export function getProductProfile(
  source: ProductProfileSource,
): ProductProfile {
  return {
    product: source.product,
    application: source.application,
    classification: source.classification,
    timeBasis: source.timeBasis,
    instrumentCount: source.instrumentCount,
    standards: [...source.standards],
    evidenceMode: "DECLARED_PRODUCT_PROFILE",
    limitations: [
      "This profile contains governed declarations and no current market observation.",
      "It is not investment advice and is not intended for trade execution.",
    ],
  };
}
