import { readFile } from "node:fs/promises";
import { validateInstrumentSetYaml } from "../../packages/contract-runtime/src";
import { describe, expect, it } from "vitest";

const artifactPath = new URL(
  "../../Documentation/ODPMarketStewardBundle/value-sets/fx35-instrument-set.yaml",
  import.meta.url,
);

describe("governed FX-35 instrument artifact", () => {
  it("accepts the exact governed artifact", async () => {
    const yaml = await readFile(artifactPath, "utf8");
    const result = validateInstrumentSetYaml(yaml);
    expect(result.errors).toEqual([]);
    expect(result.memberCount).toBe(35);
    expect(result.uniqueMemberCount).toBe(35);
    expect(result.valid).toBe(true);
  });

  it("rejects a tampered duplicate member", async () => {
    const yaml = await readFile(artifactPath, "utf8");
    const tampered = yaml.replace(
      "- { symbol: USDZAR, base: USD, quote: ZAR }",
      "- { symbol: AUDCAD, base: AUD, quote: CAD }",
    );
    const result = validateInstrumentSetYaml(tampered);
    expect(result.uniqueMemberCount).toBe(34);
    expect(result.valid).toBe(false);
  });
});
