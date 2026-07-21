import {
  BundleValidationError,
  type VerifiedArtifact,
  type VerifiedBundle,
} from "./bundle";

export interface ProductProfileProjection {
  readonly product: string;
  readonly application: "ODP Market Steward";
  readonly classification: "MARKET DATA DEMO";
  readonly timeBasis: "UTC";
  readonly instrumentCount: number;
  readonly standards: readonly string[];
  readonly disclaimer: string;
}

export class ContractRegistry {
  constructor(private readonly bundle: VerifiedBundle) {}

  artifact(id: string): VerifiedArtifact {
    const artifact = this.bundle.artifactsById.get(id);
    if (artifact === undefined) {
      throw new BundleValidationError(
        "POINTER_INVALID",
        `Unknown runtime artifact ID: ${id}`,
      );
    }
    return artifact;
  }

  resolve(id: string, pointer: string): unknown {
    let current = this.artifact(id).document;
    if (pointer === "") return current;
    if (!pointer.startsWith("/")) {
      throw new BundleValidationError(
        "POINTER_INVALID",
        `JSON Pointer must be empty or begin with '/': ${pointer}`,
      );
    }
    for (const encodedSegment of pointer.slice(1).split("/")) {
      const segment = encodedSegment
        .replaceAll("~1", "/")
        .replaceAll("~0", "~");
      if (Array.isArray(current)) {
        const index = Number(segment);
        if (!Number.isInteger(index) || index < 0 || index >= current.length) {
          throw pointerFailure(id, pointer);
        }
        current = current[index];
      } else if (
        typeof current === "object" &&
        current !== null &&
        Object.prototype.hasOwnProperty.call(current, segment)
      ) {
        current = (current as Record<string, unknown>)[segment];
      } else {
        throw pointerFailure(id, pointer);
      }
    }
    return current;
  }

  responsibility(owner: string): unknown {
    const policy = this.bundle.manifest.runtimePolicy.conflictPolicy;
    if (!Object.prototype.hasOwnProperty.call(policy, owner)) {
      throw new BundleValidationError(
        "POINTER_INVALID",
        `Unknown responsibility owner: ${owner}`,
      );
    }
    return policy[owner];
  }

  readiness(): {
    readonly status: "PASS";
    readonly verifiedArtifactCount: number;
    readonly bundleVersion: string;
  } {
    return {
      status: "PASS",
      verifiedArtifactCount: this.bundle.artifactsById.size,
      bundleVersion: this.bundle.manifest.metadata.version,
    };
  }

  productProfile(): ProductProfileProjection {
    const product = asRecord(
      this.resolve("product-contract", "/product/details/en"),
    );
    const publicationIdentity = asRecord(
      this.resolve("publication-policy", "/identity"),
    );
    const disclaimer = asRecord(
      this.resolve("publication-policy", "/disclaimer"),
    );
    const members = this.resolve("instrument-set", "/spec/members");
    if (!Array.isArray(members))
      throw pointerFailure("instrument-set", "/spec/members");
    return {
      product: requiredString(product, "name"),
      application: requiredLiteral(
        publicationIdentity,
        "applicationName",
        "ODP Market Steward",
      ),
      classification: requiredLiteral(disclaimer, "label", "MARKET DATA DEMO"),
      timeBasis: String(this.responsibility("publicPresentation")).includes(
        "publication-policy",
      )
        ? requiredLiteral(
            asRecord(
              this.resolve("publication-policy", "/temporalPresentation"),
            ),
            "timezone",
            "UTC",
          )
        : "UTC",
      instrumentCount: members.length,
      standards: [
        ...this.bundle.manifest.standards.map(
          (standard) => `${standard.abbreviation} ${standard.version}`,
        ),
        "MCP Apps",
      ],
      disclaimer: requiredString(disclaimer, "statement"),
    };
  }
}

function pointerFailure(id: string, pointer: string): BundleValidationError {
  return new BundleValidationError(
    "POINTER_INVALID",
    `Unresolved JSON Pointer ${pointer} in ${id}.`,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BundleValidationError(
      "POINTER_INVALID",
      "Expected an object projection.",
    );
  }
  return value as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string") {
    throw new BundleValidationError(
      "POINTER_INVALID",
      `Expected string field ${key}.`,
    );
  }
  return field;
}

function requiredLiteral<const Literal extends string>(
  value: Record<string, unknown>,
  key: string,
  expected: Literal,
): Literal {
  const field = requiredString(value, key);
  if (field !== expected) {
    throw new BundleValidationError(
      "POINTER_INVALID",
      `Expected ${key} to equal ${expected}.`,
    );
  }
  return expected;
}
