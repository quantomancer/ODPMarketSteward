import { parseDocument } from "yaml";

export type BundleFailureCode =
  | "DEPENDENCY_GRAPH_INVALID"
  | "DIGEST_MISMATCH"
  | "DUPLICATE_KEY_OR_YAML_INVALID"
  | "MANIFEST_INVALID"
  | "PATH_INVALID"
  | "POINTER_INVALID"
  | "VERSION_MISMATCH";

export class BundleValidationError extends Error {
  constructor(
    readonly code: BundleFailureCode,
    message: string,
    readonly artifactPath?: string,
  ) {
    super(message);
    this.name = "BundleValidationError";
  }
}

export interface EmbeddedGovernedBundle {
  readonly manifestPath: "bundle.yaml";
  readonly manifestYaml: string;
  readonly files: Readonly<Record<string, string>>;
}

export interface BundleArtifactDeclaration {
  readonly id: string;
  readonly path: string;
  readonly role: string;
  readonly artifactVersion: string;
  readonly sha256: string;
  readonly requiredAtRuntime: boolean;
  readonly dependsOn: readonly string[];
}

export interface BundleManifest {
  readonly metadata: {
    readonly id: string;
    readonly version: string;
  };
  readonly standards: readonly {
    readonly abbreviation: string;
    readonly version: string;
  }[];
  readonly artifacts: readonly BundleArtifactDeclaration[];
  readonly runtimePolicy: {
    readonly resolutionMode: "two_phase_parse_then_link";
    readonly loadOrder: readonly string[];
    readonly conflictPolicy: Readonly<Record<string, unknown>>;
  };
}

export interface VerifiedArtifact {
  readonly declaration: BundleArtifactDeclaration;
  readonly document: unknown;
  readonly observedSha256: string;
}

export interface VerifiedBundle {
  readonly manifest: BundleManifest;
  readonly artifactsById: ReadonlyMap<string, VerifiedArtifact>;
  readonly artifactsByPath: ReadonlyMap<string, VerifiedArtifact>;
}

export class BundleLoader {
  async load(embedded: EmbeddedGovernedBundle): Promise<VerifiedBundle> {
    // Phase 1: parse every exact embedded runtime input without resolving links.
    const manifest = parseStrictYaml(
      embedded.manifestYaml,
      embedded.manifestPath,
    ) as BundleManifest;
    assertManifest(manifest);

    const runtimeDeclarations = manifest.artifacts.filter(
      (artifact) => artifact.requiredAtRuntime,
    );
    const expectedLoadOrder = [
      embedded.manifestPath,
      ...runtimeDeclarations.map((artifact) => artifact.path),
    ];
    if (
      manifest.runtimePolicy.resolutionMode !== "two_phase_parse_then_link" ||
      JSON.stringify(manifest.runtimePolicy.loadOrder) !==
        JSON.stringify(expectedLoadOrder)
    ) {
      throw new BundleValidationError(
        "MANIFEST_INVALID",
        "Runtime load order must contain bundle.yaml followed by every runtime artifact in declaration order.",
      );
    }

    const parsedByPath = new Map<string, unknown>();
    for (const declaration of runtimeDeclarations) {
      assertSafeBundlePath(declaration.path);
      const bytes = embedded.files[declaration.path];
      if (bytes === undefined) {
        throw new BundleValidationError(
          "PATH_INVALID",
          `Embedded runtime artifact is missing: ${declaration.path}`,
          declaration.path,
        );
      }
      parsedByPath.set(
        declaration.path,
        parseStrictYaml(bytes, declaration.path),
      );
    }

    // Phase 2: link declarations, dependencies, versions, and byte digests.
    assertDependencyGraph(runtimeDeclarations);
    const artifactsById = new Map<string, VerifiedArtifact>();
    const artifactsByPath = new Map<string, VerifiedArtifact>();
    for (const declaration of runtimeDeclarations) {
      const bytes = embedded.files[declaration.path];
      if (bytes === undefined) {
        throw new BundleValidationError(
          "PATH_INVALID",
          `Embedded runtime artifact is missing: ${declaration.path}`,
          declaration.path,
        );
      }
      const observedSha256 = await sha256(bytes);
      if (observedSha256 !== declaration.sha256) {
        throw new BundleValidationError(
          "DIGEST_MISMATCH",
          `Digest mismatch for ${declaration.path}: expected ${declaration.sha256}, observed ${observedSha256}.`,
          declaration.path,
        );
      }
      const document = parsedByPath.get(declaration.path);
      const observedVersion = readArtifactVersion(declaration.id, document);
      if (observedVersion !== declaration.artifactVersion) {
        throw new BundleValidationError(
          "VERSION_MISMATCH",
          `Version mismatch for ${declaration.path}: expected ${declaration.artifactVersion}, observed ${observedVersion ?? "missing"}.`,
          declaration.path,
        );
      }
      const verified = { declaration, document, observedSha256 };
      artifactsById.set(declaration.id, verified);
      artifactsByPath.set(declaration.path, verified);
    }

    return { manifest, artifactsById, artifactsByPath };
  }
}

