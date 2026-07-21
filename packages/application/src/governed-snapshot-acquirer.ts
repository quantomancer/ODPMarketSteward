import type { CompletedBarLexemes } from "@odp-market-steward/domain";
import type { SnapshotMetadataEvidence } from "./snapshot-assembler";

export interface GovernedSnapshotSourcePort {
  getHealth(signal?: AbortSignal): Promise<unknown>;
  getSnapshotMetadata(signal?: AbortSignal): Promise<SnapshotMetadataEvidence>;
  getLatestObservation(
    instrument: string,
    signal?: AbortSignal,
  ): Promise<CompletedBarLexemes>;
}

export interface GovernedSnapshotAcquirerConfig {
  readonly maximumConcurrency: number;
  readonly maximumCallsPerInvocation: number;
  readonly allowOneFullRolloverReread: boolean;
}

export interface SnapshotCoverage {
  readonly requestedCount: number;
  readonly successfulCount: number;
  readonly failedCount: number;
  readonly missingCount: number;
  readonly unexpectedCount: number;
  readonly duplicateCount: number;
  readonly missingInstruments: readonly string[];
  readonly failedInstruments: readonly string[];
  readonly unexpectedInstruments: readonly string[];
  readonly duplicateInstruments: readonly string[];
}

export interface SnapshotHealthDiagnostic {
  readonly status: "NOT_RUN" | "REACHABLE" | "UNREACHABLE" | "SKIPPED_BUDGET";
  readonly establishesMarketState: false;
  readonly establishesFreshness: false;
  readonly establishesCoherence: false;
  readonly establishesFitness: false;
}

export interface GovernedSnapshotResult {
  readonly availabilityState:
    "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "INCOHERENT";
  readonly coverageState: "COMPLETE" | "PARTIAL" | "NONE";
  readonly coherenceState: "COHERENT" | "INCOHERENT" | "NOT_EVALUATED";
  readonly reason:
    | "COMPLETE"
    | "PARTIAL_COVERAGE"
    | "NO_USABLE_EVIDENCE"
    | "METADATA_BEFORE_UNAVAILABLE"
    | "METADATA_AFTER_UNAVAILABLE"
    | "METADATA_TARGET_MISSING"
    | "ROLLOVER_BUDGET_UNAVAILABLE"
    | "ROLLOVER_AFTER_REREAD"
    | "MIXED_BAR_INTERVAL";
  readonly metadataBefore: SnapshotMetadataEvidence | null;
  readonly metadataAfter: SnapshotMetadataEvidence | null;
  readonly bars: readonly CompletedBarLexemes[];
  readonly coverage: SnapshotCoverage;
  readonly healthDiagnostic: SnapshotHealthDiagnostic;
  readonly attemptCount: 1 | 2;
  readonly callCount: number;
}

interface Attempt {
  readonly metadataBefore: SnapshotMetadataEvidence | null;
  readonly metadataAfter: SnapshotMetadataEvidence | null;
  readonly metadataBeforeFailed: boolean;
  readonly metadataAfterFailed: boolean;
  readonly bars: readonly CompletedBarLexemes[];
  readonly coverage: SnapshotCoverage;
  readonly callCount: number;
}

interface BarAttempt {
  readonly requestedInstrument: string;
  readonly bar: CompletedBarLexemes | null;
  readonly failed: boolean;
}

const NOT_RUN_HEALTH: SnapshotHealthDiagnostic = Object.freeze({
  status: "NOT_RUN",
  establishesMarketState: false,
  establishesFreshness: false,
  establishesCoherence: false,
  establishesFitness: false,
});

export class GovernedSnapshotAcquirer {
  readonly #source: GovernedSnapshotSourcePort;
  readonly #maximumConcurrency: number;
  readonly #maximumCallsPerInvocation: number;
  readonly #allowOneFullRolloverReread: boolean;

