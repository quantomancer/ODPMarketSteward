import Decimal from "decimal.js";
import { DecimalValue } from "./decimal";
import { TemporalValidationError, UtcTimestamp } from "./utc-time";

const DecimalMath = Decimal.clone({
  precision: 34,
  rounding: Decimal.ROUND_HALF_EVEN,
});
const nanosecondsPerSecond = 1_000_000_000n;

export type PlausibilityConfiguration =
  | {
      readonly status: "UNCONFIGURED";
      readonly utcLookbackWindowSeconds: null;
      readonly minimumSampleSize: null;
      readonly alertThresholdMAD: null;
      readonly thresholdComparison: null;
    }
  | {
      readonly status: "CONFIGURED";
      readonly utcLookbackWindowSeconds: number;
      readonly minimumSampleSize: number;
      readonly alertThresholdMAD: string;
      readonly thresholdComparison: "GREATER_THAN_OR_EQUAL";
    };

export interface PlausibilityObservation {
  readonly observedAtUtc: string;
  readonly value: string;
}

export interface PlausibilityInput {
  readonly evaluationTimeUtc: string;
  readonly observation: PlausibilityObservation;
  readonly referenceSample: readonly PlausibilityObservation[];
}

export type PlausibilityResult =
  | {
      readonly state: "NORMAL" | "UNUSUAL";
      readonly method: "rolling_median_and_median_absolute_deviation";
      readonly configurationStatus: "CONFIGURED";
      readonly reason: "EVALUATED";
      readonly evidence: {
        readonly eligibleSampleSize: number;
        readonly median: string;
        readonly medianAbsoluteDeviation: string;
        readonly absoluteDeviation: string;
        readonly madScore: string;
        readonly alertThresholdMAD: string;
        readonly thresholdComparison: "GREATER_THAN_OR_EQUAL";
        readonly utcLookbackWindowSeconds: number;
        readonly evaluationTimeUtc: string;
      };
      readonly hardValidityEffect: "NONE";
      readonly tradingSignalEffect: "PROHIBITED";
    }
  | {
      readonly state: "NOT_EVALUATED";
      readonly method: "rolling_median_and_median_absolute_deviation";
      readonly configurationStatus: "CONFIGURED" | "UNCONFIGURED";
      readonly reason:
        | "UNCONFIGURED"
        | "INVALID_CONFIGURATION"
        | "INVALID_EVIDENCE"
        | "INSUFFICIENT_SAMPLE"
        | "ZERO_MAD";
      readonly evidence: {
        readonly eligibleSampleSize: number;
        readonly requiredSampleSize: number | null;
      } | null;
      readonly hardValidityEffect: "NONE";
      readonly tradingSignalEffect: "PROHIBITED";
    };

