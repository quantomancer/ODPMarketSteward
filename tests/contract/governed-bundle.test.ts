import {
  BundleLoader,
  BundleValidationError,
  ContractRegistry,
} from "../../packages/contract-runtime/src/index";
import { governedBundle } from "../../generated/governed-bundle";
import { OHLC_HARD_RULE_ID } from "../../packages/domain/src";
import { describe, expect, it } from "vitest";

describe("two-phase governed bundle loader", () => {
  it("parses then links all seven runtime artifacts with verified ownership", async () => {
    const verified = await new BundleLoader().load(governedBundle);
    const registry = new ContractRegistry(verified);

    expect(
      registry.readiness({
        operation: "get_fx_product_profile",
        profileSections: ["identity"],
      }),
    ).toEqual({
      state: "READY",
      operation: "get_fx_product_profile",
      bundleVersion: "1.3.0",
      requiredArtifacts: [
        "bundle-manifest",
        "product-contract",
        "publication-policy",
        "mcp-application-contract",
      ],
      nonBlockingFailures: [],
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
    const instrumentSet = registry.instrumentSet();
    expect(instrumentSet).toMatchObject({
      expectedCount: 35,
      ordering: "alphabetical",
      membershipPolicy: "exact",
      symbolPattern: "^[A-Z]{6}$",
    });
    expect(instrumentSet.members).toHaveLength(35);
    expect(instrumentSet.members[0]).toEqual({
      symbol: "AUDCAD",
      base: "AUD",
      quote: "CAD",
    });
    const ohlcHardRule = registry.resolve(
      "ohlc-rules",
      `/spec/hardRules/${OHLC_HARD_RULE_ID}`,
    ) as { passConditions?: unknown };
    expect(ohlcHardRule.passConditions).toEqual([
      "Currency matches ^[A-Z]{6}$ and is a member of FX-35.",
      "Granularity equals 1m.",
      "BarStart and BarEnd parse as RFC 3339 UTC timestamps ending in Z.",
      "BarEnd minus BarStart equals exactly 60 seconds.",
      "Open, High, Low, and Close are finite decimal values greater than zero.",
      "Low is less than or equal to High.",
      "Low is less than or equal to Open and Close.",
      "High is greater than or equal to Open and Close.",
    ]);
    expect(registry.ohlcCalculationPolicy()).toEqual({
      workingPrecisionSignificantDigits: 34,
      roundingMode: "ROUND_HALF_EVEN",
      machineResultPolicy:
        "canonical_decimal_string_without_presentation_rounding",
      roundOnlyAtPresentationBoundary: true,
      displayPolicy: {
        priceAndPriceDelta: {
          decimalPlacesByQuoteCurrency: { HUF: 3, JPY: 3, default: 5 },
          trailingZeros: "retain_except_zero_normalized_to_0",
        },
        percentage: {
          decimalPlaces: 2,
          trailingZeros: "retain_except_zero_normalized_to_0",
        },
        basisPoints: {
          decimalPlaces: 2,
          trailingZeros: "retain_except_zero_normalized_to_0",
        },
        ratio: {
          decimalPlaces: 4,
          trailingZeros: "retain_except_zero_normalized_to_0",
        },
        negativeZeroDisplay: "0",
      },
    });
    expect(
      registry.resolve(
        "ohlc-rules",
        "/spec/calculations/percentageMovement/formula",
      ),
    ).toBe("100 * (Close - Open) / Open");
    expect(
      registry.resolve("ohlc-rules", "/spec/calculations/absoluteBody/formula"),
    ).toBe("abs(Close - Open)");
    expect(registry.productProfile()).toMatchObject({
      productName: "FXLive Market Data Demo - Standard FX-35",
      productId: "fxlive-market-data-demo-fx35",
      productVersion: "1.1.1",
      odpsVersion: 4.1,
      disclaimer: { label: "MARKET DATA DEMO", policyVersion: "1.1.0" },
    });
    const instruments = registry.productProfile().declaration("instruments");
    expect(instruments.artifact.artifactId).toBe("instrument-set");
    expect(instruments.pointer).toBe("/spec/members");
    expect(Array.isArray(instruments.value)).toBe(true);
    if (!Array.isArray(instruments.value)) {
      throw new Error(
        "Expected the instrument declaration value to be an array.",
      );
    }
    expect(instruments.value[0]).toEqual({
      symbol: "AUDCAD",
      base: "AUD",
      quote: "CAD",
    });
    expect(registry.mcpTool("get_fx_product_profile")).toMatchObject({
      name: "get_fx_product_profile",
      inputSchemaRef: "#/schemas/ProductProfileInput",
      outputSchemaRef: "#/schemas/ProductProfileOutput",
      annotations: { readOnlyHint: true, openWorldHint: false },
      meta: { ui: { visibility: ["model"] } },
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
