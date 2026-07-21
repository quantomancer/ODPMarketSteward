const utcTimestampPattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d{1,9}))?Z$/;
const epochLexemePattern = /^(0|[1-9]\d*)$/;
const maximumEpochDigits = 40;
const nanosecondsPerSecond = 1_000_000_000n;
const secondsPerDay = 86_400n;
const oneMinuteNanoseconds = 60n * nanosecondsPerSecond;

export type TemporalValidationCode =
  "INVALID_UTC_TIMESTAMP" | "INVALID_EPOCH_LEXEME" | "INTERVAL_NOT_ONE_MINUTE";

export class TemporalValidationError extends TypeError {
  constructor(
    readonly code: TemporalValidationCode,
    message: string,
    readonly input: string,
  ) {
    super(message);
    this.name = "TemporalValidationError";
  }
}

export class UtcTimestamp {
  readonly source: string;
  readonly canonical: string;
  readonly epochNanoseconds: string;
  readonly #epochNanoseconds: bigint;

  private constructor(
    source: string,
    canonical: string,
    epochNanoseconds: bigint,
  ) {
    this.source = source;
    this.canonical = canonical;
    this.epochNanoseconds = epochNanoseconds.toString();
    this.#epochNanoseconds = epochNanoseconds;
  }

  static parse(source: string): UtcTimestamp {
    const match = utcTimestampPattern.exec(source);
    if (match?.groups === undefined) {
      throw invalidTimestamp(
        source,
        "Timestamp must use RFC 3339 calendar notation with uppercase T, trailing Z, and at most nine fractional digits.",
      );
    }

    const year = component(match.groups.year, "year", source);
    const month = component(match.groups.month, "month", source);
    const day = component(match.groups.day, "day", source);
    const hour = component(match.groups.hour, "hour", source);
    const minute = component(match.groups.minute, "minute", source);
    const second = component(match.groups.second, "second", source);
    const fraction = match.groups.fraction ?? "";

    if (year === 0)
      throw invalidTimestamp(source, "Year 0000 is not supported.");
    if (month < 1 || month > 12) {
      throw invalidTimestamp(source, "Month must be between 01 and 12.");
    }
    const maximumDay = daysInMonth(year, month);
    if (day < 1 || day > maximumDay) {
      throw invalidTimestamp(
        source,
        `Day must be valid for ${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}.`,
      );
    }
    if (hour > 23 || minute > 59 || second > 59) {
      throw invalidTimestamp(
        source,
        "Hour, minute, and second must be within 00-23, 00-59, and 00-59; leap seconds are not supported.",
      );
    }

    const epochSeconds =
      BigInt(daysFromCivil(year, month, day)) * secondsPerDay +
      BigInt(hour * 3600 + minute * 60 + second);
    const fractionalNanoseconds = BigInt(fraction.padEnd(9, "0") || "0");
    const epochNanoseconds =
      epochSeconds * nanosecondsPerSecond + fractionalNanoseconds;
    const canonicalFraction = fraction.replace(/0+$/, "");
    const canonical = `${source.slice(0, 19)}${canonicalFraction.length === 0 ? "" : `.${canonicalFraction}`}Z`;

    return new UtcTimestamp(source, canonical, epochNanoseconds);
  }

  equals(other: UtcTimestamp): boolean {
    return this.#epochNanoseconds === other.#epochNanoseconds;
  }

  differenceNanoseconds(earlier: UtcTimestamp): string {
    return (this.#epochNanoseconds - earlier.#epochNanoseconds).toString();
  }

  toString(): string {
    return this.canonical;
  }
}

export class EpochLexeme {
  readonly source: string;
  readonly canonical: string;
  readonly #value: bigint;

  private constructor(source: string, value: bigint) {
    this.source = source;
    this.canonical = source;
    this.#value = value;
  }

  static parse(source: string): EpochLexeme {
    if (
      source.length === 0 ||
      source.length > maximumEpochDigits ||
      !epochLexemePattern.test(source)
    ) {
      throw new TemporalValidationError(
        "INVALID_EPOCH_LEXEME",
        `Epoch must be a non-negative canonical decimal integer of at most ${maximumEpochDigits} digits.`,
        source,
      );
    }
    return new EpochLexeme(source, BigInt(source));
  }

  matches(timestamp: UtcTimestamp): boolean {
    return this.#value.toString() === timestamp.epochNanoseconds;
  }

  toString(): string {
    return this.canonical;
  }
}

export interface OneMinuteUtcInterval {
  readonly start: UtcTimestamp;
  readonly end: UtcTimestamp;
  readonly durationNanoseconds: "60000000000";
}

export function parseOneMinuteUtcInterval(
  start: string,
  end: string,
): OneMinuteUtcInterval {
  const parsedStart = UtcTimestamp.parse(start);
  const parsedEnd = UtcTimestamp.parse(end);
  const duration = BigInt(parsedEnd.differenceNanoseconds(parsedStart));
  if (duration !== oneMinuteNanoseconds) {
    throw new TemporalValidationError(
      "INTERVAL_NOT_ONE_MINUTE",
      `Completed bar interval must equal exactly 60000000000 nanoseconds; observed ${duration.toString()}.`,
      `${start}/${end}`,
    );
  }
  return {
    start: parsedStart,
    end: parsedEnd,
    durationNanoseconds: "60000000000",
  };
}

function component(
  value: string | undefined,
  name: string,
  source: string,
): number {
  if (value === undefined) {
    throw invalidTimestamp(source, `Timestamp is missing ${name}.`);
  }
  return Number(value);
}

function invalidTimestamp(
  source: string,
  message: string,
): TemporalValidationError {
  return new TemporalValidationError("INVALID_UTC_TIMESTAMP", message, source);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

// Proleptic Gregorian civil date to days relative to 1970-01-01.
function daysFromCivil(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}