  constructor(
    source: GovernedSnapshotSourcePort,
    config: GovernedSnapshotAcquirerConfig,
  ) {
    if (
      !Number.isSafeInteger(config.maximumConcurrency) ||
      config.maximumConcurrency < 1 ||
      config.maximumConcurrency > 6
    ) {
      throw new RangeError(
        "Snapshot concurrency must be a safe integer from 1 through 6.",
      );
    }
    if (
      !Number.isSafeInteger(config.maximumCallsPerInvocation) ||
      config.maximumCallsPerInvocation < 3
    ) {
      throw new RangeError(
        "Snapshot call budget must be a safe integer of at least three.",
      );
    }
    this.#source = source;
    this.#maximumConcurrency = config.maximumConcurrency;
    this.#maximumCallsPerInvocation = config.maximumCallsPerInvocation;
    this.#allowOneFullRolloverReread = config.allowOneFullRolloverReread;
  }

  async acquire(
    instruments: readonly string[],
    signal?: AbortSignal,
  ): Promise<GovernedSnapshotResult> {
    const requested = validateAndSortInstruments(instruments);
    const callsPerAttempt = requested.length + 2;
    if (callsPerAttempt > this.#maximumCallsPerInvocation) {
      throw new RangeError(
        "Snapshot call budget cannot cover one complete attempt.",
      );
    }

    const first = await this.#attempt(requested, signal);
    const firstRollover = hasRollover(first);
    if (firstRollover) {
      const rereadBudgetRequired = callsPerAttempt * 2;
      if (
        !this.#allowOneFullRolloverReread ||
        rereadBudgetRequired > this.#maximumCallsPerInvocation
      ) {
        return incoherent(
          first,
          "ROLLOVER_BUDGET_UNAVAILABLE",
          1,
          first.callCount,
        );
      }
      const second = await this.#attempt(requested, signal);
      if (hasRollover(second)) {
        return incoherent(
          second,
          "ROLLOVER_AFTER_REREAD",
          2,
          first.callCount + second.callCount,
        );
      }
      return await this.#classify(
        second,
        2,
        first.callCount + second.callCount,
        signal,
      );
    }
    return await this.#classify(first, 1, first.callCount, signal);
  }

  async #attempt(
    instruments: readonly string[],
    signal?: AbortSignal,
  ): Promise<Attempt> {
    let callCount = 1;
    let metadataBefore: SnapshotMetadataEvidence;
    try {
      metadataBefore = await this.#source.getSnapshotMetadata(signal);
    } catch {
      return {
        metadataBefore: null,
        metadataAfter: null,
        metadataBeforeFailed: true,
        metadataAfterFailed: false,
        bars: Object.freeze([]),
        coverage: emptyCoverage(instruments),
        callCount,
      };
    }

    const attempts = await mapConcurrentSettled(
      instruments,
      this.#maximumConcurrency,
      async (instrument): Promise<BarAttempt> => {
        try {
          const bar = await this.#source.getLatestObservation(
            instrument,
            signal,
          );
          return { requestedInstrument: instrument, bar, failed: false };
        } catch {
          return { requestedInstrument: instrument, bar: null, failed: true };
        }
      },
    );
    callCount += instruments.length + 1;
    let metadataAfter: SnapshotMetadataEvidence | null = null;
    let metadataAfterFailed = false;
    try {
      metadataAfter = await this.#source.getSnapshotMetadata(signal);
    } catch {
      metadataAfterFailed = true;
    }
    const normalized = normalizeBars(instruments, attempts);
    return {
      metadataBefore,
      metadataAfter,
      metadataBeforeFailed: false,
      metadataAfterFailed,
      bars: normalized.bars,
      coverage: normalized.coverage,
      callCount,
    };
  }

  async #classify(
    attempt: Attempt,
    attemptCount: 1 | 2,
    callCount: number,
    signal?: AbortSignal,
  ): Promise<GovernedSnapshotResult> {
    if (attempt.metadataBeforeFailed) {
      return await this.#unavailable(
        attempt,
        "METADATA_BEFORE_UNAVAILABLE",
        attemptCount,
        callCount,
        signal,
      );
    }
    if (attempt.metadataAfterFailed || attempt.metadataAfter === null) {
      if (attempt.bars.length === 0) {
        return await this.#unavailable(
          attempt,
          "NO_USABLE_EVIDENCE",
          attemptCount,
          callCount,
          signal,
        );
      }
      return incoherent(
        attempt,
        "METADATA_AFTER_UNAVAILABLE",
        attemptCount,
        callCount,
      );
    }
    const before = attempt.metadataBefore;
    const after = attempt.metadataAfter;
    if (
      before?.barStartUtc === null ||
      before?.barEndUtc === null ||
      after.barStartUtc === null ||
      after.barEndUtc === null
    ) {
      return incoherent(
        attempt,
        "METADATA_TARGET_MISSING",
        attemptCount,
        callCount,
      );
    }
    if (
      attempt.bars.some(
        (bar) =>
          bar.barStartUtc !== after.barStartUtc ||
          bar.barEndUtc !== after.barEndUtc,
      )
    ) {
      return incoherent(attempt, "MIXED_BAR_INTERVAL", attemptCount, callCount);
    }
    if (attempt.bars.length === 0) {
      return await this.#unavailable(
        attempt,
        "NO_USABLE_EVIDENCE",
        attemptCount,
        callCount,
        signal,
      );
    }
    const complete =
      attempt.coverage.successfulCount === attempt.coverage.requestedCount &&
      attempt.coverage.failedCount === 0 &&
      attempt.coverage.missingCount === 0 &&
      attempt.coverage.unexpectedCount === 0 &&
      attempt.coverage.duplicateCount === 0;
    return Object.freeze({
      availabilityState: complete ? "AVAILABLE" : "PARTIAL",
      coverageState: complete ? "COMPLETE" : "PARTIAL",
      coherenceState: "COHERENT",
      reason: complete ? "COMPLETE" : "PARTIAL_COVERAGE",
      metadataBefore: attempt.metadataBefore,
      metadataAfter: attempt.metadataAfter,
      bars: attempt.bars,
      coverage: attempt.coverage,
      healthDiagnostic: NOT_RUN_HEALTH,
      attemptCount,
      callCount,
    });
  }

  async #unavailable(
    attempt: Attempt,
    reason: "METADATA_BEFORE_UNAVAILABLE" | "NO_USABLE_EVIDENCE",
    attemptCount: 1 | 2,
    callCount: number,
    signal?: AbortSignal,
  ): Promise<GovernedSnapshotResult> {
    const hasBudget = callCount < this.#maximumCallsPerInvocation;
    let healthDiagnostic: SnapshotHealthDiagnostic;
    let finalCallCount = callCount;
    if (!hasBudget) {
      healthDiagnostic = health("SKIPPED_BUDGET");
    } else {
      finalCallCount += 1;
      try {
        await this.#source.getHealth(signal);
        healthDiagnostic = health("REACHABLE");
      } catch {
        healthDiagnostic = health("UNREACHABLE");
      }
    }
    return Object.freeze({
      availabilityState: "UNAVAILABLE",
      coverageState: "NONE",
      coherenceState: "NOT_EVALUATED",
      reason,
      metadataBefore: attempt.metadataBefore,
      metadataAfter: attempt.metadataAfter,
      bars: attempt.bars,
      coverage: attempt.coverage,
      healthDiagnostic,
      attemptCount,
      callCount: finalCallCount,
    });
  }
}

