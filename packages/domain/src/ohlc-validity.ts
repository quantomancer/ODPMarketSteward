import { DecimalLexemeError, DecimalValue } from "./decimal";

export const OHLC_HARD_RULE_ID =
  "completed-bar-mathematical-integrity" as const;

export type OhlcField = "open" | "high" | "low" | "close";

export interface OhlcLexemes {
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
}

export type OhlcStrings = OhlcLexemes;

export type OhlcHardConditionId =
  | "finite-decimal"
  | "greater-than-zero"
  | "low-less-than-or-equal-high"
  | "low-less-than-or-equal-open-and-close"
  | "high-greater-than-or-equal-open-and-close";

export interface OhlcHardConditionFailure {
  readonly condition: OhlcHardConditionId;
  readonly fields: readonly OhlcField[];
}

export interface OhlcHardValidityResult {
  readonly ruleId: typeof OHLC_HARD_RULE_ID;
  readonly state: "PASS" | "FAIL";
  readonly normalized: OhlcLexemes | null;
  readonly failedConditions: readonly OhlcHardConditionFailure[];
  readonly suppressedConditions: readonly OhlcHardConditionId[];
  readonly plausibilityEffect: "NONE";
}

const fields = ["open", "high", "low", "close"] as const;
const comparisonConditions = [
  "greater-than-zero",
  "low-less-than-or-equal-high",
  "low-less-than-or-equal-open-and-close",
  "high-greater-than-or-equal-open-and-close",
] as const satisfies readonly OhlcHardConditionId[];

export function evaluateOhlcHardValidity(
  input: OhlcLexemes,
): OhlcHardValidityResult {
  const parsed = new Map<OhlcField, DecimalValue>();
  const invalidFields: OhlcField[] = [];
  for (const field of fields) {
    try {
      parsed.set(field, DecimalValue.fromJsonNumberLexeme(input[field]));
    } catch (error) {
      if (!(error instanceof DecimalLexemeError)) throw error;
      invalidFields.push(field);
    }
  }

  if (invalidFields.length > 0) {
    return freezeResult({
      ruleId: OHLC_HARD_RULE_ID,
      state: "FAIL",
      normalized: null,
      failedConditions: [
        { condition: "finite-decimal", fields: invalidFields },
      ],
      suppressedConditions: comparisonConditions,
      plausibilityEffect: "NONE",
    });
  }

  const open = requiredParsed(parsed, "open");
  const high = requiredParsed(parsed, "high");
  const low = requiredParsed(parsed, "low");
  const close = requiredParsed(parsed, "close");
  const failures: OhlcHardConditionFailure[] = [];
  const nonPositive = fields.filter((field) =>
    requiredParsed(parsed, field).isPositive() ? false : true,
  );
  if (nonPositive.length > 0) {
    failures.push({ condition: "greater-than-zero", fields: nonPositive });
  }
  if (!low.lessThanOrEqualTo(high)) {
    failures.push({
      condition: "low-less-than-or-equal-high",
      fields: ["low", "high"],
    });
  }
  if (!low.lessThanOrEqualTo(open) || !low.lessThanOrEqualTo(close)) {
    failures.push({
      condition: "low-less-than-or-equal-open-and-close",
      fields: ["low", "open", "close"],
    });
  }
  if (!open.lessThanOrEqualTo(high) || !close.lessThanOrEqualTo(high)) {
    failures.push({
      condition: "high-greater-than-or-equal-open-and-close",
      fields: ["high", "open", "close"],
    });
  }

  return freezeResult({
    ruleId: OHLC_HARD_RULE_ID,
    state: failures.length === 0 ? "PASS" : "FAIL",
    normalized: {
      open: open.canonical,
      high: high.canonical,
      low: low.canonical,
      close: close.canonical,
    },
    failedConditions: failures,
    suppressedConditions: [],
    plausibilityEffect: "NONE",
  });
}

function requiredParsed(
  parsed: ReadonlyMap<OhlcField, DecimalValue>,
  field: OhlcField,
): DecimalValue {
  const value = parsed.get(field);
  if (value === undefined) {
    throw new Error(`Internal OHLC parser invariant failed for ${field}.`);
  }
  return value;
}

function freezeResult(result: OhlcHardValidityResult): OhlcHardValidityResult {
  return Object.freeze({
    ...result,
    normalized:
      result.normalized === null ? null : Object.freeze(result.normalized),
    failedConditions: Object.freeze(
      result.failedConditions.map((failure) =>
        Object.freeze({
          ...failure,
          fields: Object.freeze([...failure.fields]),
        }),
      ),
    ),
    suppressedConditions: Object.freeze([...result.suppressedConditions]),
  });
}
