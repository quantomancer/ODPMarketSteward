# WP03 Descriptive OHLC Calculations Report

- Work item: `WP03-005`
- Related records: `DLD-007`, `OD-008`, `WP00-002`, `T2`, `G2`
- Evidence time: `2026-07-21T15:21:18Z`
- Tested implementation revision: pending immutable repository commit
- Runtime: checksum-matched Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Remote scope: no Cloudflare, source API, ChatGPT host, staging, or public endpoint was accessed

## Outcome

The approved decimal calculation and presentation policy is now versioned in ADR-003, ODPS product contract `1.1.1` companion references, OHLC rules `1.1.0`, requirements normalization `1.2.0`, MCP application contract `1.3.0`, Functional Requirements Draft `0.4`, Technical Requirements Draft `0.2`, Detailed Level Design Draft `0.2`, professional documentation `1.2.0`, README `1.2.0`, and governed bundle `1.3.0`.

The pure domain package implements nine deterministic descriptive metrics after OHLC hard validity passes:

- close minus open;
- percentage movement;
- basis-point movement;
- absolute range;
- range in basis points;
- absolute body;
- upper wick;
- lower wick; and
- body-to-range ratio.

Every calculated result is classified `DESCRIPTIVE_OBSERVATION`. It is not a forecast, recommendation, signal, order, or execution instruction. Failed OHLC hard validity returns `SUPPRESSED` with null machine and display metric sets.

## Governed arithmetic and display behavior

The calculator receives its policy from the verified contract registry. It fails closed when the governed policy differs from the supported implementation contract.

- Arithmetic uses arbitrary-precision decimal with 34 significant digits and `ROUND_HALF_EVEN`.
- Machine metrics are separately returned as canonical decimal strings without presentation rounding.
- Display rounding occurs only at the presentation boundary.
- JPY- and HUF-quoted price values and quote-currency deltas display 3 decimal places; the other governed instruments display 5.
- Percentage and basis-point displays use 2 decimal places; ratios use 4.
- Nonzero rounded values retain trailing zeros; rounded signed zero is exactly `0`.
- A zero-range bar returns a body-to-range ratio of `0` rather than dividing by zero.

The MCP movement-summary metric enum now includes `percentageMovement` and `absoluteBody`, so the application contract exposes every implemented metric plus the still-separate `crossBarGap` calculation.

## Golden-vector coverage

- Exact machine values remain distinct from rounded display values.
- A repeating percentage and ratio exercise the 34-significant-digit calculation boundary.
- Standard five-decimal, JPY three-decimal, and HUF three-decimal price presentation rules are covered.
- Half-even ties, retained nonzero trailing zeros, and rounded negative zero are covered.
- Flat bars return canonical and display zero across all metrics.
- Invalid OHLC ordering suppresses all calculations.
- An unsupported policy and malformed instrument identifier fail before a calculated result is returned.
- Contract tests resolve the approved arithmetic policy and the newly added percentage/body formulas from the verified governed bundle.

## Exact verification

The final repository `verify` command completed with exit code `0` under the exact pinned runtime:

- governed bundle compilation: `PASS`, seven runtime artifacts, bundle `1.3.0`, six declared tools, and twelve standalone schemas;
- Wrangler generated-type drift, TypeScript, ESLint, Prettier, and dependency-cruiser: passed; 44 modules and 45 dependencies with zero violations;
- Vitest coverage suite: twelve test files and 125 tests passed;
- total coverage: 92.97% statements, 86.68% branches, 97.12% functions, and 93.88% lines;
- `ohlc-calculations.ts`: 97.67% statements, 97.14% branches, 100% functions, and 97.67% lines;
- component and Worker production builds: passed; and
- local Workerd reconnect smoke: restart persistence, session return, profile discovery, and `MARKET DATA DEMO` classification passed.

The final documentary controls also passed: all 13 manifest artifacts existed, were nonempty, and matched their declared SHA-256 digests; six maintained HTML documents had balanced selected structural tags, 145 resolving local links, and 75 resolving anchors; all 146 plan records had unique and consistent checkbox/data/text/status state with 26 true and 120 false; `git diff --check` passed; and the focused public-safety scan returned no match for the prohibited upstream-provider identity, private credential-service name, legacy credential label, local user path, or private live-account label.

## Corrected findings

- The first TypeScript run exposed a legacy `OhlcStrings` import and an over-constrained nested hard-validity annotation. A compatibility type alias was retained and only the nested annotation was corrected; runtime results still carry explicit `PASS` or `FAIL` evidence.
- The first focused calculation suite passed 45 of 46 tests. The failed assertion expected non-canonical trailing zeros in the machine upper-wick value. The assertion was corrected to the approved canonical machine value, and the focused suite then passed all 46 calculation tests and 73 tests across the six affected files.
- The first post-versioning format check found four ordinary style differences. The pinned formatter corrected them, after which ESLint, Prettier, dependency analysis, type checking, and the full verification pipeline passed.
- One sandboxed type-check attempt generated runtime types but could not write Wrangler's log or `worker-configuration.d.ts`; it was not counted as completed evidence. The exact command was rerun with the approved external-repository write scope and completed successfully.

## Files

- `Documentation/decisions/ADR-003-Decimal-Calculation-and-Presentation-Policy.md`
- `Documentation/ODPMarketStewardBundle/product/fxlive.odps.yaml`
- `Documentation/ODPMarketStewardBundle/rules/ohlc-rules.yaml`
- `Documentation/ODPMarketStewardBundle/application/mcp-application.yaml`
- `Documentation/ODPMarketStewardBundle/requirements/bundle-requirements.yaml`
- `Documentation/ODPMarketStewardBundle/requirements/FuncitionalRequirements.html`
- `Documentation/ODPMarketStewardBundle/requirements/TechnicalRequirements.html`
- `Documentation/ODPMarketStewardBundle/design/DetailedLevelDesign.html`
- `Documentation/ODPMarketStewardBundle/bundle.yaml`
- `packages/contract-runtime/src/registry.ts`
- `packages/domain/src/ohlc-calculations.ts`
- `packages/domain/src/ohlc-validity.ts`
- `packages/domain/src/index.ts`
- `tests/contract/governed-bundle.test.ts`
- `tests/unit/market-math.test.ts`

## Limitations

This increment does not implement prior-bar continuity or `crossBarGap`, normalized aggregate composition, coherent live retrieval, market calendar, freshness, plausibility, service-state classification, purpose fitness, the remaining five MCP handlers, the ChatGPT component experience, or deployment.

`T2` and `G2` therefore remain partial. This is local deterministic and contract evidence, not live-source, staging, Cloudflare, ChatGPT-host, rights, or competition-release evidence.
