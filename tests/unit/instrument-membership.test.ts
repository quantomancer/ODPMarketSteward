import {
  ExactInstrumentSet,
  InstrumentMembershipValidationError,
} from "../../packages/domain/src";
import {
  BundleLoader,
  ContractRegistry,
} from "../../packages/contract-runtime/src";
import { governedBundle } from "../../generated/governed-bundle";
import { beforeAll, describe, expect, it } from "vitest";

let instruments: ExactInstrumentSet;

beforeAll(async () => {
  const registry = new ContractRegistry(
    await new BundleLoader().load(governedBundle),
  );
  instruments = new ExactInstrumentSet(registry.instrumentSet());
});

describe("governed exact FX-35 membership", () => {
  it("accepts the exact ordered projection from the governed value set", () => {
    const result = instruments.validateCoverage(instruments.symbols);

    expect(instruments.expectedCount).toBe(35);
    expect(instruments.symbols[0]).toBe("AUDCAD");
    expect(instruments.symbols.at(-1)).toBe("USDZAR");
    expect(result).toEqual({
      exact: true,
      expectedCount: 35,
      observedCount: 35,
      missing: [],
      extra: [],
      duplicates: [],
      orderMismatches: [],
    });
  });

  it("reports a missing governed member", () => {
    const result = instruments.validateCoverage(
      instruments.symbols.slice(0, -1),
    );

    expect(result).toMatchObject({
      exact: false,
      observedCount: 34,
      missing: ["USDZAR"],
      extra: [],
      duplicates: [],
      orderMismatches: [],
    });
  });

  it("reports each extra identifier once without normalizing it", () => {
    const result = instruments.validateCoverage([
      ...instruments.symbols,
      "EURXXX",
      "EURXXX",
    ]);

    expect(result).toMatchObject({
      exact: false,
      observedCount: 37,
      missing: [],
      extra: ["EURXXX"],
      duplicates: ["EURXXX"],
      orderMismatches: [],
    });
  });

  it("reports duplicate and displaced governed members separately", () => {
    const observed = [...instruments.symbols];
    observed[observed.length - 1] = "AUDCAD";

    expect(instruments.validateCoverage(observed)).toMatchObject({
      exact: false,
      missing: ["USDZAR"],
      extra: [],
      duplicates: ["AUDCAD"],
      orderMismatches: [],
    });
  });

  it("reports exact positional mismatches for a reordered complete set", () => {
    const observed = [...instruments.symbols];
    [observed[0], observed[1]] = [observed[1]!, observed[0]!];

    expect(instruments.validateCoverage(observed)).toMatchObject({
      exact: false,
      missing: [],
      extra: [],
      duplicates: [],
      orderMismatches: [
        { index: 0, expected: "AUDCAD", observed: "AUDCHF" },
        { index: 1, expected: "AUDCHF", observed: "AUDCAD" },
      ],
    });
  });

  it("supports exact single-instrument allowlisting", () => {
    expect(instruments.includes("EURUSD")).toBe(true);
    expect(instruments.require("EURUSD")).toBe("EURUSD");
    expect(instruments.includes("eurusd")).toBe(false);
    expect(() => instruments.require("eurusd")).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_INSTRUMENT" }),
    );
  });

  it("fails closed for an invalid injected definition", () => {
    expect(
      () =>
        new ExactInstrumentSet({
          expectedCount: 2,
          ordering: "alphabetical",
          membershipPolicy: "exact",
          members: [
            { symbol: "EURUSD", base: "EUR", quote: "USD" },
            { symbol: "EURUSD", base: "EUR", quote: "USD" },
          ],
        }),
    ).toThrow(InstrumentMembershipValidationError);
  });
});
