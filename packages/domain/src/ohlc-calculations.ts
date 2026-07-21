import Decimal from "decimal.js";
import { DecimalValue } from "./decimal";
import {
  evaluateOhlcHardValidity,
  type OhlcHardValidityResult,
  type OhlcLexemes,
} from "./ohlc-validity";
import { TemporalValidationError, UtcTimestamp } from "./utc-time";

export interface OhlcCalculationPolicy {
  readonly workingPrecisionSignificantDigits: 34;
  readonly roundingMode: "ROUND_HALF_EVEN";
  readonly machineResultPolicy: "canonical_decimal_string_without_presentation_rounding";
  readonly roundOnlyAtPresentationBoundary: true;
  readonly displayPolicy: {
    readonly priceAndPriceDelta: {
      readonly decimalPlacesByQuoteCurrency: {
        readonly HUF: 3;
        readonly JPY: 3;
        readonly default: 5;
      };
      readonly trailingZeros: "retain_except_zero_normalized_to_0";
    };
    readonly percentage: DisplayMetricPolicy<2>;
    readonly basisPoints: DisplayMetricPolicy<2>;
    readonly ratio: DisplayMetricPolicy<4>;
    readonly negativeZeroDisplay: "0";
  };
}

interface DisplayMetricPolicy<DecimalPlaces extends number> {
  readonly decimalPlaces: DecimalPlaces;
  readonly trailingZeros: "retain_except_zero_normalized_to_0";
}

export interface OhlcMetricValues {
  readonly closeMinusOpen: string;
  readonly percentageMovement: string;
  readonly basisPointMovement: string;
  readonly absoluteRange: string;
  readonly rangeBasisPoints: string;
  readonly absoluteBody: string;
  readonly upperWick: string;
  readonly lowerWick: string;
  readonly bodyToRangeRatio: string;
}

export interface PreviousBarEvidence {
  readonly barEndUtc: string;
  readonly close: string;
  readonly provenanceState: "AUTHORIZED" | "UNAUTHORIZED";
}

export interface CrossBarGapInput {
  readonly currentBarStartUtc: string;
  readonly current: OhlcLexemes;
  readonly previous: PreviousBarEvidence | null;
}

export type CrossBarGapResult =
  | {
      readonly state: "CALCULATED";
      readonly classification: "DESCRIPTIVE_OBSERVATION";
      readonly continuity: "CONSECUTIVE";
      readonly instrument: string;
      readonly quoteCurrency: string;
      readonly priceDecimalPlaces: 3 | 5;
      readonly currentBarStartUtc: string;
      readonly previousBarEndUtc: string;
      readonly machine: string;
      readonly display: string;
    }
  | {
      readonly state: "NOT_EVALUATED";
      readonly classification: "DESCRIPTIVE_OBSERVATION";
      readonly continuity: "NOT_EVALUATED";
      readonly instrument: string;
      readonly reason:
        | "MISSING_PREVIOUS_BAR"
        | "UNAUTHORIZED_PREVIOUS_BAR"
        | "NON_CONSECUTIVE_BARS";
      readonly machine: null;
      readonly display: null;
    }
  | {
      readonly state: "SUPPRESSED";
      readonly classification: "DESCRIPTIVE_OBSERVATION";
      readonly continuity: "NOT_EVALUATED";
      readonly instrument: string;
      readonly reason:
        | "INVALID_CURRENT_BAR"
        | "INVALID_PREVIOUS_CLOSE"
        | "INVALID_TEMPORAL_EVIDENCE";
      readonly machine: null;
      readonly display: null;
    };

export type OhlcCalculationResult =
  | {
      readonly state: "CALCULATED";
      readonly classification: "DESCRIPTIVE_OBSERVATION";
      readonly instrument: string;
      readonly quoteCurrency: string;
      readonly priceDecimalPlaces: 3 | 5;
      readonly hardValidity: OhlcHardValidityResult;
      readonly machine: OhlcMetricValues;
      readonly display: OhlcMetricValues;
    }
  | {
      readonly state: "SUPPRESSED";
      readonly classification: "DESCRIPTIVE_OBSERVATION";
      readonly instrument: string;
      readonly hardValidity: OhlcHardValidityResult;
      readonly machine: null;
      readonly display: null;
    };

export class OhlcCalculator {
  readonly #policy: OhlcCalculationPolicy;
  readonly #DecimalMath: typeof Decimal;

