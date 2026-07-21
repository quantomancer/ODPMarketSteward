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
export * from "./acknowledgement";
export * from "./governed-snapshot-acquirer";
export * from "./market-board";
export * from "./snapshot-assembler";

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

export interface ProductProfileReadinessContext {
  readonly state: "READY" | "DEGRADED";
  readonly disabledCapabilities: readonly string[];
  readonly nonBlockingFailures: readonly {
    readonly artifactId: string;
    readonly layer: string;
  }[];
}

export function getProductProfile(
  input: ProductProfileInput,
  source: ProductProfileSource,
  generatedAtUtc: string,
  readiness: ProductProfileReadinessContext,
): ProductProfile {
  const validation = source.validation(generatedAtUtc);
  return {
    summary: profileSummary(source.productName, input, readiness),
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

function profileSummary(
  productName: string,
  input: ProductProfileInput,
  readiness: ProductProfileReadinessContext,
): string {
  const sentences = [
    `${productName}: governed declarations for ${input.sections.join(", ")}.`,
    "No market-data network request was made.",
  ];
  if (readiness.state === "DEGRADED") {
    sentences.push(
      `Readiness is DEGRADED; disabled claims: ${readiness.disabledCapabilities.join(", ")}.`,
    );
  }
  if (readiness.nonBlockingFailures.length > 0) {
    sentences.push(
      `Non-blocking contract failures: ${readiness.nonBlockingFailures
        .map((failure) => `${failure.artifactId}/${failure.layer}`)
        .join(", ")}.`,
    );
  }
  return sentences.join(" ");
}
