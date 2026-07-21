import type {
  ArtifactPointer,
  Disclaimer,
  GovernanceValidation,
  ProductDeclaration,
  ProductProfile,
  ProductProfileInput,
  ProductProfileSection,
} from "@odp-market-steward/mcp-contracts";

export * from "./module-catalog";
export * from "./module-ports";

export interface ProductProfileSource {
  readonly productName: string;
  readonly productId: "fxlive-market-data-demo-fx35";
  readonly productVersion: string;
  readonly bundleVersion: string;
  readonly odpsVersion: 4.1;
  readonly artifactDigest: string;
  readonly artifacts: readonly ArtifactPointer[];
  readonly disclaimer: Disclaimer;
  declaration(section: ProductProfileSection): ProductDeclaration;
  validation(evaluatedAtUtc: string): GovernanceValidation;
}

export function getProductProfile(
  input: ProductProfileInput,
  source: ProductProfileSource,
  generatedAtUtc: string,
): ProductProfile {
  const validation = source.validation(generatedAtUtc);
  return {
    summary: `${source.productName}: governed declarations for ${input.sections.join(", ")}. No market-data network request was made.`,
    governance: {
      productId: source.productId,
      productVersion: source.productVersion,
      bundleVersion: source.bundleVersion,
      odpsVersion: source.odpsVersion,
      artifacts: source.artifacts,
      validation,
    },
    generatedAtUtc,
    productId: source.productId,
    productVersion: source.productVersion,
    odpsVersion: source.odpsVersion,
    artifactDigest: source.artifactDigest,
    declarations: input.sections.map((section) => source.declaration(section)),
    validation,
    disclaimer: source.disclaimer,
  };
}
