# WP03 FX-35 Membership Foundation Report

- Work item: `WP03-003`
- Related records: `T2`, `G2`
- Evidence time: `2026-07-21T14:17:49Z`
- Tested implementation revision: `3575cb202819da087df24db45a701243c2446622`
- Runtime: checksum-matched Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Remote scope: no Cloudflare, source API, ChatGPT host, staging, or public endpoint was accessed

## Outcome

The verified contract registry now exposes a typed, fail-closed `instrumentSet()` projection from the runtime-required `instrument-set` artifact. It requires the governed values `expectedCount: 35`, `ordering: alphabetical`, `membershipPolicy: exact`, and the six-uppercase-letter symbol pattern. It also rejects a projection whose members do not have exactly 35 unique alphabetically ordered symbols or whose symbols do not equal their three-letter base plus quote decomposition.

The pure domain package now contains `ExactInstrumentSet`. It consumes that verified projection rather than embedding an independent symbol list. The value object:

- exposes the immutable governed member and symbol sequence;
- performs exact, case-sensitive single-instrument membership checks;
- rejects an unknown instrument without normalization or substitution;
- validates an observed board against exact count, membership, uniqueness, and order;
- reports missing, extra, duplicate, and positional order evidence separately; and
- fails closed when given an invalid injected definition.

Order mismatches are reported only when the observed input is otherwise a complete unique set. Missing, extra, or duplicated inputs retain their more direct coverage evidence instead of producing misleading positional noise.

## Golden and boundary coverage

- The exact artifact-derived sequence passes with 35 members from `AUDCAD` through `USDZAR`.
- Removing the last governed member reports `USDZAR` missing and an observed count of 34.
- Adding an unknown identifier twice reports one extra identifier and one duplicate identifier without normalizing it.
- Replacing a governed member with a duplicate reports the displaced member as missing and the repeated governed member as duplicated.
- Swapping the first two members reports exact zero-based positional mismatches while preserving complete membership evidence.
- `EURUSD` passes single-member allowlisting; lowercase `eurusd` is rejected as unknown.
- A duplicated injected definition fails during domain value-object construction.

## Exact verification

The repository's full `verify` command completed with exit code `0` under the exact pinned runtime:

- governed bundle compilation: `PASS`, seven runtime artifacts, bundle `1.2.0`, six declared tools, and twelve standalone schemas;
- Wrangler generated-type drift, TypeScript, ESLint, Prettier, and dependency-cruiser: passed; 42 modules and 40 dependencies with zero violations;
- Vitest coverage suite: eleven test files and 100 tests passed;
- total coverage: 92.59% statements, 85.21% branches, 96.72% functions, and 93.46% lines;
- domain package: 98.22% statements and 98.18% lines;
- `instrument-set.ts`: 100% statements, 96.96% branches, 100% functions, and 100% lines;
- component and Worker production builds: passed; and
- local Workerd reconnect smoke: restart persistence, session return, profile discovery, and `MARKET DATA DEMO` classification passed.

The final focused suite passed three files and 18 tests. An earlier focused execution passed 17 tests and failed one new test assertion because array `toMatchObject` expected equal length. The production behavior was not implicated; the assertion was corrected to check the complete length and first decomposed member explicitly. The first formatting check also identified three style-only differences, which the pinned formatter corrected before the final focused and full passes.

## Files

- `packages/contract-runtime/src/registry.ts`
- `packages/domain/src/instrument-set.ts`
- `packages/domain/src/index.ts`
- `tests/contract/governed-bundle.test.ts`
- `tests/unit/instrument-membership.test.ts`

## Limitations

This increment validates the governed instrument-set projection and deterministic membership or coverage evaluation. It does not retrieve a live board, compare source metadata, assemble a coherent snapshot, register the market-board tool, or establish market-session, freshness, OHLC, plausibility, or purpose-fitness results.

`T2` and `G2` therefore remain partial. This is local deterministic foundation evidence, not live-source, staging, deployment, or competition-release evidence.
