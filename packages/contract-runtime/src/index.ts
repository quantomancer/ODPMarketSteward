import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parseDocument } from "yaml";

export * from "./bundle";
export * from "./readiness";
export * from "./registry";

const instrumentSetSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: true,
  required: ["apiVersion", "kind", "metadata", "spec"],
  properties: {
    apiVersion: { const: "odp-market-steward.qmvp/v1" },
    kind: { const: "ControlledValueSet" },
    metadata: {
      type: "object",
      required: ["id", "version", "status"],
      properties: {
        id: { const: "fxlive-standard-fx35" },
        version: { type: "string", minLength: 1 },
        status: { type: "string", minLength: 1 },
      },
    },
    spec: {
      type: "object",
      required: ["expectedCount", "members", "symbolPattern"],
      properties: {
        expectedCount: { const: 35 },
        symbolPattern: { const: "^[A-Z]{6}$" },
        members: {
          type: "array",
          minItems: 35,
          maxItems: 35,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["symbol", "base", "quote"],
            properties: {
              symbol: { type: "string", pattern: "^[A-Z]{6}$" },
              base: { type: "string", pattern: "^[A-Z]{3}$" },
              quote: { type: "string", pattern: "^[A-Z]{3}$" },
            },
          },
        },
      },
    },
  },
} as const;

export interface ArtifactValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ErrorObject[];
  readonly memberCount: number | null;
  readonly uniqueMemberCount: number | null;
}

export function validateInstrumentSetYaml(
  yamlText: string,
): ArtifactValidationResult {
  const document = parseDocument(yamlText, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    return {
      valid: false,
      errors: document.errors.map((error) => ({
        instancePath: "",
        schemaPath: "#/yaml",
        keyword: "yaml",
        params: {},
        message: error.message,
      })),
      memberCount: null,
      uniqueMemberCount: null,
    };
  }

  const value = document.toJS({ maxAliasCount: 0 }) as unknown;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(instrumentSetSchema);
  const schemaValid = validate(value);
  const members = readMembers(value);
  const symbols = members?.map((member) => member.symbol) ?? [];
  const semanticValid =
    members !== null &&
    symbols.every((symbol, index) => symbol === [...symbols].sort()[index]) &&
    members.every(
      (member) => member.symbol === `${member.base}${member.quote}`,
    ) &&
    new Set(symbols).size === 35;

  const errors = [...(validate.errors ?? [])];
  if (schemaValid && !semanticValid) {
    errors.push({
      instancePath: "/spec/members",
      schemaPath: "#/semantic-membership",
      keyword: "semantic-membership",
      params: {},
      message: "members must be unique, alphabetical, and equal base+quote",
    });
  }

  return {
    valid: Boolean(schemaValid && semanticValid),
    errors,
    memberCount: members?.length ?? null,
    uniqueMemberCount: members === null ? null : new Set(symbols).size,
  };
}

interface InstrumentMember {
  readonly symbol: string;
  readonly base: string;
  readonly quote: string;
}

function readMembers(value: unknown): InstrumentMember[] | null {
  if (typeof value !== "object" || value === null) return null;
  const spec = (value as { spec?: unknown }).spec;
  if (typeof spec !== "object" || spec === null) return null;
  const members = (spec as { members?: unknown }).members;
  if (!Array.isArray(members)) return null;
  if (
    !members.every(
      (member): member is InstrumentMember =>
        typeof member === "object" &&
        member !== null &&
        typeof (member as { symbol?: unknown }).symbol === "string" &&
        typeof (member as { base?: unknown }).base === "string" &&
        typeof (member as { quote?: unknown }).quote === "string",
    )
  ) {
    return null;
  }
  return members;
}
