const allowedTelemetryKeys = new Set([
  "classification",
  "correlationId",
  "durationMs",
  "operation",
  "outcome",
  "service",
  "timestampUtc",
]);

export function sanitizeTelemetry(
  candidate: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string | number | boolean>> {
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (
      allowedTelemetryKeys.has(key) &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean")
    ) {
      sanitized[key] = value;
    }
  }
  return Object.freeze(sanitized);
}