  constructor(policy: OhlcCalculationPolicy) {
    validatePolicy(policy);
    this.#policy = policy;
    this.#DecimalMath = Decimal.clone({
      precision: policy.workingPrecisionSignificantDigits,
      rounding: Decimal.ROUND_HALF_EVEN,
    });
  }

  calculate(instrument: string, input: OhlcLexemes): OhlcCalculationResult {
    assertInstrument(instrument);
    const hardValidity = evaluateOhlcHardValidity(input);
    if (hardValidity.state === "FAIL") {
      return Object.freeze({
        state: "SUPPRESSED",
        classification: "DESCRIPTIVE_OBSERVATION",
        instrument,
        hardValidity,
        machine: null,
        display: null,
      });
    }
    const normalized = hardValidity.normalized;
    if (normalized === null) {
      throw new Error(
        "PASS hard validity must contain normalized OHLC values.",
      );
    }
    const DecimalMath = this.#DecimalMath;
    const open = new DecimalMath(normalized.open);
    const high = new DecimalMath(normalized.high);
    const low = new DecimalMath(normalized.low);
    const close = new DecimalMath(normalized.close);
    const change = close.minus(open);
    const range = high.minus(low);
    const body = change.abs();
    const percentage = change.times(100).dividedBy(open);
    const basisPoints = change.times(10_000).dividedBy(open);
    const rangeBasisPoints = range.times(10_000).dividedBy(open);
    const upperWick = high.minus(DecimalMath.max(open, close));
    const lowerWick = DecimalMath.min(open, close).minus(low);
    const bodyToRangeRatio = range.isZero()
      ? new DecimalMath(0)
      : body.dividedBy(range);
    const values = {
      closeMinusOpen: change,
      percentageMovement: percentage,
      basisPointMovement: basisPoints,
      absoluteRange: range,
      rangeBasisPoints,
      absoluteBody: body,
      upperWick,
      lowerWick,
      bodyToRangeRatio,
    } as const;
    const { quoteCurrency, priceDecimalPlaces } = pricePresentation(
      instrument,
      this.#policy,
    );
    const priceMetrics = new Set<keyof OhlcMetricValues>([
      "closeMinusOpen",
      "absoluteRange",
      "absoluteBody",
      "upperWick",
      "lowerWick",
    ]);
    const machine = mapMetrics(values, canonical);
    const display = mapMetrics(values, (value, metric) => {
      const decimalPlaces = priceMetrics.has(metric)
        ? priceDecimalPlaces
        : metric === "percentageMovement"
          ? this.#policy.displayPolicy.percentage.decimalPlaces
          : metric === "basisPointMovement" || metric === "rangeBasisPoints"
            ? this.#policy.displayPolicy.basisPoints.decimalPlaces
            : this.#policy.displayPolicy.ratio.decimalPlaces;
      return displayDecimal(value, decimalPlaces);
    });

    return Object.freeze({
      state: "CALCULATED",
      classification: "DESCRIPTIVE_OBSERVATION",
      instrument,
      quoteCurrency,
      priceDecimalPlaces,
      hardValidity,
      machine: Object.freeze(machine),
      display: Object.freeze(display),
    });
  }

  calculateCrossBarGap(
    instrument: string,
    input: CrossBarGapInput,
  ): CrossBarGapResult {
    assertInstrument(instrument);
    const currentValidity = evaluateOhlcHardValidity(input.current);
    if (
      currentValidity.state === "FAIL" ||
      currentValidity.normalized === null
    ) {
      return gapUnavailable(instrument, "SUPPRESSED", "INVALID_CURRENT_BAR");
    }
    if (input.previous === null) {
      return gapUnavailable(
        instrument,
        "NOT_EVALUATED",
        "MISSING_PREVIOUS_BAR",
      );
    }
    if (input.previous.provenanceState !== "AUTHORIZED") {
      return gapUnavailable(
        instrument,
        "NOT_EVALUATED",
        "UNAUTHORIZED_PREVIOUS_BAR",
      );
    }

    let currentStart: UtcTimestamp;
    let previousEnd: UtcTimestamp;
    try {
      currentStart = UtcTimestamp.parse(input.currentBarStartUtc);
      previousEnd = UtcTimestamp.parse(input.previous.barEndUtc);
    } catch (error) {
      if (error instanceof TemporalValidationError) {
        return gapUnavailable(
          instrument,
          "SUPPRESSED",
          "INVALID_TEMPORAL_EVIDENCE",
        );
      }
      throw error;
    }
    if (!previousEnd.equals(currentStart)) {
      return gapUnavailable(
        instrument,
        "NOT_EVALUATED",
        "NON_CONSECUTIVE_BARS",
      );
    }

    let previousClose: DecimalValue;
    try {
      previousClose = DecimalValue.fromJsonNumberLexeme(input.previous.close);
    } catch {
      return gapUnavailable(instrument, "SUPPRESSED", "INVALID_PREVIOUS_CLOSE");
    }
    if (!previousClose.isPositive()) {
      return gapUnavailable(instrument, "SUPPRESSED", "INVALID_PREVIOUS_CLOSE");
    }

    const DecimalMath = this.#DecimalMath;
    const gap = new DecimalMath(currentValidity.normalized.open).minus(
      previousClose.canonical,
    );
    const { quoteCurrency, priceDecimalPlaces } = pricePresentation(
      instrument,
      this.#policy,
    );
    return Object.freeze({
      state: "CALCULATED",
      classification: "DESCRIPTIVE_OBSERVATION",
      continuity: "CONSECUTIVE",
      instrument,
      quoteCurrency,
      priceDecimalPlaces,
      currentBarStartUtc: currentStart.canonical,
      previousBarEndUtc: previousEnd.canonical,
      machine: canonical(gap),
      display: displayDecimal(gap, priceDecimalPlaces),
    });
  }
}

