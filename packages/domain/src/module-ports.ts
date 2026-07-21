export interface BarNormalizer {
  normalize(rawBar: unknown): unknown;
}

export interface EvaluationEngine {
  evaluate(normalizedEvidence: unknown): unknown;
}
