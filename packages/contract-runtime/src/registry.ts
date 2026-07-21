import {
  BundleValidationError,
  type VerifiedArtifact,
  type VerifiedBundle,
} from "./bundle";

export interface ArtifactPointerProjection {
  readonly artifactId: string;
  readonly artifactVersion: string;
  readonly path: string;
  readonly sha256: string;
}

export type ProductProfileSection =
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

export interface ProductDeclarationProjection {
  readonly artifact: ArtifactPointerProjection;
  readonly pointer: string;
  readonly value: unknown;
}

export interface ProductProfileProjection {
  readonly productName: string;
  readonly productId: "fxlive-market-data-demo-fx35";
  readonly productVersion: string;
  readonly bundleVersion: string;
  readonly odpsVersion: 4.1;
  readonly artifactDigest: string;
  readonly artifacts: readonly ArtifactPointerProjection[];
  readonly disclaimer: {
    readonly label: "MARKET DATA DEMO";
    readonly statement: string;
    readonly policyVersion: string;
  };
  declaration(section: ProductProfileSection): ProductDeclarationProjection;
  validation(evaluatedAtUtc: string): GovernanceValidationProjection;
}

export interface GovernanceValidationProjection {
  readonly evaluatedAtUtc: string;
  readonly completeForRequiredLayers: false;
  readonly summary: {
    readonly passed: 3;
    readonly failed: 0;
    readonly warnings: 0;
    readonly notApplicable: 0;
    readonly notTested: 3;
  };
  readonly results: readonly ValidationLayerProjection[];
}

export interface ValidationLayerProjection {
  readonly artifact: ArtifactPointerProjection;
  readonly layer:
    | "syntax"
    | "controlling-schema"
    | "semantic-policy"
    | "cross-reference"
    | "source-alignment"
    | "sdk-compatibility";
  readonly status: "PASS" | "NOT_TESTED";
  readonly validatorName: string;
  readonly validatorVersion: string;
  readonly evaluatedAtUtc: string;
  readonly schemaUri: string | null;
  readonly schemaSha256: null;
  readonly evidence: readonly string[];
}