export function evaluatePlausibility(
  input: PlausibilityInput,
  configuration: PlausibilityConfiguration,
): PlausibilityResult {
  if (configuration.status === "UNCONFIGURED") {
    return notEvaluated("UNCONFIGURED", "UNCONFIGURED", null);
  }
  if (!validConfiguration(configuration)) {
    return notEvaluated("CONFIGURED", "INVALID_CONFIGURATION", null);
  }

  let evaluationTime: UtcTimestamp;
  let observationValue: Decimal;
  try {
    evaluationTime = UtcTimestamp.parse(input.evaluationTimeUtc);
    const observationTime = UtcTimestamp.parse(input.observation.observedAtUtc);
    if (BigInt(observationTime.differenceNanoseconds(evaluationTime)) > 0n) {
      return notEvaluated("CONFIGURED", "INVALID_EVIDENCE", null);
    }
    observationValue = parseFiniteDecimal(input.observation.value);
  } catch (error) {
    if (
      error instanceof TemporalValidationError ||
      error instanceof TypeError
    ) {
      return notEvaluated("CONFIGURED", "INVALID_EVIDENCE", null);
    }
    throw error;
  }

  const lookbackNanoseconds =
    BigInt(configuration.utcLookbackWindowSeconds) * nanosecondsPerSecond;
  const eligibleValues: Decimal[] = [];
  try {
    for (const reference of input.referenceSample) {
      const observedAt = UtcTimestamp.parse(reference.observedAtUtc);
      const age = BigInt(evaluationTime.differenceNanoseconds(observedAt));
      if (age < 0n) {
        return notEvaluated("CONFIGURED", "INVALID_EVIDENCE", null);
      }
      if (age <= lookbackNanoseconds) {
        eligibleValues.push(parseFiniteDecimal(reference.value));
      }
    }
  } catch (error) {
    if (
      error instanceof TemporalValidationError ||
      error instanceof TypeError
    ) {
      return notEvaluated("CONFIGURED", "INVALID_EVIDENCE", null);
    }
    throw error;
  }

  if (eligibleValues.length < configuration.minimumSampleSize) {
    return notEvaluated("CONFIGURED", "INSUFFICIENT_SAMPLE", {
      eligibleSampleSize: eligibleValues.length,
      requiredSampleSize: configuration.minimumSampleSize,
    });
  }

  const medianValue = median(eligibleValues);
  const deviations = eligibleValues.map((value) =>
    value.minus(medianValue).abs(),
  );
  const medianAbsoluteDeviation = median(deviations);
  if (medianAbsoluteDeviation.isZero()) {
    return notEvaluated("CONFIGURED", "ZERO_MAD", {
      eligibleSampleSize: eligibleValues.length,
      requiredSampleSize: configuration.minimumSampleSize,
    });
  }

  const absoluteDeviation = observationValue.minus(medianValue).abs();
  const madScore = absoluteDeviation.dividedBy(medianAbsoluteDeviation);
  const threshold = parseFiniteDecimal(configuration.alertThresholdMAD);
  const state = madScore.greaterThanOrEqualTo(threshold) ? "UNUSUAL" : "NORMAL";
  return Object.freeze({
    state,
    method: "rolling_median_and_median_absolute_deviation",
    configurationStatus: "CONFIGURED",
    reason: "EVALUATED",
    evidence: Object.freeze({
      eligibleSampleSize: eligibleValues.length,
      median: canonical(medianValue),
      medianAbsoluteDeviation: canonical(medianAbsoluteDeviation),
      absoluteDeviation: canonical(absoluteDeviation),
      madScore: canonical(madScore),
      alertThresholdMAD: threshold.toString(),
      thresholdComparison: configuration.thresholdComparison,
      utcLookbackWindowSeconds: configuration.utcLookbackWindowSeconds,
      evaluationTimeUtc: evaluationTime.canonical,
    }),
    hardValidityEffect: "NONE",
    tradingSignalEffect: "PROHIBITED",
  });
}

function validConfiguration(
  configuration: Extract<PlausibilityConfiguration, { status: "CONFIGURED" }>,
): boolean {
  if (
    !Number.isSafeInteger(configuration.utcLookbackWindowSeconds) ||
    configuration.utcLookbackWindowSeconds <= 0 ||
    !Number.isSafeInteger(configuration.minimumSampleSize) ||
    configuration.minimumSampleSize < 3 ||
    configuration.thresholdComparison !== "GREATER_THAN_OR_EQUAL"
  ) {
    return false;
  }
  try {
    return parseFiniteDecimal(configuration.alertThresholdMAD).greaterThan(0);
  } catch {
    return false;
  }
}

function parseFiniteDecimal(source: string): Decimal {
  return new DecimalMath(DecimalValue.fromJsonNumberLexeme(source).canonical);
}

function median(values: readonly Decimal[]): Decimal {
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return sorted[middle - 1]!.plus(sorted[middle]!).dividedBy(2);
}

function canonical(value: Decimal): string {
  return DecimalValue.fromJsonNumberLexeme(value.toString()).canonical;
}

function notEvaluated(
  configurationStatus: "CONFIGURED" | "UNCONFIGURED",
  reason: Extract<PlausibilityResult, { state: "NOT_EVALUATED" }>["reason"],
  evidence: Extract<PlausibilityResult, { state: "NOT_EVALUATED" }>["evidence"],
): PlausibilityResult {
  return Object.freeze({
    state: "NOT_EVALUATED",
    method: "rolling_median_and_median_absolute_deviation",
    configurationStatus,
    reason,
    evidence,
    hardValidityEffect: "NONE",
    tradingSignalEffect: "PROHIBITED",
  });
}