function hasRollover(attempt: Attempt): boolean {
  return (
    attempt.metadataBefore !== null &&
    attempt.metadataAfter !== null &&
    attempt.metadataBefore.barStartUtc !== null &&
    attempt.metadataBefore.barEndUtc !== null &&
    (attempt.metadataBefore.barStartUtc !== attempt.metadataAfter.barStartUtc ||
      attempt.metadataBefore.barEndUtc !== attempt.metadataAfter.barEndUtc)
  );
}

function incoherent(
  attempt: Attempt,
  reason: GovernedSnapshotResult["reason"],
  attemptCount: 1 | 2,
  callCount: number,
): GovernedSnapshotResult {
  return Object.freeze({
    availabilityState: "INCOHERENT",
    coverageState:
      attempt.bars.length === 0
        ? "NONE"
        : attempt.coverage.successfulCount === attempt.coverage.requestedCount
          ? "COMPLETE"
          : "PARTIAL",
    coherenceState: "INCOHERENT",
    reason,
    metadataBefore: attempt.metadataBefore,
    metadataAfter: attempt.metadataAfter,
    bars: attempt.bars,
    coverage: attempt.coverage,
    healthDiagnostic: NOT_RUN_HEALTH,
    attemptCount,
    callCount,
  });
}

function normalizeBars(
  instruments: readonly string[],
  attempts: readonly BarAttempt[],
): {
  readonly bars: readonly CompletedBarLexemes[];
  readonly coverage: SnapshotCoverage;
} {
  const expected = new Set(instruments);
  const accepted = new Map<string, CompletedBarLexemes>();
  const failed = new Set<string>();
  const unexpected = new Set<string>();
  const duplicates = new Set<string>();
  for (const attempt of attempts) {
    if (attempt.failed || attempt.bar === null) {
      failed.add(attempt.requestedInstrument);
      continue;
    }
    if (!expected.has(attempt.bar.currency)) {
      unexpected.add(attempt.bar.currency);
      failed.add(attempt.requestedInstrument);
      continue;
    }
    if (accepted.has(attempt.bar.currency)) {
      duplicates.add(attempt.bar.currency);
      failed.add(attempt.requestedInstrument);
      continue;
    }
    accepted.set(attempt.bar.currency, attempt.bar);
  }
  const missing = instruments.filter((instrument) => !accepted.has(instrument));
  const bars = instruments.flatMap((instrument) => {
    const value = accepted.get(instrument);
    return value === undefined ? [] : [value];
  });
  const coverage: SnapshotCoverage = Object.freeze({
    requestedCount: instruments.length,
    successfulCount: bars.length,
    failedCount: failed.size,
    missingCount: missing.length,
    unexpectedCount: unexpected.size,
    duplicateCount: duplicates.size,
    missingInstruments: Object.freeze(missing),
    failedInstruments: Object.freeze([...failed].sort()),
    unexpectedInstruments: Object.freeze([...unexpected].sort()),
    duplicateInstruments: Object.freeze([...duplicates].sort()),
  });
  return { bars: Object.freeze(bars), coverage };
}

