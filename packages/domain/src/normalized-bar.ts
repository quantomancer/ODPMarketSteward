import {
  EpochLexeme,
  parseOneMinuteUtcInterval,
  TemporalValidationError,
  UtcTimestamp,
} from "./utc-time";
import type { ExactInstrumentSet } from "./instrument-set";
import type {
  CrossBarGapResult,
  OhlcCalculationResult,
  OhlcCalculator,
  PreviousBarEvidence,
} from "./ohlc-calculations";
import {
  evaluateOhlcHardValidity,
  type OhlcHardValidityResult,
  type OhlcLexemes,
} from "./ohlc-validity";
import {
  evaluatePlausibility,
  type PlausibilityConfiguration,
  type PlausibilityResult,
} from "./plausibility";

export interface CompletedBarLexemes extends OhlcLexemes {
  readonly currency: string;
  readonly epoch: string;
  readonly barStartUtc: string;
  readonly barEndUtc: string;
  readonly granularity: string;
}

export interface NormalizedPlausibilityPolicy {
  readonly targetSeries: "CLOSE";
  readonly configuration: PlausibilityConfiguration;
}

export type ReferenceExclusionReason =
  | "DIFFERENT_INSTRUMENT"
  | "DIFFERENT_GRANULARITY"
  | "INVALID_EPOCH"
  | "INVALID_INTERVAL"
  | "NOT_STRICTLY_BEFORE_TARGET"
  | "INVALID_OHLC"
  | "DUPLICATE_INTERVAL";

export interface ReferenceEligibilityEvidence {
  readonly inputCount: number;
  readonly eligibleBeforeWindowCount: number;
  readonly excluded: Readonly<Record<ReferenceExclusionReason, number>>;
}

export type NormalizedBarIssue =
  | "UNKNOWN_INSTRUMENT"
  | "INVALID_GRANULARITY"
  | "INVALID_EPOCH"
  | "INVALID_INTERVAL"
  | "INVALID_OHLC";

export type NormalizedCompletedBarResult =
  | {
      readonly state: "VALID";
      readonly instrument: string;
      readonly epoch: string;
      readonly granularity: "1m";
      readonly barStartUtc: string;
      readonly barEndUtc: string;
      readonly ohlc: OhlcLexemes;
      readonly hardValidity: OhlcHardValidityResult;
      readonly calculations: OhlcCalculationResult;
      readonly crossBarGap: CrossBarGapResult;
      readonly plausibility: {
        readonly series: "CLOSE";
        readonly result: PlausibilityResult;
        readonly referenceEligibility: ReferenceEligibilityEvidence;
      };
      readonly contextual: {
        readonly calendarState: "UNKNOWN";
        readonly freshness: "UNKNOWN";
        readonly serviceState: "UNKNOWN";
        readonly fitness: "INDETERMINATE";
      };
    }
  | {
      readonly state: "INVALID";
      readonly instrument: string;
      readonly issues: readonly NormalizedBarIssue[];
      readonly hardValidity: OhlcHardValidityResult;
      readonly calculations: null;
      readonly crossBarGap: null;
      readonly plausibility: {
        readonly series: "CLOSE";
        readonly result: null;
      };
      readonly contextual: {
        readonly calendarState: "UNKNOWN";
        readonly freshness: "UNKNOWN";
        readonly serviceState: "UNKNOWN";
        readonly fitness: "INDETERMINATE";
      };
    };

export class NormalizedBarEvaluator {
  readonly #instrumentSet: ExactInstrumentSet;
  readonly #calculator: OhlcCalculator;
  readonly #plausibilityPolicy: NormalizedPlausibilityPolicy;

  constructor(
    instrumentSet: ExactInstrumentSet,
    calculator: OhlcCalculator,
    plausibilityPolicy: NormalizedPlausibilityPolicy,
  ) {
    this.#instrumentSet = instrumentSet;
    this.#calculator = calculator;
    this.#plausibilityPolicy = plausibilityPolicy;
  }

