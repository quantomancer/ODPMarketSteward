import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export function materializeToolSchemas(contract) {
  if (!Array.isArray(contract.tools) || contract.tools.length !== 6) {
    throw new Error("MCP application contract must declare exactly six tools.");
  }
  if (!isRecord(contract.schemas)) {
    throw new Error("MCP application contract has no schemas object.");
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const result = {};
  for (const tool of contract.tools) {
    if (!isRecord(tool) || typeof tool.name !== "string") {
      throw new Error("Every MCP tool must have a string name.");
    }
    if (Object.hasOwn(result, tool.name)) {
      throw new Error(`Duplicate MCP tool name: ${tool.name}`);
    }
    const input = materializeSchema(
      contract.schemas,
      tool.inputSchema,
      tool.name,
      "input",
      contract.metadata?.version,
    );
    const output = materializeSchema(
      contract.schemas,
      tool.outputSchema,
      tool.name,
      "output",
      contract.metadata?.version,
    );
    for (const [direction, schema] of Object.entries({ input, output })) {
      try {
        ajv.compile(schema);
      } catch (error) {
        throw new Error(
          `${tool.name} ${direction} is not a valid standalone JSON Schema: ${String(error)}`,
          { cause: error },
        );
      }
    }
    result[tool.name] = { input, output };
  }
  return result;
}

function materializeSchema(schemas, root, toolName, direction, version) {
  const rootName = localSchemaReference(root, `${toolName} ${direction}`);
  const orderedNames = [];
  const completed = new Set();
  const active = [];
  const visit = (name) => {
    if (active.includes(name)) {
      throw new Error(
        `${toolName} ${direction}: unsupported schema reference cycle ${[
          ...active,
          name,
        ].join(" -> ")}`,
      );
    }
    if (completed.has(name)) return;
    const schema = schemas[name];
    if (schema === undefined) {
      throw new Error(`${toolName} ${direction}: missing schema ${name}.`);
    }
    active.push(name);
    for (const reference of collectLocalReferences(schema)) visit(reference);
    active.pop();
    completed.add(name);
    orderedNames.push(name);
  };
  visit(rootName);
  const definitions = {};
  for (const name of orderedNames) {
    definitions[name] = rewriteReferences(
      globalThis.structuredClone(schemas[name]),
    );
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `urn:odp-market-steward:mcp:${toolName}:${direction}:v${String(version)}`,
    title: `${toolName} ${direction}`,
    $ref: `#/$defs/${rootName}`,
    $defs: definitions,
  };
}

function localSchemaReference(value, context) {
  if (!isRecord(value) || typeof value.$ref !== "string") {
    throw new Error(`${context}: expected one local schema reference.`);
  }
  const prefix = "#/schemas/";
  if (!value.$ref.startsWith(prefix) || value.$ref.length === prefix.length) {
    throw new Error(`${context}: unsupported reference ${value.$ref}.`);
  }
  return value.$ref.slice(prefix.length);
}

function collectLocalReferences(value) {
  const references = [];
  walk(value, (candidate) => {
    if (typeof candidate === "string" && candidate.startsWith("#/schemas/")) {
      references.push(candidate.slice("#/schemas/".length));
    }
  });
  return [...new Set(references)];
}

function rewriteReferences(value) {
  if (Array.isArray(value)) return value.map(rewriteReferences);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, candidate]) => [
      key,
      key === "$ref" &&
      typeof candidate === "string" &&
      candidate.startsWith("#/schemas/")
        ? candidate.replace("#/schemas/", "#/$defs/")
        : rewriteReferences(candidate),
    ]),
  );
}

function walk(value, visitor) {
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) walk(item, visitor);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