export interface McpToolProjection {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly destructiveHint: boolean;
    readonly openWorldHint: boolean;
    readonly idempotentHint: boolean;
  };
  readonly securitySchemes: readonly { readonly type: "noauth" }[];
  readonly meta: Readonly<Record<string, unknown>>;
  readonly inputSchemaRef: string;
  readonly outputSchemaRef: string;
  readonly consumes: readonly string[];
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
    const disclaimer = asRecord(
      this.resolve("publication-policy", "/disclaimer"),
    );
    const productArtifact = this.artifact("product-contract");
    const policyArtifact = this.artifact("publication-policy");
    const productId = requiredLiteral(
      product,
      "productID",
      "fxlive-market-data-demo-fx35",
    );
    const productVersion = requiredString(product, "productVersion");
    const odpsVersion = requiredNumber(
      asRecord(productArtifact.document),
      "version",
      4.1,
    );
    const declarations: Readonly<
      Record<ProductProfileSection, readonly [string, string]>
    > = {
      identity: ["product-contract", "/product/details/en"],
      purpose: ["product-contract", "/product/details/en/valueProposition"],
      use_cases: ["product-contract", "/product/details/en/useCases"],
      access: ["product-contract", "/product/dataAccess/default"],
      SLA: ["product-contract", "/product/SLA/declarative/default"],
      quality: ["product-contract", "/product/dataQuality"],
      instruments: ["instrument-set", "/spec/members"],
      monitoring: ["monitoring", "/spec"],
      calculations: ["ohlc-rules", "/spec"],
      publication: ["publication-policy", "/identity"],
      limitations: ["publication-policy", "/contentBoundaries/prohibited"],
      validation: [
        "mcp-application-contract",
        "/marketResultStateContract/validation",
      ],
    };
    return {
      productName: requiredString(product, "name"),
      productId,
      productVersion,
      bundleVersion: this.bundle.manifest.metadata.version,
      odpsVersion,
      artifactDigest: productArtifact.observedSha256,
      artifacts: [...this.bundle.artifactsById.values()].map(artifactPointer),
      disclaimer: {
        label: requiredLiteral(disclaimer, "label", "MARKET DATA DEMO"),
        statement: requiredString(disclaimer, "statement"),
        policyVersion: policyArtifact.declaration.artifactVersion,
      },
      declaration: (section) => {
        const [artifactId, pointer] = declarations[section];
        return {
          artifact: artifactPointer(this.artifact(artifactId)),
          pointer,
          value: this.resolve(artifactId, pointer),
        };
      },
      validation: (evaluatedAtUtc) => this.governanceValidation(evaluatedAtUtc),
    };
  }

  mcpTool(name: string): McpToolProjection {
    const tools = this.resolve("mcp-application-contract", "/tools");
    if (!Array.isArray(tools)) {
      throw pointerFailure("mcp-application-contract", "/tools");
    }
    const tool: unknown = tools.find(
      (candidate: unknown) =>
        typeof candidate === "object" &&
        candidate !== null &&
        (candidate as { name?: unknown }).name === name,
    );
    if (tool === undefined) {
      throw new BundleValidationError(
        "POINTER_INVALID",
        `Unknown MCP tool contract: ${name}`,
      );
    }
    const record = asRecord(tool);
    const annotations = asRecord(record.annotations);
    const inputSchema = asRecord(record.inputSchema);
    const outputSchema = asRecord(record.outputSchema);
    const securitySchemes = record.securitySchemes;
    const consumes = record.consumes;
    if (
      !Array.isArray(securitySchemes) ||
      !securitySchemes.every(
        (scheme) => isRecord(scheme) && scheme.type === "noauth",
      ) ||
      !Array.isArray(consumes) ||
      !consumes.every((artifact) => typeof artifact === "string")
    ) {
      throw new BundleValidationError(
        "POINTER_INVALID",
        `MCP tool ${name} has invalid security or consumption metadata.`,
      );
    }
    for (const artifactId of consumes) this.artifact(artifactId);
    return {
      name: requiredString(record, "name"),
      title: requiredString(record, "title"),
      description: requiredString(record, "description"),
      annotations: {
        readOnlyHint: requiredBoolean(annotations, "readOnlyHint"),
        destructiveHint: requiredBoolean(annotations, "destructiveHint"),
        openWorldHint: requiredBoolean(annotations, "openWorldHint"),
        idempotentHint: requiredBoolean(annotations, "idempotentHint"),
      },
      securitySchemes: securitySchemes.map(() => ({ type: "noauth" as const })),
      meta: asRecord(record._meta),
      inputSchemaRef: requiredString(inputSchema, "$ref"),
      outputSchemaRef: requiredString(outputSchema, "$ref"),
      consumes,
    };
  }

  private governanceValidation(
    evaluatedAtUtc: string,
  ): GovernanceValidationProjection {
    const result = (
      artifactId: string,
      layer: ValidationLayerProjection["layer"],
      status: ValidationLayerProjection["status"],
      validatorName: string,
      evidence: string,
      schemaUri: string | null = null,
    ): ValidationLayerProjection => ({
      artifact: artifactPointer(this.artifact(artifactId)),
      layer,
      status,
      validatorName,
      validatorVersion: "0.1.0",
      evaluatedAtUtc,
      schemaUri,
      schemaSha256: null,
      evidence: [evidence],
    });
    return {
      evaluatedAtUtc,
      completeForRequiredLayers: false,
      summary: {
        passed: 3,
        failed: 0,
        warnings: 0,
        notApplicable: 0,
        notTested: 3,
      },
      results: [
        result(
          "product-contract",
          "syntax",
          "PASS",
          "BundleLoader strict YAML parser",
          "All seven runtime-required artifacts parsed with duplicate-key rejection before linking.",
        ),
        result(
          "product-contract",
          "controlling-schema",
          "NOT_TESTED",
          "Controlling schema validator",
          "The runtime loader does not claim an ODPS controlling-schema validation run.",
          "https://opendataproducts.org/v4.1/schema/odps.yaml",
        ),
        result(
          "publication-policy",
          "semantic-policy",
          "PASS",
          "ContractRegistry policy projection",
          "The exact MARKET DATA DEMO label, disclaimer statement, policy version, and governed profile identity were resolved from verified artifacts.",
        ),
        result(
          "mcp-application-contract",
          "cross-reference",
          "PASS",
          "BundleLoader two-phase linker",
          "Runtime paths, dependency graph, declared versions, load order, and SHA-256 digests were linked and verified.",
        ),
        result(
          "api-contract",
          "source-alignment",
          "NOT_TESTED",
          "Source alignment validator",
          "This network-free product-profile call performs no source API alignment test.",
        ),
        result(
          "product-contract",
          "sdk-compatibility",
          "NOT_TESTED",
          "ODP SDK compatibility validator",
          "No ODP SDK compatibility run is performed during this product-profile call.",
        ),
      ],
    };
  }
}

function artifactPointer(
  artifact: VerifiedArtifact,
): ArtifactPointerProjection {
  return {
    artifactId: artifact.declaration.id,
    artifactVersion: artifact.declaration.artifactVersion,
    path: artifact.declaration.path,
    sha256: artifact.observedSha256,
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function requiredBoolean(value: Record<string, unknown>, key: string): boolean {
  const field = value[key];
  if (typeof field !== "boolean") {
    throw new BundleValidationError(
      "POINTER_INVALID",
      `Expected boolean field ${key}.`,
    );
  }
  return field;
}

function requiredNumber<const NumberLiteral extends number>(
  value: Record<string, unknown>,
  key: string,
  expected: NumberLiteral,
): NumberLiteral {
  const field = value[key];
  if (field !== expected) {
    throw new BundleValidationError(
      "POINTER_INVALID",
      `Expected ${key} to equal ${expected}.`,
    );
  }
  return expected;
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
