# WP03 OHLC Hard-Validity Report

- Work item: `WP03-004`
- Related records: `T2`, `G2`
- Evidence time: `2026-07-21T14:40:59Z`
- Tested implementation revision: `796f2882907db93fc66ad24616ec89d677cd0911`
- Runtime: checksum-matched Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Remote scope: no Cloudflare, source API, ChatGPT host, staging, or public endpoint was accessed

## Outcome

The pure domain package now implements the OHLC portion of governed rule `completed-bar-mathematical-integrity` using exact `DecimalValue` comparisons. The validator evaluates:

- all four inputs must parse as finite decimal lexemes under the bounded lossless JSON-number grammar;
- Open, High, Low, and Close must each be strictly greater than zero;
- Low must be less than or equal to High;
- Low must be less than or equal to Open and Close; and
- High must be greater than or equal to Open and Close.

The result carries the governed rule identifier, `PASS` or `FAIL`, exact canonical values when parsing succeeds, explicit failed conditions and involved fields, and any conditions suppressed because their required decimal inputs did not parse. Malformed numeric evidence produces `FAIL` with dependent comparisons suppressed rather than generating invented secondary failures.

The result always exposes `plausibilityEffect: NONE`. Statistical unusualness is not evaluated here and cannot change the hard-validity result.

`DecimalValue` now provides exact positive and less-than-or-equal comparisons over its internal arbitrary-precision value. No represented OHLC value is coerced through JavaScript `Number`.

## Property and boundary coverage

- A standard valid bar passes and returns canonical exact values.
- Four inclusive boundaries pass, including flat bars, Low equal to Open, High equal to Close, and nanosecond-scale decimal differences.
- A deterministic generated matrix evaluates all 105 positive ordered OHLC tuples drawn from five values spanning `0.000000000000000001` through `999999999999999999.999999999999999999`; every tuple passes.
- `NaN`, positive and negative infinity tokens, whitespace, and an unsafe exponent fail decimal parsing and suppress positive/order comparisons.
- Zero, negative zero, and a negative exponent-scale value fail strict positivity in each of Open, High, Low, and Close.
- Simultaneous Low/High/Open/Close ordering violations report all three applicable ordering conditions.
- An isolated High-below-Open case reports only the applicable upper-bound condition.
- Multiple malformed fields are reported together.
- A contract test resolves the governed rule by the implementation rule identifier and checks all eight declared pass-condition statements, including the instrument, granularity, UTC interval, duration, OHLC positivity, and ordering conditions.

## Exact verification

The final repository `verify` command completed with exit code `0` under the exact pinned runtime:

- governed bundle compilation: `PASS`, seven runtime artifacts, bundle `1.2.0`, six declared tools, and twelve standalone schemas;
- Wrangler generated-type drift, TypeScript, ESLint, Prettier, and dependency-cruiser: passed; 43 modules and 42 dependencies with zero violations;
- Vitest coverage suite: twelve test files and 118 tests passed;
- total coverage: 92.73% statements, 85.67% branches, 96.89% functions, and 93.71% lines;
- domain package: 97.57% statements and 98.00% lines;
- `ohlc-validity.ts`: 94.28% statements, 91.66% branches, 100% functions, and 97.05% lines;
- component and Worker production builds: passed; and
- local Workerd reconnect smoke: restart persistence, session return, profile discovery, and `MARKET DATA DEMO` classification passed.

The final focused gate ran TypeScript, ESLint, Prettier, dependency analysis and three test files independently; every command exited `0`, and 46 tests passed.

## Corrected findings

- The first focused behavioral suite passed 45 tests, while the following static gate found one unnecessary test-only type assertion and two formatting differences. The assertion and formatting were corrected before the final focused and full passes.
- After the invariant matrix was added, its 46 focused tests passed but its first formatting check failed. Because that shell command list continued to later commands, its final process exit was not used as clean evidence. The file was formatted and TypeScript, ESLint, Prettier, dependency analysis, and tests were then rerun as independent commands with exit code `0` each.
- One full verification completed successfully before the invariant matrix was added. It is superseded by the final full run containing 118 tests and the 105-tuple matrix.

## Files

- `packages/domain/src/decimal.ts`
- `packages/domain/src/ohlc-validity.ts`
- `packages/domain/src/index.ts`
- `tests/contract/governed-bundle.test.ts`
- `tests/unit/ohlc-validity.test.ts`

## Limitations

This increment implements only the OHLC numeric portion of `completed-bar-mathematical-integrity`. Exact instrument membership and UTC interval validation exist as separately tested foundations, but a normalized bar aggregate does not yet compose all rule conditions. Required-field handling, source normalization, coherent live snapshot assembly, descriptive calculations, cross-bar continuity, market calendar, freshness, plausibility, and purpose fitness remain separate work.

`T2` and `G2` therefore remain partial. This is local deterministic foundation evidence, not live-source, staging, deployment, or competition-release evidence.
