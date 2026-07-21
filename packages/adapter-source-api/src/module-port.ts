export interface MarketSourceClient {
  getHealth(signal?: AbortSignal): Promise<unknown>;
  getSnapshotMetadata(signal?: AbortSignal): Promise<unknown>;
  getLatestObservation(
    instrument: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