function gapUnavailable(
  instrument: string,
  state: "NOT_EVALUATED" | "SUPPRESSED",
  reason:
    | Extract<CrossBarGapResult, { readonly state: "NOT_EVALUATED" }>["reason"]
    | Extract<CrossBarGapResult, { readonly state: "SUPPRESSED" }>["reason"],
): CrossBarGapResult {
  return Object.freeze({
    state,
    classification: "DESCRIPTIVE_OBSERVATION",
    continuity: "NOT_EVALUATED",
    instrument,
    reason,
    machine: null,
    display: null,
  }) as CrossBarGapResult;
}

function assertInstrument(instrument: string): void {
  if (!/^[A-Z]{6}$/.test(instrument)) {
    throw new TypeError(
      "Calculation instrument must contain exactly six uppercase letters.",
    );
  }
}

function pricePresentation(
  instrument: string,
  policy: OhlcCalculationPolicy,
): { readonly quoteCurrency: string; readonly priceDecimalPlaces: 3 | 5 } {
  const quoteCurrency = instrument.slice(3);
  const priceDecimalPlaces =
    quoteCurrency === "HUF" || quoteCurrency === "JPY"
      ? policy.displayPolicy.priceAndPriceDelta.decimalPlacesByQuoteCurrency[
          quoteCurrency
        ]
      : policy.displayPolicy.priceAndPriceDelta.decimalPlacesByQuoteCurrency
          .default;
  return { quoteCurrency, priceDecimalPlaces };
}

function mapMetrics(
  metrics: Readonly<Record<keyof OhlcMetricValues, Decimal>>,
  render: (value: Decimal, metric: keyof OhlcMetricValues) => string,
): OhlcMetricValues {
  return Object.fromEntries(
    Object.entries(metrics).map(([metric, value]) => [
      metric,
      render(value, metric as keyof OhlcMetricValues),
    ]),
  ) as unknown as OhlcMetricValues;
}

function canonical(value: Decimal): string {
  return DecimalValue.fromJsonNumberLexeme(value.toString()).canonical;
}

function displayDecimal(value: Decimal, decimalPlaces: number): string {
  const rounded = value.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_EVEN);
  return rounded.isZero() ? "0" : rounded.toFixed(decimalPlaces);
}

function validatePolicy(policy: OhlcCalculationPolicy): void {
  const valid =
    policy.workingPrecisionSignificantDigits === 34 &&
    policy.roundingMode === "ROUND_HALF_EVEN" &&
    policy.machineResultPolicy ===
      "canonical_decimal_string_without_presentation_rounding" &&
    policy.roundOnlyAtPresentationBoundary === true &&
    policy.displayPolicy.priceAndPriceDelta.decimalPlacesByQuoteCurrency.HUF ===
      3 &&
    policy.displayPolicy.priceAndPriceDelta.decimalPlacesByQuoteCurrency.JPY ===
      3 &&
    policy.displayPolicy.priceAndPriceDelta.decimalPlacesByQuoteCurrency
      .default === 5 &&
    policy.displayPolicy.percentage.decimalPlaces === 2 &&
    policy.displayPolicy.basisPoints.decimalPlaces === 2 &&
    policy.displayPolicy.ratio.decimalPlaces === 4 &&
    policy.displayPolicy.negativeZeroDisplay === "0";
  if (!valid) {
    throw new TypeError("Unsupported governed OHLC calculation policy.");
  }
}
