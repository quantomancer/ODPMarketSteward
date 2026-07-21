import {
  EpochLexeme,
  TemporalValidationError,
  UtcTimestamp,
  parseOneMinuteUtcInterval,
} from "../../packages/domain/src";
import { describe, expect, it } from "vitest";

describe("strict UTC timestamp", () => {
  it.each([
    ["1970-01-01T00:00:00Z", "1970-01-01T00:00:00Z", "0"],
    [
      "2000-01-01T00:00:00.000000000Z",
      "2000-01-01T00:00:00Z",
      "946684800000000000",
    ],
    [
      "2024-02-29T23:59:59.123400000Z",
      "2024-02-29T23:59:59.1234Z",
      "1709251199123400000",
    ],
    ["1969-12-31T23:59:59.5Z", "1969-12-31T23:59:59.5Z", "-500000000"],
  ])(
    "parses %s into canonical UTC and exact epoch nanoseconds",
    (source, canonical, epochNanoseconds) => {
      const timestamp = UtcTimestamp.parse(source);

      expect(timestamp.source).toBe(source);
      expect(timestamp.canonical).toBe(canonical);
      expect(timestamp.toString()).toBe(canonical);
      expect(timestamp.epochNanoseconds).toBe(epochNanoseconds);
    },
  );

  it("compares equivalent fractional representations exactly", () => {
    const whole = UtcTimestamp.parse("2026-07-20T16:54:00Z");
    const fractional = UtcTimestamp.parse("2026-07-20T16:54:00.000000000Z");

    expect(whole.equals(fractional)).toBe(true);
    expect(fractional.differenceNanoseconds(whole)).toBe("0");
  });

  it.each([
    "",
    "2026-07-20 16:54:00Z",
    "2026-07-20t16:54:00z",
    "2026-07-20T16:54:00+00:00",
    "0000-01-01T00:00:00Z",
    "2026-00-01T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-02-29T00:00:00Z",
    "2024-02-30T00:00:00Z",
    "2026-07-20T24:00:00Z",
    "2026-07-20T23:60:00Z",
    "2026-07-20T23:59:60Z",
    "2026-07-20T23:59:59.1234567890Z",
  ])("rejects malformed or unsupported timestamp %j", (source) => {
    expect(() => UtcTimestamp.parse(source)).toThrow(TemporalValidationError);
  });
});

describe("nanosecond epoch lexeme", () => {
  it("preserves an integer beyond JavaScript safe range without Number coercion", () => {
    const epoch = EpochLexeme.parse("1709251199123400000");
    const timestamp = UtcTimestamp.parse("2024-02-29T23:59:59.1234Z");

    expect(epoch.source).toBe("1709251199123400000");
    expect(epoch.toString()).toBe("1709251199123400000");
    expect(epoch.matches(timestamp)).toBe(true);
  });

  it.each(["", "-1", "+1", "01", "1.0", "1e9", " 1", "1 "])(
    "rejects unsafe epoch form %j",
    (source) => {
      expect(() => EpochLexeme.parse(source)).toThrowError(
        expect.objectContaining({ code: "INVALID_EPOCH_LEXEME" }),
      );
    },
  );

  it("bounds epoch digit length", () => {
    expect(() => EpochLexeme.parse("1".repeat(41))).toThrow(
      /at most 40 digits/,
    );
  });
});

describe("completed one-minute UTC interval", () => {
  it.each([
    ["2026-07-20T16:54:00Z", "2026-07-20T16:55:00Z"],
    ["2026-12-31T23:59:30.123456789Z", "2027-01-01T00:00:30.123456789Z"],
    ["2024-02-29T23:59:30Z", "2024-03-01T00:00:30Z"],
  ])("accepts an exact 60-second interval from %s to %s", (start, end) => {
    const interval = parseOneMinuteUtcInterval(start, end);

    expect(interval.start.source).toBe(start);
    expect(interval.end.source).toBe(end);
    expect(interval.durationNanoseconds).toBe("60000000000");
  });

  it.each([
    ["2026-07-20T16:54:00Z", "2026-07-20T16:54:59.999999999Z"],
    ["2026-07-20T16:54:00Z", "2026-07-20T16:55:00.000000001Z"],
    ["2026-07-20T16:55:00Z", "2026-07-20T16:54:00Z"],
  ])("rejects a non-one-minute interval from %s to %s", (start, end) => {
    expect(() => parseOneMinuteUtcInterval(start, end)).toThrowError(
      expect.objectContaining({ code: "INTERVAL_NOT_ONE_MINUTE" }),
    );
  });
});