  evaluate(
    target: CompletedBarLexemes,
    history: readonly CompletedBarLexemes[],
    previous: PreviousBarEvidence | null,
  ): NormalizedCompletedBarResult {
    const hardValidity = evaluateOhlcHardValidity(target);
    const issues: NormalizedBarIssue[] = [];
    if (!this.#instrumentSet.includes(target.currency)) {
      issues.push("UNKNOWN_INSTRUMENT");
    }
    if (target.granularity !== "1m") issues.push("INVALID_GRANULARITY");
    try {
      EpochLexeme.parse(target.epoch);
    } catch {
      issues.push("INVALID_EPOCH");
    }
    let targetStart: string | null = null;
    let targetEnd: string | null = null;
    try {
      const interval = parseOneMinuteUtcInterval(
        target.barStartUtc,
        target.barEndUtc,
      );
      targetStart = interval.start.canonical;
      targetEnd = interval.end.canonical;
    } catch (error) {
      if (!(error instanceof TemporalValidationError)) throw error;
      issues.push("INVALID_INTERVAL");
    }
    if (hardValidity.state === "FAIL") issues.push("INVALID_OHLC");

    if (issues.length > 0 || targetStart === null || targetEnd === null) {
      return Object.freeze({
        state: "INVALID",
        instrument: target.currency,
        issues: Object.freeze(issues),
        hardValidity,
        calculations: null,
        crossBarGap: null,
        plausibility: Object.freeze({ series: "CLOSE", result: null }),
        contextual: unknownContext(),
      });
    }

    const calculations = this.#calculator.calculate(target.currency, target);
    const crossBarGap = this.#calculator.calculateCrossBarGap(target.currency, {
      currentBarStartUtc: targetStart,
      current: target,
      previous,
    });
    const { observations, evidence } = eligibleCloseHistory(
      target,
      targetStart,
      history,
    );
    const plausibility = evaluatePlausibility(
      {
        evaluationTimeUtc: targetEnd,
        observation: { observedAtUtc: targetEnd, value: target.close },
        referenceSample: observations,
      },
      this.#plausibilityPolicy.configuration,
    );
    const normalized = hardValidity.normalized;
    if (normalized === null || calculations.state !== "CALCULATED") {
      throw new Error(
        "Valid normalized bar must have calculations and OHLC values.",
      );
    }
    return Object.freeze({
      state: "VALID",
      instrument: target.currency,
      epoch: EpochLexeme.parse(target.epoch).canonical,
      granularity: "1m",
      barStartUtc: targetStart,
      barEndUtc: targetEnd,
      ohlc: normalized,
      hardValidity,
      calculations,
      crossBarGap,
      plausibility: Object.freeze({
        series: "CLOSE",
        result: plausibility,
        referenceEligibility: evidence,
      }),
      contextual: unknownContext(),
    });
  }
}

function eligibleCloseHistory(
  target: CompletedBarLexemes,
  targetStartUtc: string,
  history: readonly CompletedBarLexemes[],
): {
  readonly observations: readonly { observedAtUtc: string; value: string }[];
  readonly evidence: ReferenceEligibilityEvidence;
} {
  const excluded: Record<ReferenceExclusionReason, number> = {
    DIFFERENT_INSTRUMENT: 0,
    DIFFERENT_GRANULARITY: 0,
    INVALID_EPOCH: 0,
    INVALID_INTERVAL: 0,
    NOT_STRICTLY_BEFORE_TARGET: 0,
    INVALID_OHLC: 0,
    DUPLICATE_INTERVAL: 0,
  };
  const observations: { observedAtUtc: string; value: string }[] = [];
  const intervals = new Set<string>();
  for (const candidate of history) {
    if (candidate.currency !== target.currency) {
      excluded.DIFFERENT_INSTRUMENT += 1;
      continue;
    }
    if (candidate.granularity !== "1m") {
      excluded.DIFFERENT_GRANULARITY += 1;
      continue;
    }
    try {
      EpochLexeme.parse(candidate.epoch);
    } catch {
      excluded.INVALID_EPOCH += 1;
      continue;
    }
    let start: string;
    let end: string;
    try {
      const interval = parseOneMinuteUtcInterval(
        candidate.barStartUtc,
        candidate.barEndUtc,
      );
      start = interval.start.canonical;
      end = interval.end.canonical;
      const targetStart = UtcTimestamp.parse(targetStartUtc);
      if (BigInt(interval.end.differenceNanoseconds(targetStart)) > 0n) {
        excluded.NOT_STRICTLY_BEFORE_TARGET += 1;
        continue;
      }
    } catch (error) {
      if (!(error instanceof TemporalValidationError)) throw error;
      excluded.INVALID_INTERVAL += 1;
      continue;
    }
    if (evaluateOhlcHardValidity(candidate).state !== "PASS") {
      excluded.INVALID_OHLC += 1;
      continue;
    }
    const identity = `${start}/${end}`;
    if (intervals.has(identity)) {
      excluded.DUPLICATE_INTERVAL += 1;
      continue;
    }
    intervals.add(identity);
    observations.push({ observedAtUtc: end, value: candidate.close });
  }
  return {
    observations: Object.freeze(observations),
    evidence: Object.freeze({
      inputCount: history.length,
      eligibleBeforeWindowCount: observations.length,
      excluded: Object.freeze(excluded),
    }),
  };
}

function unknownContext() {
  return Object.freeze({
    calendarState: "UNKNOWN",
    freshness: "UNKNOWN",
    serviceState: "UNKNOWN",
    fitness: "INDETERMINATE",
  } as const);
}