function emptyCoverage(instruments: readonly string[]): SnapshotCoverage {
  return Object.freeze({
    requestedCount: instruments.length,
    successfulCount: 0,
    failedCount: instruments.length,
    missingCount: instruments.length,
    unexpectedCount: 0,
    duplicateCount: 0,
    missingInstruments: Object.freeze([...instruments]),
    failedInstruments: Object.freeze([...instruments]),
    unexpectedInstruments: Object.freeze([]),
    duplicateInstruments: Object.freeze([]),
  });
}

function health(
  status: SnapshotHealthDiagnostic["status"],
): SnapshotHealthDiagnostic {
  return Object.freeze({
    status,
    establishesMarketState: false,
    establishesFreshness: false,
    establishesCoherence: false,
    establishesFitness: false,
  });
}

function validateAndSortInstruments(
  instruments: readonly string[],
): readonly string[] {
  const stable = [...instruments].sort();
  if (stable.length === 0 || new Set(stable).size !== stable.length) {
    throw new TypeError("Snapshot instruments must be a non-empty unique set.");
  }
  return Object.freeze(stable);
}

async function mapConcurrentSettled<TInput, TOutput>(
  inputs: readonly TInput[],
  maximumConcurrency: number,
  operation: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const output = new Array<TOutput>(inputs.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < inputs.length) {
      const index = nextIndex;
      nextIndex += 1;
      const input = inputs[index];
      if (input === undefined) return;
      output[index] = await operation(input);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(maximumConcurrency, inputs.length) }, worker),
  );
  return output;
}
