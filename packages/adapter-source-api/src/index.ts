import { DecimalValue, type OhlcStrings } from "@odp-market-steward/domain";
import { isLosslessNumber, parse } from "lossless-json";

export * from "./module-port";

interface SourceBarShape {
  readonly open: unknown;
  readonly high: unknown;
  readonly low: unknown;
  readonly close: unknown;
}

function exactNumberText(value: unknown, field: keyof SourceBarShape): string {
  let lexeme: string;
  if (isLosslessNumber(value)) {
    lexeme = value.toString();
  } else if (typeof value === "string") {
    lexeme = value;
  } else {
    throw new TypeError(`Expected a lossless numeric token for ${field}.`);
  }
  DecimalValue.fromJsonNumberLexeme(lexeme);
  return lexeme;
}

export function parseOhlcLosslessly(json: string): OhlcStrings {
  const value: unknown = parse(json);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected an OHLC object.");
  }

  const source = value as SourceBarShape;
  return {
    open: exactNumberText(source.open, "open"),
    high: exactNumberText(source.high, "high"),
    low: exactNumberText(source.low, "low"),
    close: exactNumberText(source.close, "close"),
  };
}