function parseStrictYaml(source: string, artifactPath: string): unknown {
  const parsed = parseDocument(source, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  if (parsed.errors.length > 0) {
    throw new BundleValidationError(
      "DUPLICATE_KEY_OR_YAML_INVALID",
      `${artifactPath}: ${parsed.errors.map((error) => error.message).join("; ")}`,
      artifactPath,
    );
  }
  return parsed.toJS({ maxAliasCount: 0 }) as unknown;
}

function assertManifest(value: unknown): asserts value is BundleManifest {
  if (!isRecord(value)) {
    throw new BundleValidationError(
      "MANIFEST_INVALID",
      "Manifest must be an object.",
    );
  }
  const metadata = value.metadata;
  const runtimePolicy = value.runtimePolicy;
  if (
    !isRecord(metadata) ||
    typeof metadata.id !== "string" ||
    typeof metadata.version !== "string" ||
    !Array.isArray(value.artifacts) ||
    !Array.isArray(value.standards) ||
    !isRecord(runtimePolicy) ||
    !Array.isArray(runtimePolicy.loadOrder) ||
    !isRecord(runtimePolicy.conflictPolicy)
  ) {
    throw new BundleValidationError(
      "MANIFEST_INVALID",
      "Manifest is missing required metadata, standards, artifacts, or runtime policy fields.",
    );
  }
  const ids = new Set<string>();
  for (const artifact of value.artifacts) {
    if (
      !isRecord(artifact) ||
      typeof artifact.id !== "string" ||
      typeof artifact.path !== "string" ||
      typeof artifact.role !== "string" ||
      typeof artifact.artifactVersion !== "string" ||
      typeof artifact.sha256 !== "string" ||
      typeof artifact.requiredAtRuntime !== "boolean" ||
      !Array.isArray(artifact.dependsOn) ||
      !artifact.dependsOn.every(
        (dependency) => typeof dependency === "string",
      ) ||
      ids.has(artifact.id)
    ) {
      throw new BundleValidationError(
        "MANIFEST_INVALID",
        "Every artifact must have a unique ID and complete runtime metadata.",
      );
    }
    ids.add(artifact.id);
  }
}

function assertSafeBundlePath(artifactPath: string): void {
  const segments = artifactPath.split("/");
  if (
    artifactPath.startsWith("/") ||
    artifactPath.includes("\\") ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new BundleValidationError(
      "PATH_INVALID",
      `Unsafe bundle-relative path: ${artifactPath}`,
      artifactPath,
    );
  }
}

function assertDependencyGraph(
  declarations: readonly BundleArtifactDeclaration[],
): void {
  const byId = new Map(declarations.map((artifact) => [artifact.id, artifact]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new BundleValidationError(
        "DEPENDENCY_GRAPH_INVALID",
        `Runtime dependency cycle contains ${id}.`,
      );
    }
    if (visited.has(id)) return;
    const artifact = byId.get(id);
    if (artifact === undefined) {
      throw new BundleValidationError(
        "DEPENDENCY_GRAPH_INVALID",
        `Runtime dependency ${id} does not exist or is not runtime-required.`,
      );
    }
    visiting.add(id);
    artifact.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  declarations.forEach((artifact) => visit(artifact.id));
}

function readArtifactVersion(id: string, value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (id === "product-contract") {
    const product = value.product;
    if (!isRecord(product) || !isRecord(product.details)) return null;
    const english = product.details.en;
    return isRecord(english) && typeof english.productVersion === "string"
      ? english.productVersion
      : null;
  }
  if (id === "api-contract") {
    return isRecord(value.info) && typeof value.info.version === "string"
      ? value.info.version
      : null;
  }
  return isRecord(value.metadata) && typeof value.metadata.version === "string"
    ? value.metadata.version
    : null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
