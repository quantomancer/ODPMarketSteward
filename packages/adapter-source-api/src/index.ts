import type { OhlcStrings } from "@odp-market-steward/domain";
import { isLosslessNumber, parse } from "lossless-json";

interface SourceBarShape {
  readonly open: unknown;
  readonly high: unknown;
  readonly low: unknown;
  readonly close: unknown;
}

function exactNumberText(value: unknown, field: keyof SourceBarShape): string {
  if (isLosslessNumber(value)) {
    return value.toString();
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  throw new TypeError(`Expected a lossless numeric token for ${field}.`);
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
