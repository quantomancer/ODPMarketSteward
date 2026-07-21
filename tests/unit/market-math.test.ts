import {
  OhlcCalculator,
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

describe("governed descriptive OHLC calculations", () => {
  it("keeps canonical machine metrics separate from rounded display values", () => {
    const result = calculator.calculate("EURUSD", {
      open: "1.234567890123456789",
      high: "1.234600000000000001",
      low: "1.234500000000000001",
      close: "1.234590000000000001",
    });

    expect(result).toMatchObject({
      state: "CALCULATED",
      classification: "DESCRIPTIVE_OBSERVATION",
      quoteCurrency: "USD",
      priceDecimalPlaces: 5,
      machine: {
        closeMinusOpen: "0.000022109876543212",
        absoluteRange: "0.0001",
        absoluteBody: "0.000022109876543212",
        upperWick: "0.00001",
        lowerWick: "0.000067890123456788",
      },
      display: {
        closeMinusOpen: "0.00002",
        percentageMovement: "0",
        basisPointMovement: "0.18",
        absoluteRange: "0.00010",
        absoluteBody: "0.00002",
        upperWick: "0.00001",
        lowerWick: "0.00007",
      },
    });
  });

  it("uses 34 significant digits and round-half-even for repeating divisions", () => {
    const result = calculator.calculate("EURUSD", {
      open: "3",
      high: "4",
      low: "2",
      close: "4",
    });
    expect(result.state).toBe("CALCULATED");
    if (result.state !== "CALCULATED") return;

    expect(result.machine.percentageMovement).toBe(
      "33.33333333333333333333333333333333",
    );
    expect(result.machine.basisPointMovement).toBe(
      "3333.333333333333333333333333333333",
    );
    expect(result.machine.bodyToRangeRatio).toBe("0.5");
    expect(result.display.percentageMovement).toBe("33.33");
    expect(result.display.basisPointMovement).toBe("3333.33");
    expect(result.display.bodyToRangeRatio).toBe("0.5000");
  });

  it.each([
    ["USDJPY", 3, "0.001"],
    ["EURHUF", 3, "0.001"],
    ["EURUSD", 5, "0.00100"],
  ] as const)(
    "uses governed price scale for %s",
    (instrument, priceDecimalPlaces, displayedChange) => {
      const result = calculator.calculate(instrument, {
        open: "1",
        high: "1.002",
        low: "1",
        close: "1.001",
      });

      expect(result).toMatchObject({
        state: "CALCULATED",
        priceDecimalPlaces,
        display: { closeMinusOpen: displayedChange },
      });
    },
  );

  it("retains nonzero trailing zeros and normalizes rounded signed zero to 0", () => {
    const retained = calculator.calculate("EURUSD", {
      open: "1",
      high: "1.2",
      low: "1",
      close: "1.1",
    });
    const zero = calculator.calculate("EURUSD", {
      open: "1.000004",
      high: "1.000004",
      low: "1.000003",
      close: "1.000003",
    });

    expect(retained).toMatchObject({
      display: {
        closeMinusOpen: "0.10000",
        percentageMovement: "10.00",
        basisPointMovement: "1000.00",
      },
    });
    expect(zero).toMatchObject({
      machine: { closeMinusOpen: "-0.000001" },
      display: { closeMinusOpen: "0" },
    });
  });

  it("returns zero for every flat-bar metric including the ratio", () => {
    const result = calculator.calculate("EURUSD", {
      open: "1.2",
      high: "1.2",
      low: "1.2",
      close: "1.2",
    });

    expect(result).toMatchObject({
      state: "CALCULATED",
      machine: {
        closeMinusOpen: "0",
        percentageMovement: "0",
        basisPointMovement: "0",
        absoluteRange: "0",
        rangeBasisPoints: "0",
        absoluteBody: "0",
        upperWick: "0",
        lowerWick: "0",
        bodyToRangeRatio: "0",
      },
      display: {
        closeMinusOpen: "0",
        percentageMovement: "0",
        basisPointMovement: "0",
        bodyToRangeRatio: "0",
      },
    });
  });

  it("suppresses every metric when hard validity fails", () => {
    expect(
      calculator.calculate("EURUSD", {
        open: "1.2",
        high: "1.1",
        low: "1",
        close: "1.15",
      }),
    ).toMatchObject({
      state: "SUPPRESSED",
      classification: "DESCRIPTIVE_OBSERVATION",
      hardValidity: { state: "FAIL" },
      machine: null,
      display: null,
    });
  });

  it("rejects an unsupported policy or malformed instrument", () => {
    expect(
      () =>
        new OhlcCalculator({
          ...policy,
          workingPrecisionSignificantDigits: 20 as 34,
        }),
    ).toThrow(/Unsupported governed/);
    expect(() =>
      calculator.calculate("eurusd", {
        open: "1",
        high: "1",
        low: "1",
        close: "1",
      }),
    ).toThrow(/six uppercase/);
  });
});
