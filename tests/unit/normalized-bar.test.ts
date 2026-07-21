import {
  ExactInstrumentSet,
  NormalizedBarEvaluator,
  OhlcCalculator,
  type CompletedBarLexemes,
  type OhlcCalculationPolicy,
  type PlausibilityConfiguration,
} from "../../packages/domain/src";
import { describe, expect, it } from "vitest";

const calculationPolicy: OhlcCalculationPolicy = {
  workingPrecisionSignificantDigits: 34,
  roundingMode: "ROUND_HALF_EVEN",
  machineResultPolicy: "canonical_decimal_string_without_presentation_rounding",
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
};

const plausibilityConfiguration: PlausibilityConfiguration = {
  status: "CONFIGURED",
  utcLookbackWindowSeconds: 3600,
  minimumSampleSize: 30,
  alertThresholdMAD: "6",
  thresholdComparison: "GREATER_THAN_OR_EQUAL",
};

const evaluator = new NormalizedBarEvaluator(
  new ExactInstrumentSet({
    expectedCount: 1,
    ordering: "alphabetical",
    membershipPolicy: "exact",
    members: [{ symbol: "EURUSD", base: "EUR", quote: "USD" }],
  }),
  new OhlcCalculator(calculationPolicy),
  { targetSeries: "CLOSE", configuration: plausibilityConfiguration },
);

function bar(
  minute: number,
  close: string,
  overrides: Partial<CompletedBarLexemes> = {},
): CompletedBarLexemes {
  const startMinute = minute.toString().padStart(2, "0");
  const endMinute = (minute + 1).toString().padStart(2, "0");
  return {
    currency: "EURUSD",
    epoch: String(
      1_721_492_460_000_000_000n + BigInt(minute) * 60_000_000_000n,
    ),
    barStartUtc: `2026-07-20T11:${startMinute}:00Z`,
    barEndUtc: `2026-07-20T11:${endMinute}:00Z`,
    granularity: "1m",
    open: "10",
    high: "20",
    low: "1",
    close,
    ...overrides,
  };
}

function target(close = "16"): CompletedBarLexemes {
  return {
    currency: "EURUSD",
    epoch: "1721496060000000000",
    barStartUtc: "2026-07-20T12:00:00Z",
    barEndUtc: "2026-07-20T12:01:00Z",
    granularity: "1m",
    open: "100",
    high: "100",
    low: "9",
    close,
  };
}

function eligibleHistory(): CompletedBarLexemes[] {
  const values = ["9", "10", "10", "11", "12"];
  return Array.from({ length: 30 }, (_, index) =>
    bar(index + 1, values[index % values.length]!),
  );
}

describe("normalized completed-bar aggregate", () => {
  it("composes a valid bar and evaluates only the CLOSE series", () => {
    const result = evaluator.evaluate(target(), eligibleHistory(), {
      barEndUtc: "2026-07-20T12:00:00Z",
      close: "15",
      provenanceState: "AUTHORIZED",
    });

    expect(result).toMatchObject({
      state: "VALID",
      instrument: "EURUSD",
      granularity: "1m",
      barStartUtc: "2026-07-20T12:00:00Z",
      barEndUtc: "2026-07-20T12:01:00Z",
      ohlc: { open: "100", high: "100", low: "9", close: "16" },
      hardValidity: { state: "PASS" },
      calculations: { state: "CALCULATED" },
      crossBarGap: { state: "CALCULATED", machine: "85" },
      plausibility: {
        series: "CLOSE",
        result: {
          state: "UNUSUAL",
          evidence: {
            eligibleSampleSize: 30,
            median: "10",
            medianAbsoluteDeviation: "1",
            madScore: "6",
          },
        },
        referenceEligibility: {
          inputCount: 30,
          eligibleBeforeWindowCount: 30,
        },
      },
      contextual: {
        calendarState: "UNKNOWN",
        freshness: "UNKNOWN",
        serviceState: "UNKNOWN",
        fitness: "INDETERMINATE",
      },
    });
  });

  it("keeps a value immediately below the governed threshold NORMAL", () => {
    const result = evaluator.evaluate(
      target("15.999"),
      eligibleHistory(),
      null,
    );
    expect(result).toMatchObject({
      state: "VALID",
      plausibility: { series: "CLOSE", result: { state: "NORMAL" } },
    });
  });

  it("excludes every ineligible history category without mixing series", () => {
    const valid = eligibleHistory();
    const result = evaluator.evaluate(
      target(),
      [
        ...valid,
        bar(31, "100", { currency: "GBPUSD" }),
        bar(32, "100", { granularity: "5m" }),
        bar(33, "100", { epoch: "not-an-epoch" }),
        bar(34, "100", { barEndUtc: "2026-07-20T11:36:30Z" }),
        bar(35, "100", {
          barStartUtc: "2026-07-20T12:00:00Z",
          barEndUtc: "2026-07-20T12:01:00Z",
        }),
        bar(36, "100", { high: "5", close: "10" }),
        valid[0]!,
      ],
      null,
    );
    expect(result).toMatchObject({
      state: "VALID",
      plausibility: {
        series: "CLOSE",
        result: { state: "UNUSUAL", evidence: { eligibleSampleSize: 30 } },
        referenceEligibility: {
          inputCount: 37,
          eligibleBeforeWindowCount: 30,
          excluded: {
            DIFFERENT_INSTRUMENT: 1,
            DIFFERENT_GRANULARITY: 1,
            INVALID_EPOCH: 1,
            INVALID_INTERVAL: 1,
            NOT_STRICTLY_BEFORE_TARGET: 1,
            INVALID_OHLC: 1,
            DUPLICATE_INTERVAL: 1,
          },
        },
      },
    });
  });

  it("suppresses every dependent result for an invalid target", () => {
    const result = evaluator.evaluate(target("NaN"), [], null);
    expect(result).toMatchObject({
      state: "INVALID",
      issues: ["INVALID_OHLC"],
      hardValidity: { state: "FAIL" },
      calculations: null,
      crossBarGap: null,
      plausibility: { series: "CLOSE", result: null },
      contextual: {
        calendarState: "UNKNOWN",
        freshness: "UNKNOWN",
        serviceState: "UNKNOWN",
        fitness: "INDETERMINATE",
      },
    });
  });

  it("reports independent target identity, epoch, interval and OHLC failures", () => {
    const result = evaluator.evaluate(target("NaN"), [], null);
    const compound = evaluator.evaluate(
      {
        ...target("NaN"),
        currency: "GBPUSD",
        epoch: "-1",
        granularity: "5m",
        barEndUtc: "2026-07-20T12:00:30Z",
      },
      [],
      null,
    );
    expect(result.state).toBe("INVALID");
    expect(compound).toMatchObject({
      state: "INVALID",
      issues: [
        "UNKNOWN_INSTRUMENT",
        "INVALID_GRANULARITY",
        "INVALID_EPOCH",
        "INVALID_INTERVAL",
        "INVALID_OHLC",
      ],
    });
  });
});
