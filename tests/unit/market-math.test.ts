import { parseOhlcLosslessly } from "../../packages/adapter-source-api/src";
import { calculateMovement } from "../../packages/domain/src";
import { describe, expect, it } from "vitest";

describe("lossless OHLC movement", () => {
  it("preserves decimal tokens and calculates without native-number coercion", () => {
    const bar = parseOhlcLosslessly(
      '{"open":1.234567890123456789,"high":1.234600000000000001,"low":1.234500000000000001,"close":1.234590000000000001}',
    );
    const metrics = calculateMovement(bar);

    expect(bar.open).toBe("1.234567890123456789");
    expect(bar.close).toBe("1.234590000000000001");
    expect(metrics.change).toBe("0.000022109876543212");
    expect(metrics.orderingValid).toBe(true);
    expect(metrics.range).toBe("0.0001");
  });

  it("flags impossible OHLC ordering", () => {
    const metrics = calculateMovement({
      open: "1.2",
      high: "1.1",
      low: "1.0",
      close: "1.15",
    });
    expect(metrics.orderingValid).toBe(false);
  });
});
