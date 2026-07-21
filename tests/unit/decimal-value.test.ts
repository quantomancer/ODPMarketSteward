import { parseOhlcLosslessly } from "../../packages/adapter-source-api/src";
import { DecimalLexemeError, DecimalValue } from "../../packages/domain/src";
import { describe, expect, it } from "vitest";

describe("canonical internal decimal value", () => {
  it.each([
    {
      lexeme: "1.2300",
      canonical: "1.23",
      sourceScale: 4,
      effectiveScale: 4,
      negativeZeroCandidate: false,
    },
    {
      lexeme: "1.2300e-2",
      canonical: "0.0123",
      sourceScale: 4,
      effectiveScale: 6,
      negativeZeroCandidate: false,
    },
    {
      lexeme: "1.2300E+2",
      canonical: "123",
      sourceScale: 4,
      effectiveScale: 2,
      negativeZeroCandidate: false,
    },
    {
      lexeme: "-0.0000",
      canonical: "0",
      sourceScale: 4,
      effectiveScale: 4,
      negativeZeroCandidate: true,
    },
    {
      lexeme: "9007199254740993",
      canonical: "9007199254740993",
      sourceScale: 0,
      effectiveScale: 0,
      negativeZeroCandidate: false,
    },
    {
      lexeme: "-12.3400e+1",
      canonical: "-123.4",
      sourceScale: 4,
      effectiveScale: 3,
      negativeZeroCandidate: false,
    },
  ])(
    "preserves evidence and canonicalizes $lexeme without Number coercion",
    ({
      lexeme,
      canonical,
      sourceScale,
      effectiveScale,
      negativeZeroCandidate,
    }) => {
      const value = DecimalValue.fromJsonNumberLexeme(lexeme);

      expect(value.sourceLexeme).toBe(lexeme);
      expect(value.canonical).toBe(canonical);
      expect(value.toString()).toBe(canonical);
      expect(value.sourceScale).toBe(sourceScale);
      expect(value.effectiveScale).toBe(effectiveScale);
      expect(value.negativeZeroCandidate).toBe(negativeZeroCandidate);
    },
  );

  it("compares exact values while preserving distinct lexical evidence", () => {
    const scaled = DecimalValue.fromJsonNumberLexeme("1.2300");
    const exponent = DecimalValue.fromJsonNumberLexeme("123e-2");

    expect(scaled.equals(exponent)).toBe(true);
    expect(scaled.sourceLexeme).not.toBe(exponent.sourceLexeme);
    expect(scaled.sourceScale).toBe(4);
    expect(exponent.sourceScale).toBe(0);
  });

  it.each(["", " 1.2", "1.2 ", "+1", ".5", "01", "1.", "NaN", "Infinity"])(
    "rejects non-JSON decimal lexeme %j",
    (lexeme) => {
      expect(() => DecimalValue.fromJsonNumberLexeme(lexeme)).toThrow(
        DecimalLexemeError,
      );
    },
  );

  it("bounds exponent expansion before allocating a canonical string", () => {
    expect(() => DecimalValue.fromJsonNumberLexeme("1e4097")).toThrow(
      /exponent must be between/,
    );
    expect(() => DecimalValue.fromJsonNumberLexeme("1e4096")).toThrow(
      /canonical decimal must not exceed/,
    );
  });
});

describe("lossless JSON numeric capture", () => {
  it("preserves scale, exponent, negative zero and unsafe integer tokens", () => {
    const bar = parseOhlcLosslessly(
      '{"open":1.2300,"high":1.2400e0,"low":-0.0000,"close":9007199254740993}',
    );

    expect(bar).toEqual({
      open: "1.2300",
      high: "1.2400e0",
      low: "-0.0000",
      close: "9007199254740993",
    });
    expect(DecimalValue.fromJsonNumberLexeme(bar.low)).toMatchObject({
      canonical: "0",
      negativeZeroCandidate: true,
      sourceScale: 4,
    });
  });

  it("validates numeric strings using the same strict grammar", () => {
    expect(() =>
      parseOhlcLosslessly(
        '{"open":" 1.2","high":"1.3","low":"1.1","close":"1.2"}',
      ),
    ).toThrow(DecimalLexemeError);
  });
});
