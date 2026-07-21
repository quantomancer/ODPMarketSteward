import {
  classifyContractReadiness,
  type ContractReadinessInput,
  type ReadinessArtifactId,
  type ReadinessObservation,
} from "../../packages/contract-runtime/src/index";
import { describe, expect, it } from "vitest";

const verifiedArtifactIds = new Set<ReadinessArtifactId>([
  "bundle-manifest",
  "product-contract",
  "api-contract",
  "instrument-set",
  "ohlc-rules",
  "monitoring",
  "publication-policy",
  "mcp-application-contract",
]);

function classify(
  input: Omit<
    ContractReadinessInput,
    "bundleVersion" | "verifiedArtifactIds"
  > & {
    readonly verifiedArtifactIds?: ReadonlySet<ReadinessArtifactId>;
  },
) {
  return classifyContractReadiness({
    bundleVersion: "1.2.0",
    verifiedArtifactIds: input.verifiedArtifactIds ?? verifiedArtifactIds,
    ...input,
  });
}

function failure(
  artifactId: ReadinessArtifactId,
  layer: ReadinessObservation["layer"] = "semantic-policy",
): ReadinessObservation {
  return {
    artifactId,
    layer,
    status: "FAIL",
    evidence: [`fixture:${artifactId}:${layer}`],
  };
}

describe("operation-specific bundle readiness and criticality", () => {
  it.each([
    {
      caseName: "all required profile identity inputs are verified",
      request: {
        operation: "get_fx_product_profile" as const,
        profileSections: ["identity"] as const,
      },
      expectedState: "READY",
    },
    {
      caseName: "API failure is non-blocking for isolated product identity",
      request: {
        operation: "get_fx_product_profile" as const,
        profileSections: ["identity"] as const,
        observations: [failure("api-contract")],
      },
      expectedState: "READY",
    },
    {
      caseName: "API failure blocks a profile access declaration",
      request: {
        operation: "get_fx_product_profile" as const,
        profileSections: ["access"] as const,
        observations: [failure("api-contract")],
      },
      expectedState: "BLOCKED",
    },
    {
      caseName: "instrument-set failure blocks a market board",
      request: {
        operation: "get_fx_market_board" as const,
        observations: [failure("instrument-set")],
      },
      expectedState: "BLOCKED",
    },
    {
      caseName: "rules failure blocks the unproven raw market path",
      request: {
        operation: "get_fx_instrument" as const,
        observations: [failure("ohlc-rules")],
      },
      expectedState: "BLOCKED",
    },
    {
      caseName: "monitoring failure blocks governed assessment",
      request: {
        operation: "assess_fx_data_service" as const,
        observations: [failure("monitoring")],
      },
      expectedState: "BLOCKED",
    },
    {
      caseName: "publication failure blocks acknowledgement",
      request: {
        operation: "acknowledge_market_data_demo" as const,
        observations: [failure("publication-policy")],
      },
      expectedState: "BLOCKED",
    },
    {
      caseName: "missing manifest blocks every operation",
      request: {
        operation: "get_fx_product_profile" as const,
        profileSections: ["identity"] as const,
        verifiedArtifactIds: new Set<ReadinessArtifactId>(
          [...verifiedArtifactIds].filter(
            (artifactId) => artifactId !== "bundle-manifest",
          ),
        ),
      },
      expectedState: "BLOCKED",
    },
    {
      caseName: "required SDK evidence stays explicitly degraded",
      request: {
        operation: "get_fx_product_profile" as const,
        profileSections: ["identity"] as const,
        observations: [
          {
            artifactId: "product-contract" as const,
            layer: "sdk-compatibility" as const,
            status: "NOT_TESTED" as const,
          },
        ],
      },
      expectedState: "DEGRADED",
    },
  ])("classifies $caseName as $expectedState", ({ request, expectedState }) => {
    const result = classify(request);
    expect(result.state).toBe(expectedState);
  });

  it("discloses non-blocking failures during safe profile continuation", () => {
    const result = classify({
      operation: "get_fx_product_profile",
      profileSections: ["identity"],
      observations: [failure("api-contract", "controlling-schema")],
    });

    expect(result).toMatchObject({
      state: "READY",
      nonBlockingFailures: [
        {
          artifactId: "api-contract",
          layer: "controlling-schema",
          status: "FAIL",
        },
      ],
    });
  });

  it("reports every blocking reason instead of hiding additional failures", () => {
    const result = classify({
      operation: "summarize_fx_movements",
      observations: [
        failure("instrument-set", "cross-reference"),
        failure("ohlc-rules", "semantic-policy"),
      ],
    });

    expect(result).toMatchObject({
      state: "BLOCKED",
      reasons: [
        { artifactId: "instrument-set", layer: "cross-reference" },
        { artifactId: "ohlc-rules", layer: "semantic-policy" },
      ],
    });
  });

  it("names disabled claims when required evidence is not tested", () => {
    const result = classify({
      operation: "get_fx_product_profile",
      profileSections: ["access"],
      observations: [
        {
          artifactId: "product-contract",
          layer: "sdk-compatibility",
          status: "NOT_TESTED",
        },
        {
          artifactId: "api-contract",
          layer: "source-alignment",
          status: "NOT_TESTED",
        },
      ],
    });

    expect(result).toMatchObject({
      state: "DEGRADED",
      disabledCapabilities: [
        "CERTIFICATION_CLAIMS",
        "SDK_COMPATIBILITY_CLAIMS",
        "SOURCE_ALIGNMENT_CLAIMS",
      ],
    });
  });
});
