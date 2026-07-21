import {
  OhlcCalculator,
  type CrossBarGapInput,
  type OhlcCalculationPolicy,
} from "../../packages/domain/src";
import { describe, expect, it } from "vitest";

const policy: OhlcCalculationPolicy = {
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

const calculator = new OhlcCalculator(policy);
const current = {
  open: "1.23456",
  high: "1.23500",
  low: "1.23400",
  close: "1.23480",
} as const;
const previous = {
  barEndUtc: "2026-07-21T12:01:00.000000000Z",
  close: "1.23450",
  provenanceState: "AUTHORIZED",
} as const;

function input(overrides: Partial<CrossBarGapInput> = {}): CrossBarGapInput {
  return {
    currentBarStartUtc: "2026-07-21T12:01:00Z",
    current,
    previous,
    ...overrides,
  };
}

describe("governed prior-bar continuity and cross-bar gap", () => {
  it("calculates a gap only for exact continuity and authorized provenance", () => {
    expect(calculator.calculateCrossBarGap("EURUSD", input())).toEqual({
      state: "CALCULATED",
      classification: "DESCRIPTIVE_OBSERVATION",
      continuity: "CONSECUTIVE",
      instrument: "EURUSD",
      quoteCurrency: "USD",
      priceDecimalPlaces: 5,
      currentBarStartUtc: "2026-07-21T12:01:00Z",
      previousBarEndUtc: "2026-07-21T12:01:00Z",
      machine: "0.00006",
      display: "0.00006",
    });
  });

  it("uses the governed quote-currency scale and normalizes rounded negative zero", () => {
    const result = calculator.calculateCrossBarGap(
      "USDJPY",
      input({
        current: {
          open: "150.0004",
          high: "150.1",
          low: "150",
          close: "150.05",
        },
        previous: {
          barEndUtc: "2026-07-21T12:01:00Z",
          close: "150.0005",
          provenanceState: "AUTHORIZED",
        },
      }),
    );

    expect(result).toMatchObject({
      state: "CALCULATED",
      priceDecimalPlaces: 3,
      machine: "-0.0001",
      display: "0",
    });
  });

  it("returns NOT_EVALUATED when no previous bar was supplied", () => {
    expect(
      calculator.calculateCrossBarGap("EURUSD", input({ previous: null })),
    ).toMatchObject({
      state: "NOT_EVALUATED",
      continuity: "NOT_EVALUATED",
      reason: "MISSING_PREVIOUS_BAR",
      machine: null,
      display: null,
    });
  });

  it("returns NOT_EVALUATED for unauthorized prior evidence", () => {
    expect(
      calculator.calculateCrossBarGap(
        "EURUSD",
        input({
          previous: {
            barEndUtc: "2026-07-21T12:01:00Z",
            close: "1.23450",
            provenanceState: "UNAUTHORIZED",
          },
        }),
      ),
    ).toMatchObject({
      state: "NOT_EVALUATED",
      reason: "UNAUTHORIZED_PREVIOUS_BAR",
    });
  });

  it.each([
    "2026-07-21T12:00:59.999999999Z",
    "2026-07-21T12:01:00.000000001Z",
    "2026-07-21T12:02:00Z",
  ])("does not calculate for non-adjacent previous end %s", (barEndUtc) => {
    expect(
      calculator.calculateCrossBarGap(
        "EURUSD",
        input({ previous: { ...previous, barEndUtc } }),
      ),
    ).toMatchObject({
      state: "NOT_EVALUATED",
      reason: "NON_CONSECUTIVE_BARS",
      machine: null,
      display: null,
    });
  });

  it.each([
    ["malformed current start", { currentBarStartUtc: "2026-07-21 12:01:00Z" }],
    [
      "malformed previous end",
      { previous: { ...previous, barEndUtc: "not-a-timestamp" } },
    ],
  ] as const)("suppresses %s temporal evidence", (_label, overrides) => {
    expect(
      calculator.calculateCrossBarGap("EURUSD", input(overrides)),
    ).toMatchObject({
      state: "SUPPRESSED",
      reason: "INVALID_TEMPORAL_EVIDENCE",
    });
  });

  it.each(["NaN", "0", "-1"])(
    "suppresses invalid previous close %s",
    (close) => {
      expect(
        calculator.calculateCrossBarGap(
          "EURUSD",
          input({ previous: { ...previous, close } }),
        ),
      ).toMatchObject({
        state: "SUPPRESSED",
        reason: "INVALID_PREVIOUS_CLOSE",
      });
    },
  );

  it("suppresses the gap when the current bar fails hard validity", () => {
    expect(
      calculator.calculateCrossBarGap(
        "EURUSD",
        input({ current: { ...current, high: "1.2" } }),
      ),
    ).toMatchObject({
      state: "SUPPRESSED",
      reason: "INVALID_CURRENT_BAR",
    });
  });
});
