# WP03 Prior-Bar Continuity and Gap Report

- Work item: `WP03-006`
- Related records: `T2`, `G2`
- Evidence time: `2026-07-21T15:58:18Z`
- Tested implementation revision: `f2fb151eea87545bc915dfb3a0749b3c019a53d5`
- Runtime: checksum-matched Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Remote scope: no Cloudflare, source API, ChatGPT host, staging, or public endpoint was accessed

## Outcome

The pure domain calculator now evaluates the governed `crossBarGap` formula `Current.Open - Previous.Close` without inventing prior evidence. A gap is returned only when:

- the current OHLC bar passes hard validity;
- a previous bar is explicitly supplied;
- the previous evidence provenance is `AUTHORIZED`;
- both temporal values parse as strict UTC-Z timestamps;
- `Previous.BarEnd` equals `Current.BarStart` exactly at nanosecond precision; and
- the previous close is a valid strictly positive decimal.

Calculated results are classified `DESCRIPTIVE_OBSERVATION`, report `CONSECUTIVE`, preserve canonical UTC evidence, and return separate canonical machine and governed display strings using the existing quote-currency policy.

Missing, unauthorized, or non-adjacent evidence returns `NOT_EVALUATED` with null values. Invalid current OHLC, previous close, or temporal evidence returns `SUPPRESSED`. None of these states fabricates a previous bar or gap.

OHLC rules are versioned at `1.2.0` and the governed bundle at `1.4.0`. The rule contract now states the authorized-provenance condition and distinct not-evaluated versus suppressed outcomes.

## Fixture coverage

- Exact continuity accepts equivalent whole-second and nine-digit fractional UTC notation.
- A positive EURUSD gap preserves its canonical machine value and five-decimal display.
- A small negative USDJPY gap uses three display decimals and normalizes rounded negative zero to `0`.
- Missing previous evidence returns `MISSING_PREVIOUS_BAR`.
- Unauthorized previous evidence returns `UNAUTHORIZED_PREVIOUS_BAR` before its contents are used.
- Previous ends one nanosecond early, one nanosecond late, or one minute late return `NON_CONSECUTIVE_BARS`.
- Malformed current-start or previous-end timestamps return `INVALID_TEMPORAL_EVIDENCE` and suppress the gap.
- Malformed, zero, and negative previous closes return `INVALID_PREVIOUS_CLOSE`.
- A current bar that fails hard validity returns `INVALID_CURRENT_BAR`.
- Contract tests resolve the exact continuity, provenance, and missing/nonconsecutive outcome statements from the verified rules artifact.

## Exact verification

The final repository `verify` command completed with exit code `0` under the exact pinned runtime:

- governed bundle compilation: `PASS`, seven runtime artifacts, bundle `1.4.0`, six declared tools, and twelve standalone schemas;
- Wrangler generated-type drift, TypeScript, ESLint, Prettier, and dependency-cruiser: passed; 44 modules and 46 dependencies with zero violations;
- Vitest coverage suite: thirteen test files and 138 tests passed;
- total coverage: 93.12% statements, 86.87% branches, 97.20% functions, and 94.00% lines;
- `ohlc-calculations.ts`: 97.18% statements and lines, 95.91% branches, and 100% functions;
- component and Worker production builds: passed; and
- local Workerd reconnect smoke: restart persistence, session return, profile discovery, and `MARKET DATA DEMO` classification passed.

The final focused suite passed four files and 65 tests, including every WP03-006 acceptance state.

The final documentary controls also passed: all 13 manifest artifacts existed, were nonempty, and matched their declared SHA-256 digests; six maintained HTML documents had balanced selected structural tags, 147 resolving local links, and 75 resolving anchors; all 146 plan records had unique and consistent checkbox/data/text/status state with 27 true and 119 false; `git diff --check` passed; and the focused public-safety scan returned no prohibited or private-configuration match.

## Corrected findings

- The first focused gate passed TypeScript and ESLint, then stopped at two Prettier-only style differences before tests ran. The files were formatted and all focused static checks passed independently.
- The next focused Vitest process did not start because the sandbox denied Vite's temporary configuration write. It was not treated as test evidence. The exact focused suite was rerun with the approved external-repository write scope and passed 65 tests.

## Files

- `Documentation/ODPMarketStewardBundle/rules/ohlc-rules.yaml`
- `Documentation/ODPMarketStewardBundle/bundle.yaml`
- `packages/domain/src/ohlc-calculations.ts`
- `tests/contract/governed-bundle.test.ts`
- `tests/unit/cross-bar-gap.test.ts`

## Limitations

This increment is pure deterministic-domain behavior. It does not retrieve, select, persist, authorize, or infer a previous bar. It is not yet composed into the movement-summary MCP handler, source adapter, coherent snapshot assembler, or ChatGPT component.

Normalized aggregate composition, live snapshot coherence, market calendar, freshness, plausibility, service state, purpose fitness, the remaining five domain handlers, deployment, and ChatGPT-host verification remain open. `T2` and `G2` therefore remain partial.
