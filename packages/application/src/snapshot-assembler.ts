import type { CompletedBarLexemes } from "@odp-market-steward/domain";

export interface SnapshotMetadataEvidence {
  readonly epoch: string | null;
  readonly createdAtUtc: string | null;
  readonly granularity: "1m";
  readonly instrumentCount: number;
  readonly barStartUtc: string | null;
  readonly barEndUtc: string | null;
  readonly available: readonly string[];
}

export interface SnapshotSourcePort {
  getSnapshotMetadata(signal?: AbortSignal): Promise<SnapshotMetadataEvidence>;
  getLatestObservation(
    instrument: string,
    signal?: AbortSignal,
  ): Promise<CompletedBarLexemes>;
}

export interface SnapshotAssemblerConfig {
  readonly maximumConcurrency: number;
}

export type SnapshotAssemblyResult =
  | {
      readonly state: "COHERENT";
      readonly targetBarStartUtc: string;
      readonly targetBarEndUtc: string;
      readonly metadataBefore: SnapshotMetadataEvidence;
      readonly metadataAfter: SnapshotMetadataEvidence;
      readonly bars: readonly CompletedBarLexemes[];
      readonly callCount: number;
    }
  | {
      readonly state: "INCOHERENT";
      readonly reason:
        "METADATA_TARGET_MISSING" | "ROLLOVER" | "MIXED_BAR_INTERVAL";
      readonly metadataBefore: SnapshotMetadataEvidence;
      readonly metadataAfter: SnapshotMetadataEvidence;
      readonly bars: readonly CompletedBarLexemes[];
      readonly callCount: number;
    };

export class CoherentSnapshotAssembler {
  readonly #source: SnapshotSourcePort;
  readonly #maximumConcurrency: number;

  constructor(source: SnapshotSourcePort, config: SnapshotAssemblerConfig) {
    if (
      !Number.isSafeInteger(config.maximumConcurrency) ||
      config.maximumConcurrency < 1 ||
      config.maximumConcurrency > 6
    ) {
      throw new RangeError(
        "Snapshot concurrency must be a safe integer from 1 through 6.",
      );
    }
    this.#source = source;
    this.#maximumConcurrency = config.maximumConcurrency;
  }

  async assemble(
    instruments: readonly string[],
    signal?: AbortSignal,
  ): Promise<SnapshotAssemblyResult> {
    const stableInstruments = [...instruments].sort();
    if (
      stableInstruments.length === 0 ||
      new Set(stableInstruments).size !== stableInstruments.length
    ) {
      throw new TypeError(
        "Snapshot instruments must be a non-empty unique set.",
      );
    }
    const metadataBefore = await this.#source.getSnapshotMetadata(signal);
    const bars = await mapConcurrent(
      stableInstruments,
      this.#maximumConcurrency,
      (instrument) => this.#source.getLatestObservation(instrument, signal),
    );
    const metadataAfter = await this.#source.getSnapshotMetadata(signal);
    const callCount = stableInstruments.length + 2;

    if (
      metadataBefore.barStartUtc === null ||
      metadataBefore.barEndUtc === null ||
      metadataAfter.barStartUtc === null ||
      metadataAfter.barEndUtc === null
    ) {
      return Object.freeze({
        state: "INCOHERENT",
        reason: "METADATA_TARGET_MISSING",
        metadataBefore,
        metadataAfter,
        bars: Object.freeze(bars),
        callCount,
      });
    }
    if (
      metadataBefore.barStartUtc !== metadataAfter.barStartUtc ||
      metadataBefore.barEndUtc !== metadataAfter.barEndUtc
    ) {
      return Object.freeze({
        state: "INCOHERENT",
        reason: "ROLLOVER",
        metadataBefore,
        metadataAfter,
        bars: Object.freeze(bars),
        callCount,
      });
    }
    if (
      bars.some(
        (bar) =>
          bar.barStartUtc !== metadataAfter.barStartUtc ||
          bar.barEndUtc !== metadataAfter.barEndUtc,
      )
    ) {
      return Object.freeze({
        state: "INCOHERENT",
        reason: "MIXED_BAR_INTERVAL",
        metadataBefore,
        metadataAfter,
        bars: Object.freeze(bars),
        callCount,
      });
    }
    return Object.freeze({
      state: "COHERENT",
      targetBarStartUtc: metadataAfter.barStartUtc,
      targetBarEndUtc: metadataAfter.barEndUtc,
      metadataBefore,
      metadataAfter,
      bars: Object.freeze(bars),
      callCount,
    });
  }
}

async function mapConcurrent<TInput, TOutput>(
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
