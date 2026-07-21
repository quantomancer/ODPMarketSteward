import type { ProductProfile } from "@odp-market-steward/mcp-contracts";

export function getProductProfile(): ProductProfile {
  return {
    product: "FXLive Standard FX-35",
    application: "ODP Market Steward",
    classification: "MARKET DATA DEMO",
    timeBasis: "UTC",
    instrumentCount: 35,
    standards: ["ODPS 4.1", "OpenAPI 3.1.2", "MCP Apps"],
    evidenceMode: "DECLARED_PRODUCT_PROFILE",
    limitations: [
      "This profile contains governed declarations and no current market observation.",
      "It is not investment advice and is not intended for trade execution.",
    ],
  };
}
