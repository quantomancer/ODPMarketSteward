import Decimal from "decimal.js";

const jsonNumberPattern =
  /^(?<negative>-)?(?<integer>0|[1-9]\d*)(?:\.(?<fraction>\d+))?(?:[eE](?<exponent>[+-]?\d+))?$/;
const maximumLexemeLength = 512;
const maximumAbsoluteExponent = 4096;
const maximumCanonicalLength = 4096;

export interface DecimalLexemeEvidence {
  readonly sourceLexeme: string;
  readonly sourceScale: number;
  readonly effectiveScale: number;
  readonly negativeZeroCandidate: boolean;
}

/**
 * Exact internal decimal value. Public display scale, trailing-zero and
 * rounding policy deliberately remain outside this type until DLD-007 closes.
 */
export class DecimalValue {
  readonly sourceLexeme: string;
  readonly sourceScale: number;
  readonly effectiveScale: number;
  readonly negativeZeroCandidate: boolean;
  readonly canonical: string;
  readonly #value: Decimal;

  private constructor(
    evidence: DecimalLexemeEvidence,
    canonical: string,
    value: Decimal,
  ) {
    this.sourceLexeme = evidence.sourceLexeme;
    this.sourceScale = evidence.sourceScale;
    this.effectiveScale = evidence.effectiveScale;
    this.negativeZeroCandidate = evidence.negativeZeroCandidate;
    this.canonical = canonical;
    this.#value = value;
  }

  static fromJsonNumberLexeme(sourceLexeme: string): DecimalValue {
    if (
      sourceLexeme.length === 0 ||
      sourceLexeme.length > maximumLexemeLength
    ) {
      throw new DecimalLexemeError(
        sourceLexeme,
        `Decimal lexeme length must be between 1 and ${maximumLexemeLength}.`,
      );
    }
    const match = jsonNumberPattern.exec(sourceLexeme);
    if (match?.groups === undefined) {
      throw new DecimalLexemeError(
        sourceLexeme,
        "Decimal lexeme must use the JSON number grammar without whitespace.",
      );
    }

    const integer = match.groups.integer ?? "";
    const fraction = match.groups.fraction ?? "";
    const exponent = boundedExponent(
      match.groups.exponent ?? "0",
      sourceLexeme,
    );
    const digits = `${integer}${fraction}`;
    const evidence = {
      sourceLexeme,
      sourceScale: fraction.length,
      effectiveScale: Math.max(0, fraction.length - exponent),
      negativeZeroCandidate:
        match.groups.negative === "-" && /^0+$/.test(digits),
    } satisfies DecimalLexemeEvidence;
    const canonical = canonicalDecimal(
      match.groups.negative === "-",
      digits,
      integer.length + exponent,
      sourceLexeme,
    );

    return new DecimalValue(evidence, canonical, new Decimal(sourceLexeme));
  }

  isZero(): boolean {
    return this.#value.isZero();
  }

  isPositive(): boolean {
    return this.#value.isPositive() && !this.#value.isZero();
  }

  lessThanOrEqualTo(other: DecimalValue): boolean {
    return this.#value.lessThanOrEqualTo(other.#value);
  }

  equals(other: DecimalValue): boolean {
    return this.#value.equals(other.#value);
  }

  toString(): string {
    return this.canonical;
  }
}

export class DecimalLexemeError extends TypeError {
  constructor(
    readonly lexeme: string,
    message: string,
  ) {
    super(message);
    this.name = "DecimalLexemeError";
  }
}

function boundedExponent(exponent: string, sourceLexeme: string): number {
  if (exponent.length > 6) {
    throw new DecimalLexemeError(
      sourceLexeme,
      `Decimal exponent must be between -${maximumAbsoluteExponent} and ${maximumAbsoluteExponent}.`,
    );
  }
  const parsed = Number(exponent);
  if (
    !Number.isSafeInteger(parsed) ||
    Math.abs(parsed) > maximumAbsoluteExponent
  ) {
    throw new DecimalLexemeError(
      sourceLexeme,
      `Decimal exponent must be between -${maximumAbsoluteExponent} and ${maximumAbsoluteExponent}.`,
    );
  }
  return parsed;
}

function canonicalDecimal(
  negative: boolean,
  digits: string,
  decimalIndex: number,
  sourceLexeme: string,
): string {
  if (/^0+$/.test(digits)) return "0";

  const projectedLength =
    decimalIndex <= 0
      ? 2 - decimalIndex + digits.length
      : decimalIndex >= digits.length
        ? decimalIndex
        : digits.length + 1;
  if (projectedLength > maximumCanonicalLength) {
    throw new DecimalLexemeError(
      sourceLexeme,
      `Expanded canonical decimal must not exceed ${maximumCanonicalLength} characters.`,
    );
  }

  let integer: string;
  let fraction: string;
  if (decimalIndex <= 0) {
    integer = "0";
    fraction = `${"0".repeat(-decimalIndex)}${digits}`;
  } else if (decimalIndex >= digits.length) {
    integer = `${digits}${"0".repeat(decimalIndex - digits.length)}`;
    fraction = "";
  } else {
    integer = digits.slice(0, decimalIndex);
    fraction = digits.slice(decimalIndex);
  }

  integer = integer.replace(/^0+(?=\d)/, "");
  fraction = fraction.replace(/0+$/, "");
  const unsigned = fraction.length === 0 ? integer : `${integer}.${fraction}`;
  return negative ? `-${unsigned}` : unsigned;
}
