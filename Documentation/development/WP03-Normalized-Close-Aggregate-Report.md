# WP03 Normalized CLOSE Aggregate Report

- Scope: normalized completed-bar composition and MVP plausibility-series selection
- Related records: `DLD-008`, `WP03-001..007`, `WP03-010`, `T2`, `G2`
- Evidence time: `2026-07-21T17:21:58Z`
- Tested implementation revision: `583cad8b0a525f7ab8a9f041bb6f20780d9af4c0`
- Runtime: checksum-matched Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Remote scope: no Cloudflare, source API, ChatGPT host, staging, or public endpoint was accessed

## Outcome

ADR-005 records the product owner's explicit selection of `CLOSE` as the sole MVP plausibility series. OHLC rules 1.4.0 and the verified contract registry expose `targetSeries: CLOSE`; series mixing is prohibited.

The new pure `NormalizedBarEvaluator` composes:

- exact governed instrument membership;
- canonical non-negative Epoch lexeme handling;
- strict one-minute UTC interval validation;
- exact OHLC hard validity;
- governed descriptive calculations;
- provenance-gated prior-bar continuity and cross-bar gap;
- ADR-004 reference eligibility and MAD evaluation using Close values only; and
- explicit safe contextual states while calendar/freshness decisions remain open.

A valid result labels `plausibility.series` as `CLOSE`. The aggregate projects only accepted historical Close values into the scalar evaluator. Open, High, Low, and derived metrics cannot enter that reference series through this path.

## Reference eligibility evidence

The aggregate reports input count, eligible count before statistical-window filtering, and separate exclusion counts for:

- different instrument;
- different granularity;
- invalid Epoch;
- invalid one-minute interval;
- a bar not strictly before the target;
- invalid OHLC; and
- duplicate UTC interval.

Invalid target identity, Epoch, interval, granularity, or OHLC suppresses calculations, gap, and plausibility rather than producing partial derived evidence.

## Verification

The focused gate passed five files and 51 tests. The aggregate-specific suite passed five fixtures covering:

- a valid composed result with exact calculations, prior-bar gap, Close-series `UNUSUAL`, and safe contextual states;
- `NORMAL` immediately below the inclusive MAD threshold;
- all seven history-exclusion categories without series mixing;
- invalid-target dependent-result suppression; and
- independent target identity, Epoch, interval, granularity, and OHLC failures.

The target fixture deliberately uses Open `100` and Close `16` against a historical Close median of `10`. Its MAD score is exactly `6`, proving that the aggregate evaluates Close rather than Open.

The final full `pnpm verify` command completed with exit code `0`:

- bundle `1.6.0`, seven runtime artifacts, six tools, and twelve standalone schemas compiled;
- Wrangler type drift, TypeScript, ESLint, Prettier, and dependency analysis passed with 46 modules and 54 dependencies;
- 15 test files and 162 tests passed;
- total coverage was 93.61% statements, 87.30% branches, 97.43% functions, and 94.58% lines;
- `normalized-bar.ts` achieved 95.71% statements and 98.48% lines;
- component and Worker production builds passed; and
- local Workerd reconnect smoke passed restart persistence, session return, product-profile discovery, and `MARKET DATA DEMO` classification.

All 13 manifest artifacts existed, were nonempty, and matched their declared SHA-256 digests. Six maintained HTML documents passed selected structural checks with 76 resolving local links and 83 anchors. Diff whitespace, stale-version scans, and focused public-safety scans passed.

## Corrected findings

- The first focused formatting run found that TypeScript private identifiers cannot be constructor parameter properties. Explicit private fields were added before any behavioral acceptance claim.
- The next strict type run found an OHLC type imported from the wrong ownership module; the import was corrected.
- ESLint then required two constructor-only imports to be type-only imports. After correction, the focused and full gates passed.
- One combined documentation patch safely failed because an exact context line differed; it applied no changes. Smaller exact patches were used and subsequently validated.

## Remaining boundaries

This aggregate operates on already captured lexical fields. It does not parse an HTTP response body, retrieve history, establish coherent board snapshots, or enforce source deadlines and response-size limits. Those responsibilities begin in WP04.

Calendar, freshness, service state, and fitness remain `UNKNOWN` or `INDETERMINATE` until DLD-005 and DLD-006 close. `WP03-010`, `T2`, and `G2` remain incomplete because the blocked state/fitness decisions and full deterministic evidence package are outstanding.
