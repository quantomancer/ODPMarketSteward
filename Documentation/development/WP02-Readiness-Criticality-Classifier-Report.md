# WP02 Readiness and Criticality Classifier Report

- Work item: `WP02-005`
- Evidence time: `2026-07-21T13:10:52Z`
- Tested source baseline: `6157f1af1f3fcf6bb3ed4e0d8d3dae7feab59c6d` plus the uncommitted changes described below
- Runtime: checksum-verified Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Scope: local deterministic contract policy, registry integration, fixture matrix, and full repository verification
- Remote scope: no Cloudflare, source API, ChatGPT host, or other remote service was accessed

## Outcome

The runtime contract package now exposes an operation-specific readiness classifier and the `ContractRegistry.readiness(request)` entry point. A verdict is no longer a single bundle-wide boolean.

Every operation requires the verified bundle manifest, MCP application contract, and publication policy. Market operations additionally require the product contract, OpenAPI contract, FX-35 instrument set, OHLC rules, and monitoring policy. Product-profile readiness is narrowed to the requested sections, while preserving the common disclosure and serialization controls.

The classifier returns one of three explicit states:

- `READY`: every operation-required artifact is verified and no required validation observation failed or remains untested;
- `DEGRADED`: required evidence is explicitly `NOT_TESTED`, with certification, SDK-compatibility, or source-alignment claims disabled as applicable;
- `BLOCKED`: an operation-required artifact is missing or has a failed validation observation.

Failures outside the requested profile section are retained as `nonBlockingFailures`; they are not hidden or converted to success evidence. Rules and monitoring failures remain blocking for every current market operation because the version-one raw degraded market path has not been implemented and schema-parity tested.

## Fixture matrix

| Fixture | Operation / scope | Expected result | Verified behavior |
|---|---|---:|---|
| All required identity inputs verified | Product profile: identity | `READY` | Passed |
| OpenAPI controlling-schema failure | Product profile: identity | `READY`, failure disclosed as non-blocking | Passed |
| OpenAPI semantic failure | Product profile: access | `BLOCKED` | Passed |
| FX-35 instrument-set failure | Market board | `BLOCKED` | Passed |
| OHLC rules failure with no proven raw path | Instrument view | `BLOCKED` | Passed |
| Monitoring failure | Service assessment | `BLOCKED` | Passed |
| Publication-policy failure | Demo acknowledgement | `BLOCKED` | Passed |
| Missing bundle manifest | Product profile: identity | `BLOCKED` | Passed |
| Required SDK evidence `NOT_TESTED` | Product profile: identity | `DEGRADED` | Passed |
| Multiple required failures | Movement summary | `BLOCKED`, every reason retained | Passed |
| Required SDK and source evidence `NOT_TESTED` | Product profile: access | `DEGRADED`, named claims disabled | Passed |

## Exact verification

The repository's full `verify` command completed with exit code `0` under the pinned runtime. It produced and checked:

- governed bundle compilation: `PASS`, seven runtime artifacts, bundle `1.2.0`, six declared tools, twelve standalone schemas;
- Wrangler generated-type drift check, TypeScript, ESLint, Prettier, and dependency-cruiser: passed, with 39 modules and 35 dependencies and zero violations;
- Vitest coverage suite: eight test files and 37 tests passed;
- total coverage: 89.47% statements, 79.01% branches, 95.71% functions, and 90.87% lines;
- `readiness.ts`: 100% statement, function, and line coverage, and 92.30% branch coverage;
- component and Worker production builds: passed;
- local Workerd reconnect smoke: persisted restart, session return, `get_fx_product_profile` discovery, and `MARKET DATA DEMO` classification passed.

## Files

- `packages/contract-runtime/src/readiness.ts`
- `packages/contract-runtime/src/registry.ts`
- `packages/contract-runtime/src/index.ts`
- `tests/contract/readiness.test.ts`
- `tests/contract/governed-bundle.test.ts`

## Limitations and next boundary

The classifier is implemented and integrated with the verified runtime registry, and the safe-continuation/fail-closed fixture matrix passes. The current `BundleLoader` still creates a registry only after all seven runtime artifacts pass strict startup integrity checks. It does not yet create a partial snapshot after a loader-level artifact failure. Therefore, safe continuation is proven at the operation-policy layer using explicit validation observations, but recovery from a strict loader failure is not wired into a production handler.

Only `get_fx_product_profile` is registered. Handler gating, typed `CONTRACT_UNAVAILABLE` mapping from readiness, complete multi-tool registry projections, and five remaining tool handlers are separate open work. No live-market or public-cloud behavior is claimed by this report.
