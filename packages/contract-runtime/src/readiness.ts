export const operationKinds = [
  "acknowledge_market_data_demo",
  "get_fx_product_profile",
  "get_fx_market_board",
  "get_fx_instrument",
  "summarize_fx_movements",
  "assess_fx_data_service",
] as const;

export type OperationKind = (typeof operationKinds)[number];

export const readinessArtifactIds = [
  "bundle-manifest",
  "product-contract",
  "api-contract",
  "instrument-set",
  "ohlc-rules",
  "monitoring",
  "publication-policy",
  "mcp-application-contract",
] as const;

export type ReadinessArtifactId = (typeof readinessArtifactIds)[number];

export type ReadinessLayer =
  | "runtime-integrity"
  | "syntax"
  | "controlling-schema"
  | "semantic-policy"
  | "cross-reference"
  | "source-alignment"
  | "sdk-compatibility";

export interface ReadinessObservation {
  readonly artifactId: ReadinessArtifactId;
  readonly layer: ReadinessLayer;
  readonly status: "PASS" | "FAIL" | "NOT_TESTED";
  readonly evidence?: readonly string[];
}

export type ProfileSection =
  | "identity"
  | "purpose"
  | "use_cases"
  | "access"
  | "SLA"
  | "quality"
  | "instruments"
  | "monitoring"
  | "calculations"
  | "publication"
  | "limitations"
  | "validation";

export interface ContractReadinessRequest {
  readonly operation: OperationKind;
  readonly profileSections?: readonly ProfileSection[];
  readonly observations?: readonly ReadinessObservation[];
}

export interface ContractFailure {
  readonly artifactId: ReadinessArtifactId;
  readonly layer: ReadinessLayer;
  readonly status: "FAIL" | "MISSING";
  readonly message: string;
  readonly evidence: readonly string[];
}

export type DisabledCapability =
  | "CERTIFICATION_CLAIMS"
  | "SDK_COMPATIBILITY_CLAIMS"
  | "SOURCE_ALIGNMENT_CLAIMS";

interface ReadinessBase {
  readonly operation: OperationKind;
  readonly bundleVersion: string;
  readonly requiredArtifacts: readonly ReadinessArtifactId[];
  readonly nonBlockingFailures: readonly ContractFailure[];
}

export type ContractReadiness =
  | (ReadinessBase & { readonly state: "READY" })
  | (ReadinessBase & {
      readonly state: "DEGRADED";
      readonly disabledCapabilities: readonly DisabledCapability[];
      readonly notTested: readonly ReadinessObservation[];
    })
  | (ReadinessBase & {
      readonly state: "BLOCKED";
      readonly reasons: readonly ContractFailure[];
    });

export interface ContractReadinessInput extends ContractReadinessRequest {
  readonly bundleVersion: string;
  readonly verifiedArtifactIds: ReadonlySet<ReadinessArtifactId>;
}

const commonArtifacts = [
  "bundle-manifest",
  "publication-policy",
  "mcp-application-contract",
] as const satisfies readonly ReadinessArtifactId[];

const marketArtifacts = [
  ...commonArtifacts,
  "product-contract",
  "api-contract",
  "instrument-set",
  "ohlc-rules",
  "monitoring",
] as const satisfies readonly ReadinessArtifactId[];

const allProfileSections = [
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
] as const satisfies readonly ProfileSection[];

const profileSectionArtifacts: Readonly<
  Record<ProfileSection, readonly ReadinessArtifactId[]>
> = {
  identity: ["product-contract"],
  purpose: ["product-contract"],
  use_cases: ["product-contract"],
  access: ["product-contract", "api-contract"],
  SLA: ["product-contract"],
  quality: ["product-contract"],
  instruments: ["instrument-set"],
  monitoring: ["monitoring"],
  calculations: ["ohlc-rules"],
  publication: ["publication-policy"],
  limitations: ["publication-policy"],
  validation: ["mcp-application-contract"],
};

export function classifyContractReadiness(
  input: ContractReadinessInput,
): ContractReadiness {
  const requiredArtifacts = requiredArtifactsFor(input);
  const requiredSet = new Set(requiredArtifacts);
  const observations = input.observations ?? [];
  const reasons: ContractFailure[] = [];
  const nonBlockingFailures: ContractFailure[] = [];

  for (const artifactId of requiredArtifacts) {
    if (!input.verifiedArtifactIds.has(artifactId)) {
      reasons.push({
        artifactId,
        layer: "runtime-integrity",
        status: "MISSING",
        message: `Required artifact ${artifactId} is not verified for ${input.operation}.`,
        evidence: [],
      });
    }
  }

  for (const observation of observations) {
    if (observation.status !== "FAIL") continue;
    const failure = observationFailure(observation);
    if (requiredSet.has(observation.artifactId)) reasons.push(failure);
    else nonBlockingFailures.push(failure);
  }

  if (reasons.length > 0) {
    return {
      state: "BLOCKED",
      operation: input.operation,
      bundleVersion: input.bundleVersion,
      requiredArtifacts,
      nonBlockingFailures,
      reasons,
    };
  }

  const notTested = observations.filter(
    (observation) =>
      observation.status === "NOT_TESTED" &&
      requiredSet.has(observation.artifactId),
  );
  if (notTested.length > 0) {
    return {
      state: "DEGRADED",
      operation: input.operation,
      bundleVersion: input.bundleVersion,
      requiredArtifacts,
      nonBlockingFailures,
      disabledCapabilities: disabledCapabilitiesFor(notTested),
      notTested,
    };
  }

  return {
    state: "READY",
    operation: input.operation,
    bundleVersion: input.bundleVersion,
    requiredArtifacts,
    nonBlockingFailures,
  };
}

function requiredArtifactsFor(
  input: ContractReadinessRequest,
): readonly ReadinessArtifactId[] {
  if (input.operation === "acknowledge_market_data_demo") {
    return [...commonArtifacts];
  }
  if (input.operation !== "get_fx_product_profile") {
    return [...marketArtifacts];
  }

  const sections = input.profileSections ?? allProfileSections;
  const required = new Set<ReadinessArtifactId>(commonArtifacts);
  for (const section of sections) {
    for (const artifactId of profileSectionArtifacts[section]) {
      required.add(artifactId);
    }
  }
  return readinessArtifactIds.filter((artifactId) => required.has(artifactId));
}

function observationFailure(
  observation: ReadinessObservation,
): ContractFailure {
  return {
    artifactId: observation.artifactId,
    layer: observation.layer,
    status: "FAIL",
    message: `${observation.artifactId} failed ${observation.layer} validation.`,
    evidence: observation.evidence ?? [],
  };
}

function disabledCapabilitiesFor(
  observations: readonly ReadinessObservation[],
): readonly DisabledCapability[] {
  const disabled = new Set<DisabledCapability>(["CERTIFICATION_CLAIMS"]);
  for (const observation of observations) {
    if (observation.layer === "sdk-compatibility") {
      disabled.add("SDK_COMPATIBILITY_CLAIMS");
    }
    if (observation.layer === "source-alignment") {
      disabled.add("SOURCE_ALIGNMENT_CLAIMS");
    }
  }
  return [
    "CERTIFICATION_CLAIMS",
    "SDK_COMPATIBILITY_CLAIMS",
    "SOURCE_ALIGNMENT_CLAIMS",
  ].filter((capability): capability is DisabledCapability =>
    disabled.has(capability as DisabledCapability),
  );
}
