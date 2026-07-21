export interface GovernedInstrumentMember {
  readonly symbol: string;
  readonly base: string;
  readonly quote: string;
}

export interface GovernedInstrumentSetDefinition {
  readonly expectedCount: number;
  readonly ordering: "alphabetical";
  readonly membershipPolicy: "exact";
  readonly members: readonly GovernedInstrumentMember[];
}

export type InstrumentMembershipValidationCode =
  "INVALID_INSTRUMENT_SET_DEFINITION" | "UNKNOWN_INSTRUMENT";

export class InstrumentMembershipValidationError extends TypeError {
  constructor(
    readonly code: InstrumentMembershipValidationCode,
    message: string,
    readonly input: string,
  ) {
    super(message);
    this.name = "InstrumentMembershipValidationError";
  }
}

export interface InstrumentOrderMismatch {
  readonly index: number;
  readonly expected: string;
  readonly observed: string;
}

export interface InstrumentCoverageValidation {
  readonly exact: boolean;
  readonly expectedCount: number;
  readonly observedCount: number;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly duplicates: readonly string[];
  readonly orderMismatches: readonly InstrumentOrderMismatch[];
}

export class ExactInstrumentSet {
  readonly expectedCount: number;
  readonly members: readonly GovernedInstrumentMember[];
  readonly symbols: readonly string[];
  readonly #symbolSet: ReadonlySet<string>;

  constructor(definition: GovernedInstrumentSetDefinition) {
    validateDefinition(definition);
    this.expectedCount = definition.expectedCount;
    this.members = Object.freeze(
      definition.members.map((member) => Object.freeze({ ...member })),
    );
    this.symbols = Object.freeze(this.members.map((member) => member.symbol));
    this.#symbolSet = new Set(this.symbols);
  }

  includes(symbol: string): boolean {
    return this.#symbolSet.has(symbol);
  }

  require(symbol: string): string {
    if (!this.includes(symbol)) {
      throw new InstrumentMembershipValidationError(
        "UNKNOWN_INSTRUMENT",
        `Instrument ${JSON.stringify(symbol)} is not a member of the governed instrument set.`,
        symbol,
      );
    }
    return symbol;
  }

  validateCoverage(observed: readonly string[]): InstrumentCoverageValidation {
    const observedCounts = countSymbols(observed);
    const missing = this.symbols.filter(
      (symbol) => !observedCounts.has(symbol),
    );
    const extra = uniqueInEncounterOrder(
      observed.filter((symbol) => !this.#symbolSet.has(symbol)),
    );
    const duplicates = uniqueInEncounterOrder(
      observed.filter((symbol) => (observedCounts.get(symbol) ?? 0) > 1),
    );
    const sameUniqueMembership =
      observed.length === this.expectedCount &&
      missing.length === 0 &&
      extra.length === 0 &&
      duplicates.length === 0;
    const orderMismatches = sameUniqueMembership
      ? this.symbols.flatMap((expected, index) => {
          const actual = observed[index];
          return actual === expected || actual === undefined
            ? []
            : [{ index, expected, observed: actual }];
        })
      : [];
    return Object.freeze({
      exact:
        sameUniqueMembership &&
        orderMismatches.length === 0 &&
        observed.length === this.expectedCount,
      expectedCount: this.expectedCount,
      observedCount: observed.length,
      missing: Object.freeze(missing),
      extra: Object.freeze(extra),
      duplicates: Object.freeze(duplicates),
      orderMismatches: Object.freeze(orderMismatches),
    });
  }
}

function validateDefinition(definition: GovernedInstrumentSetDefinition): void {
  const symbols = definition.members.map((member) => member.symbol);
  const sorted = [...symbols].sort();
  const valid =
    definition.expectedCount > 0 &&
    Number.isSafeInteger(definition.expectedCount) &&
    definition.ordering === "alphabetical" &&
    definition.membershipPolicy === "exact" &&
    definition.members.length === definition.expectedCount &&
    new Set(symbols).size === symbols.length &&
    symbols.every((symbol, index) => symbol === sorted[index]) &&
    definition.members.every(
      (member) =>
        /^[A-Z]{6}$/.test(member.symbol) &&
        /^[A-Z]{3}$/.test(member.base) &&
        /^[A-Z]{3}$/.test(member.quote) &&
        member.symbol === `${member.base}${member.quote}`,
    );
  if (!valid) {
    throw new InstrumentMembershipValidationError(
      "INVALID_INSTRUMENT_SET_DEFINITION",
      "Governed instrument-set definition must have its declared positive count, exact alphabetical unique symbols, and matching base-plus-quote decomposition.",
      JSON.stringify(definition),
    );
  }
}

function countSymbols(symbols: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const symbol of symbols) {
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  }
  return counts;
}

function uniqueInEncounterOrder(symbols: readonly string[]): string[] {
  return [...new Set(symbols)];
}
