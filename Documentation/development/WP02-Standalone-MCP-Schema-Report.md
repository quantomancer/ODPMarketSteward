# WP02 standalone MCP schema and DLD-001 closure report

- **Evidence timestamp:** 2026-07-21T12:11:47Z
- **Implementation source revision:** `32089ceb4ab213d151be236079388384002eb617`
- **Scope:** DLD-001 and WP06-002 closure; focused progress on WP00-002, WP02-003 and WP02-004
- **Runtime:** checksum-verified Node.js 24.18.0; pnpm 11.15.1
- **Contract baseline:** governed bundle 1.2.0; MCP application contract 1.2.0
- **Cloud boundary:** no deployment, Cloudflare account mutation, secret access, source API call or live market-data request
- **Public classification:** MARKET DATA DEMO; UTC

## Outcome

DLD-001 is resolved by a versioned application-owned tool-error contract and tested MCP mapping. The deterministic compiler now emits exactly twelve independently compilable JSON Schema 2020-12 artifacts: one input and one output for each of the six governed tools. WP06-002 meets its acceptance evidence.

WP02-003 remains in progress rather than complete. The twelve schemas exist and pass focused materialization checks, but five final tool handlers are not yet registered and published descriptor-to-handler parity has therefore not been demonstrated. The current product-profile handler also retains its temporary spike schema.

## Implemented controls

| Control | Inspected result |
|---|---|
| Error taxonomy | Eight stable error codes plus safe message, retryability, safe next action, opaque correlation ID and complete disclaimer. |
| Result mapping | Completed application failures use `isError: true`, schema-valid `structuredContent` and one bounded text summary. |
| Protocol separation | Malformed arguments remain `invalid_params`; initialization, framing and transport failures remain standard JSON-RPC/MCP errors. |
| Standalone generation | Six input/output pairs, unique deterministic IDs, local `$defs`, no enclosing-document dependency. |
| Fail-closed graph walk | Duplicate tool names, missing definitions, cycles and unsupported non-local root references are rejected. |
| JSON Schema compilation | Every generated schema compiles independently with AJV 2020 plus standard formats. |
| Public safety | Generated errors retain MARKET DATA DEMO; contract prohibits stack traces, upstream payloads, credentials and internal identifiers. |

## Exact verification evidence

- Official Node archive `node-v24.18.0-darwin-arm64.tar.gz` matched its published SHA-256 `e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1` before extraction.
- Frozen offline installation covered all 10 workspaces under pnpm 11.15.1.
- Generator result: PASS; 7 runtime artifacts, bundle 1.2.0, 6 tools, 12 standalone schemas.
- Two exact-runtime generations were byte-identical:
  - `generated/governed-bundle.ts`: 132,066 bytes; SHA-256 `422872d1825ff81afa57141c823f88bd5201d738eddabf6aa2c09ac935be67e5`.
  - `generated/standalone-tool-schemas.ts`: 124,902 bytes; SHA-256 `95b6cfee3cf29c5b9d108a86f70044cc308d13a3a0f5315f5f9e02338afb76d1`.
- Lockfile: 145,888 bytes; SHA-256 `e1352f8dd87ef00371dc4f52bc363e02dc28985dd22f90543b5434f88e24521a`.
- Wrangler type drift, strict TypeScript, ESLint and Prettier: pass.
- Dependency-cruiser: 36 modules, 31 dependencies, zero violations.
- Vitest: 7 files and 24 tests passed.
- Coverage: statements 87.67%, branches 78.03%, functions 95.55%, lines 90.04%.
- Component build: `component.css` 1.68 kB and `component.js` 918.29 kB.
- Worker build: `index.js` 2,684.64 kB.
- Local workerd: health readiness, persistent restart, MCP tool discovery and registry-backed product-profile call passed.
- Production dependency audit: no known vulnerabilities.

## Negative and parity scope

Focused negative cases cover missing schema definitions, schema-reference cycles, duplicate tool names, unsupported non-local root references, artifact tampering, duplicate YAML keys, unsafe paths, dependency graph failures, load-order drift, version drift and malformed pointers. The same ToolErrorOutput fixture validates against every generated tool output. Mapping tests prove `isError`, structured-content and protocol-boundary behavior.

The handler-name parity check covers the six contract-declared handler identities. It is not published runtime parity for five unimplemented tools. Raw MCP Inspector and ChatGPT developer-mode tests remain future T5/T9 evidence.

## Remaining limitations

- Five final tool handlers and their published descriptors are not implemented.
- `get_fx_product_profile` has not yet migrated from its focused temporary input/output schema to the normative 1.2.0 success-or-error contract.
- WP02-003, WP02-004, WP02-006, T0, T1 and G0 remain incomplete.
- No Cloudflare staging/live, ChatGPT host, source API, live market, security, accessibility, load, cost or concurrency test was performed.
