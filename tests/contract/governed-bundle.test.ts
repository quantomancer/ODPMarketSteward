import {
  BundleLoader,
  BundleValidationError,
  ContractRegistry,
} from "../../packages/contract-runtime/src/index";
import { governedBundle } from "../../generated/governed-bundle";
import { describe, expect, it } from "vitest";

describe("two-phase governed bundle loader", () => {
  it("parses then links all seven runtime artifacts with verified ownership", async () => {
    const verified = await new BundleLoader().load(governedBundle);
    const registry = new ContractRegistry(verified);

    expect(registry.readiness()).toEqual({
      status: "PASS",
      verifiedArtifactCount: 7,
      bundleVersion: "1.1.0",
    });
    expect(registry.responsibility("productFacts")).toBe(
      "product/fxlive.odps.yaml",
    );
    expect(registry.responsibility("httpInterface")).toBe(
      "interface/fxlive.openapi.yaml",
    );
    expect(registry.resolve("instrument-set", "/spec/members/0/symbol")).toBe(
      "AUDCAD",
    );
    expect(registry.productProfile()).toMatchObject({
      application: "ODP Market Steward",
      classification: "MARKET DATA DEMO",
      instrumentCount: 35,
      timeBasis: "UTC",
    });
  });

  it("fails closed when an embedded artifact is tampered", async () => {
    const tampered = {
      ...governedBundle,
      files: {
        ...governedBundle.files,
        "value-sets/fx35-instrument-set.yaml": `${governedBundle.files["value-sets/fx35-instrument-set.yaml"]}\n# tampered`,
      },
    };
    await expect(new BundleLoader().load(tampered)).rejects.toMatchObject({
      code: "DIGEST_MISMATCH",
      artifactPath: "value-sets/fx35-instrument-set.yaml",
    });
  });

  it("rejects duplicate YAML keys before linking", async () => {
    const duplicateKey = {
      ...governedBundle,
      files: {
        ...governedBundle.files,
        "value-sets/fx35-instrument-set.yaml": `${governedBundle.files["value-sets/fx35-instrument-set.yaml"]}\nkind: Duplicate`,
      },
    };
    await expect(new BundleLoader().load(duplicateKey)).rejects.toMatchObject({
      code: "DUPLICATE_KEY_OR_YAML_INVALID",
    });
  });

  it("rejects bundle-root escape paths", async () => {
    const escaped = {
      ...governedBundle,
      manifestYaml: governedBundle.manifestYaml.replaceAll(
        "product/fxlive.odps.yaml",
        "../product/fxlive.odps.yaml",
      ),
    };
    await expect(new BundleLoader().load(escaped)).rejects.toMatchObject({
      code: "PATH_INVALID",
    });
  });

  it("rejects missing dependency targets", async () => {
    const invalidGraph = {
      ...governedBundle,
      manifestYaml: governedBundle.manifestYaml.replace(
        "dependsOn: [product-contract]",
        "dependsOn: [missing-contract]",
      ),
    };
    await expect(new BundleLoader().load(invalidGraph)).rejects.toMatchObject({
      code: "DEPENDENCY_GRAPH_INVALID",
    });
  });

  it("rejects dependency cycles", async () => {
    const cycle = {
      ...governedBundle,
      manifestYaml: governedBundle.manifestYaml.replace(
        "    dependsOn: []",
        "    dependsOn: [api-contract]",
      ),
    };
    await expect(new BundleLoader().load(cycle)).rejects.toMatchObject({
      code: "DEPENDENCY_GRAPH_INVALID",
    });
  });

  it("rejects runtime load-order drift", async () => {
    const invalidOrder = {
      ...governedBundle,
      manifestYaml: governedBundle.manifestYaml.replace(
        "    - product/fxlive.odps.yaml\n    - interface/fxlive.openapi.yaml",
        "    - interface/fxlive.openapi.yaml\n    - product/fxlive.odps.yaml",
      ),
    };
    await expect(new BundleLoader().load(invalidOrder)).rejects.toMatchObject({
      code: "MANIFEST_INVALID",
    });
  });

  it("rejects artifact version drift even when bytes match a revised digest", async () => {
    const path = "operations/monitoring.yaml";
    const original = governedBundle.files[path];
    if (original === undefined) throw new Error(`Missing fixture ${path}.`);
    const changed = original.replace('version: "1.1.0"', 'version: "9.9.9"');
    const observedDigest = createHash("sha256").update(changed).digest("hex");
    const expectedDigest =
      "8355e07f284ab1c0a8500d8f93556b3cb3b103dbfc913529e3f3715456397182";
    const versionDrift = {
      ...governedBundle,
      manifestYaml: governedBundle.manifestYaml.replace(
        expectedDigest,
        observedDigest,
      ),
      files: { ...governedBundle.files, [path]: changed },
    };
    await expect(new BundleLoader().load(versionDrift)).rejects.toMatchObject({
      code: "VERSION_MISMATCH",
      artifactPath: path,
    });
  });

  it("rejects unresolved or malformed JSON Pointers", async () => {
    const registry = new ContractRegistry(
      await new BundleLoader().load(governedBundle),
    );
    expect(() => registry.resolve("instrument-set", "spec/members")).toThrow(
      BundleValidationError,
    );
    expect(() =>
      registry.resolve("instrument-set", "/spec/members/99"),
    ).toThrow(BundleValidationError);
  });
});
import { createHash } from "node:crypto";
