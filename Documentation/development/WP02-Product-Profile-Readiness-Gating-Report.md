# WP02 Product-Profile Readiness Gating Report

- Work item: `WP02-006`
- Related work: `WP02-004`, `WP02-005`, `WP06-002`, `WP06-004`, `T1`, `T5`, `G4`
- Evidence time: `2026-07-21T13:39:15Z`
- Tested source baseline: `bb71ad463263fe8a21dabd269346ac2d66c80868` plus the uncommitted changes described below
- Runtime: checksum-verified Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Remote scope: no Cloudflare, source API, ChatGPT host, staging, or public endpoint was accessed

## Outcome

The registered `get_fx_product_profile` handler now evaluates operation-specific contract readiness before producing a successful profile result.

- A required contract failure returns the existing schema-valid `ToolErrorOutput` branch with `isError: true`, code `CONTRACT_UNAVAILABLE`, a safe non-retryable next action, an opaque correlation identifier, and the verified `MARKET DATA DEMO` disclaimer.
- Required `NOT_TESTED` evidence produces a successful but explicit `DEGRADED` profile summary. Disabled certification, SDK-compatibility, and source-alignment claims are named as applicable; no unexecuted validation is promoted to `PASS`.
- A failure outside the requested profile section remains non-blocking for that operation, is retained by the classifier, and is disclosed in the structured profile summary.
- Malformed arguments remain MCP protocol errors rather than application error results.
- The use case remains network-free. It reads only the embedded verified governed bundle and does not call the market source.

The handler converts the registry's validation-layer results into typed readiness observations. Unknown runtime artifact identities fail explicitly instead of being cast into the readiness model. Dependency injection supplies deterministic time, correlation ID, registry, and additional build/runtime validation observations for testing without changing production defaults.

## Focused handler cases

| Case | Expected behavior | Result |
|---|---|---:|
| Normal identity/instrument/validation request with required validation evidence not tested | Schema-valid success; explicit `DEGRADED` summary | Passed |
| Required product-contract semantic failure | `isError: true`; `CONTRACT_UNAVAILABLE`; exact disclaimer; deterministic test correlation ID | Passed |
| OpenAPI controlling-schema failure for identity-only profile | Continue; disclose non-blocking failure in summary | Passed |
| Missing required input sections | MCP argument/protocol error; no typed application output | Passed |
| Descriptor discovery and generated schema parity | One registered profile tool with exact governed input/output schemas | Passed |
| Component resource | Versioned MCP Apps resource contains product identity and demo disclosure | Passed |

## Exact verification

The final full repository `verify` command completed with exit code `0` under the pinned runtime and produced:

- governed bundle compilation: `PASS`, seven runtime artifacts, bundle `1.2.0`, six declared tools, and twelve standalone schemas;
- Wrangler generated-type drift, TypeScript, ESLint, Prettier, and dependency-cruiser: passed; 39 modules and 35 dependencies with zero violations;
- Vitest coverage suite: eight test files and 40 tests passed;
- total coverage: 89.56% statements, 79.83% branches, 96.15% functions, and 90.85% lines;
- application product-profile assembler: 100% statement, function, and line coverage;
- readiness classifier: 100% statement, function, and line coverage and 96.15% branch coverage;
- component and Worker production builds: passed;
- local Workerd reconnect smoke: restart persistence, session return, profile discovery, and `MARKET DATA DEMO` classification passed.

Two earlier full-verification attempts did not complete: the first stopped at two strict ESLint unsafe-assignment findings in new test assertions, and the second stopped at two TypeScript property-narrowing errors in those assertions. The assertions were corrected without suppressions; only the final completed run is reported as passing evidence.

## Files

- `apps/worker/src/mcp/server.ts`
- `apps/worker/src/mcp/safe-errors.ts`
- `packages/application/src/index.ts`
- `tests/mcp/server.test.ts`

## Limitations

Only the product-profile tool is registered and uses readiness gating. The session acknowledgement gate, the other five tools, cross-tool common gating, market-source retrieval, and ChatGPT-host behavior remain unimplemented or untested.

The strict `BundleLoader` still creates no partial registry after a loader-level failure. The typed handler error is therefore proven for a blocked operation within an available verified registry plus validation observations; it is not evidence of recovery when startup cannot create the registry at all.

This report is local implementation evidence, not staging, deployment, rights, SDK-certification, or competition-release evidence.
