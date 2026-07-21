# WP03 Plausibility Baseline Completion Report

- Work item: `WP03-007`
- Decision: `DLD-008` / `OD-009`
- Related records: `WP00-002`, `T2`, `G2`
- Evidence time: `2026-07-21T16:57:39Z`
- Tested implementation revision: `cf13357a93d89357458053e2edacfa1510361eaa`
- Runtime: checksum-matched Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Remote scope: no Cloudflare, source API, ChatGPT host, staging, or public endpoint was accessed

## Outcome

The product owner approved the recommended contextual plausibility baseline. ADR-004 records the decision, and OHLC rules 1.3.0 are authoritative for:

- an inclusive 3,600-second UTC lookback;
- at least 30 eligible reference bars;
- completed, hard-valid one-minute references for the same instrument and granularity, strictly before and excluding the target;
- an inclusive `GREATER_THAN_OR_EQUAL` MAD threshold of `6`;
- `NOT_EVALUATED` for insufficient samples and zero median absolute deviation;
- no effect on hard validity; and
- prohibition of trading signals.

The contract registry projects the exact five runtime configuration values from the digest-verified rule artifact. Runtime consumers therefore do not require a second hard-coded production configuration.

## Versioned artifacts

- governed bundle `1.5.0`;
- ODPS product contract `1.1.2`, updated only for companion-document version references;
- OHLC rules `1.3.0`;
- MCP application contract `1.4.0`;
- Functional Requirements Draft `0.5`;
- Technical Requirements Draft `0.3`;
- requirements normalization `1.3.0`;
- Detailed Level Design Draft `0.3`;
- bundle documentation and README `1.4.0`; and
- regenerated embedded governed bundle and twelve standalone MCP schemas.

## Acceptance fixtures

The focused gate passed 46 tests across four files. Plausibility-specific coverage includes:

- exact registry projection of `3600`, `30`, `6`, and `GREATER_THAN_OR_EQUAL`;
- a 30-reference `NORMAL` result immediately below the threshold;
- a 30-reference `UNUSUAL` result exactly on the inclusive threshold;
- UTC lookback inclusion and exclusion;
- insufficient sample and zero-MAD `NOT_EVALUATED` branches;
- malformed/future evidence handling;
- exact odd and even medians; and
- hard-validity isolation and trading-signal prohibition.

## Full repository verification

The final `pnpm verify` command completed with exit code `0`:

- bundle compiler: `PASS`, bundle `1.5.0`, seven runtime artifacts, six tools, and twelve standalone schemas;
- Wrangler generated-type drift, TypeScript, ESLint, Prettier, and dependency-cruiser passed with 45 modules and 50 dependencies;
- 14 test files and 157 tests passed;
- total coverage was 93.40% statements, 87.15% branches, 97.36% functions, and 94.19% lines;
- component and Worker production builds passed; and
- local Workerd reconnect smoke passed restart persistence, session return, profile discovery, and `MARKET DATA DEMO` classification.

All 13 manifest artifacts were independently checked for existence, non-emptiness, and exact declared SHA-256. Six maintained HTML documents passed selected structural and local-link checks. Diff whitespace and the focused public-safety scan passed.

## Corrected finding

The first full verification reached and passed compilation, static checks, all 157 tests, coverage, and both builds, but the final reconnect smoke still expected MCP schema IDs from application contract 1.3.0. It rejected the correctly generated 1.4.0 IDs. The smoke expectation was updated to 1.4.0 and the entire full gate was rerun successfully. The failed run is not acceptance evidence.

## Boundary and remaining work

The pure evaluator consumes a typed scalar observation series. The source/snapshot composition layer must select and label the intended OHLC field or derived metric and enforce the approved eligibility predicates before invocation; it must not silently mix series. That integration belongs to later aggregate/source and handler work and does not alter the approved statistical baseline.

`WP03-007` and `DLD-008` are complete. `T2` and `G2` remain partial because normalized aggregate composition, snapshot coherence, authoritative calendar/freshness, state, fitness, live-source integration, and handler wiring remain open. This is local deterministic evidence, not deployment or live-market validation.
