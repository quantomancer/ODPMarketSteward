import {
  OHLC_HARD_RULE_ID,
  evaluateOhlcHardValidity,
  type OhlcLexemes,
} from "../../packages/domain/src";
import { describe, expect, it } from "vitest";

const validBar: OhlcLexemes = {
  open: "1.2300",
  high: "1.2500",
  low: "1.2200",
  close: "1.2400",
};

describe("OHLC hard mathematical integrity", () => {
  it("passes a valid bar and returns exact canonical values", () => {
    expect(evaluateOhlcHardValidity(validBar)).toEqual({
      ruleId: OHLC_HARD_RULE_ID,
      state: "PASS",
      normalized: {
        open: "1.23",
        high: "1.25",
        low: "1.22",
        close: "1.24",
      },
      failedConditions: [],
      suppressedConditions: [],
      plausibilityEffect: "NONE",
    });
  });

  it.each([
    { open: "1", high: "1", low: "1", close: "1" },
    { open: "1", high: "2", low: "1", close: "2" },
    { open: "2", high: "2", low: "1", close: "1" },
    {
      open: "1.000000000000000001",
      high: "1.000000000000000002",
      low: "1",
      close: "1.000000000000000001",
    },
  ])("passes inclusive OHLC ordering boundary %#", (bar) => {
    expect(evaluateOhlcHardValidity(bar).state).toBe("PASS");
  });

  it("preserves PASS for every generated positive ordered OHLC tuple", () => {
    const levels = [
      "0.000000000000000001",
      "0.5",
      "1",
      "1.000000000000000001",
      "999999999999999999.999999999999999999",
    ];
    let evaluated = 0;
    for (let lowIndex = 0; lowIndex < levels.length; lowIndex += 1) {
      for (
        let highIndex = lowIndex;
        highIndex < levels.length;
        highIndex += 1
      ) {
        for (let openIndex = lowIndex; openIndex <= highIndex; openIndex += 1) {
          for (
            let closeIndex = lowIndex;
            closeIndex <= highIndex;
            closeIndex += 1
          ) {
            expect(
              evaluateOhlcHardValidity({
                open: levels[openIndex]!,
                high: levels[highIndex]!,
                low: levels[lowIndex]!,
                close: levels[closeIndex]!,
              }).state,
            ).toBe("PASS");
            evaluated += 1;
          }
        }
      }
    }
    expect(evaluated).toBe(105);
  });

  it.each(["NaN", "Infinity", "-Infinity", " 1.2", "1e4097"])(
    "fails malformed or non-finite decimal lexeme %j and suppresses comparisons",
    (invalid) => {
      const result = evaluateOhlcHardValidity({
        ...validBar,
        high: invalid,
      });

      expect(result).toMatchObject({
        state: "FAIL",
        normalized: null,
        failedConditions: [{ condition: "finite-decimal", fields: ["high"] }],
        suppressedConditions: [
          "greater-than-zero",
          "low-less-than-or-equal-high",
          "low-less-than-or-equal-open-and-close",
          "high-greater-than-or-equal-open-and-close",
        ],
        plausibilityEffect: "NONE",
      });
    },
  );

  it.each(["open", "high", "low", "close"] as const)(
    "fails zero and negative-zero boundary in %s",
    (field) => {
      for (const invalid of ["0", "-0.0000", "-1e-30"]) {
        const result = evaluateOhlcHardValidity({
          ...validBar,
          [field]: invalid,
        });

        expect(result.state).toBe("FAIL");
        const positiveFailure = result.failedConditions.find(
          (failure) => failure.condition === "greater-than-zero",
        );
        expect(positiveFailure?.fields).toContain(field);
        expect(result.plausibilityEffect).toBe("NONE");
      }
    },
  );

  it("reports every violated ordering condition without changing plausibility", () => {
    const result = evaluateOhlcHardValidity({
      open: "1.20",
      high: "1.10",
      low: "1.30",
      close: "1.25",
    });

    expect(result.state).toBe("FAIL");
    expect(result.failedConditions.map((failure) => failure.condition)).toEqual(
      [
        "low-less-than-or-equal-high",
        "low-less-than-or-equal-open-and-close",
        "high-greater-than-or-equal-open-and-close",
      ],
    );
    expect(result.plausibilityEffect).toBe("NONE");
  });

  it("reports only the applicable high bound when high is below open", () => {
    const result = evaluateOhlcHardValidity({
      open: "1.3",
      high: "1.2",
      low: "1.1",
      close: "1.15",
    });

    expect(result.failedConditions).toEqual([
      {
        condition: "high-greater-than-or-equal-open-and-close",
        fields: ["high", "open", "close"],
      },
    ]);
  });

  it("reports all malformed fields together", () => {
    const result = evaluateOhlcHardValidity({
      open: "NaN",
      high: "1.2",
      low: "Infinity",
      close: "1.1",
    });

    expect(result.failedConditions).toEqual([
      { condition: "finite-decimal", fields: ["open", "low"] },
    ]);
  });
});
