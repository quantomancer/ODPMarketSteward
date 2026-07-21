import Decimal from "decimal.js";

export * from "./module-ports";

export interface OhlcStrings {
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
}

export interface MovementMetrics {
  readonly change: string;
  readonly changeBasisPoints: string;
  readonly range: string;
  readonly body: string;
  readonly bodyToRangeRatio: string | null;
  readonly orderingValid: boolean;
}

export function calculateMovement(bar: OhlcStrings): MovementMetrics {
  const open = new Decimal(bar.open);
  const high = new Decimal(bar.high);
  const low = new Decimal(bar.low);
  const close = new Decimal(bar.close);
  const change = close.minus(open);
  const range = high.minus(low);
  const body = change.abs();

  return {
    change: change.toString(),
    changeBasisPoints: open.isZero()
      ? "0"
      : change.dividedBy(open).times(10_000).toString(),
    range: range.toString(),
    body: body.toString(),
    bodyToRangeRatio: range.isZero() ? null : body.dividedBy(range).toString(),
    orderingValid:
      high.greaterThanOrEqualTo(Decimal.max(open, close)) &&
      low.lessThanOrEqualTo(Decimal.min(open, close)) &&
      high.greaterThanOrEqualTo(low),
  };
}
