export interface AcknowledgementService {
  issueChallenge(sessionId: string, nowUtc: string): Promise<unknown>;
  acknowledge(input: unknown, nowUtc: string): Promise<unknown>;
}

export interface SnapshotAssembler {
  assemble(instruments: readonly string[]): Promise<unknown>;
}

export interface StateClassifier {
  classify(evidence: unknown, nowUtc: string): unknown;
}

export interface EvidenceSelector {
  select(input: unknown): unknown;
}

export interface StewardBriefService {
  createBrief(deterministicEvidence: unknown): Promise<unknown>;
}

export interface ResultEnvelopeBuilder {
  build(structuredContent: unknown): unknown;
}
