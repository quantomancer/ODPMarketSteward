export interface MaterializedToolSchemaPair {
  readonly input: Readonly<Record<string, unknown>>;
  readonly output: Readonly<Record<string, unknown>>;
}

export function materializeToolSchemas(
  contract: unknown,
): Record<string, MaterializedToolSchemaPair>;
