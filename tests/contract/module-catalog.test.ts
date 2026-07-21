import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { architectureModuleCatalog } from "../../packages/application/src/module-catalog";
import { sanitizeTelemetry } from "../../packages/telemetry/src/index";
import { describe, expect, it } from "vitest";

describe("DLD module skeleton", () => {
  it("maps every unique M01-M18 module to a buildable source boundary", () => {
    expect(architectureModuleCatalog).toHaveLength(18);
    expect(
      new Set(architectureModuleCatalog.map((module) => module.id)).size,
    ).toBe(18);
    expect(architectureModuleCatalog.map((module) => module.id)).toEqual(
      Array.from(
        { length: 18 },
        (_, index) => `M${String(index + 1).padStart(2, "0")}`,
      ),
    );
    for (const module of architectureModuleCatalog) {
      expect(existsSync(resolve(module.source)), module.source).toBe(true);
    }
  });

  it("M17 retains only allowlisted scalar telemetry", () => {
    expect(
      sanitizeTelemetry({
        service: "ODP Market Steward",
        operation: "get_fx_product_profile",
        outcome: "PASS",
        prompt: "must not be logged",
        response: { hidden: true },
      }),
    ).toEqual({
      service: "ODP Market Steward",
      operation: "get_fx_product_profile",
      outcome: "PASS",
    });
  });
});
