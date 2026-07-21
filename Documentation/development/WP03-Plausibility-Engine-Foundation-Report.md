# WP03 Plausibility Engine Foundation Report

- Work item: `WP03-007` — remains `PARTIAL` and `false`
- Related records: `DLD-008`, `T2`, `G2`
- Evidence time: `2026-07-21T16:28:32Z`
- Tested implementation revision: `975f23f5b30b994895de0225607c8c5047812bb2`
- Runtime: checksum-matched Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Remote scope: no Cloudflare, source API, ChatGPT host, staging, or public endpoint was accessed

## Outcome

The domain package now contains a deterministic, parameterized implementation of the governed `rolling_median_and_median_absolute_deviation` method. It does not establish or silently infer production parameters. When the owning configuration is `UNCONFIGURED`, the evaluator returns `NOT_EVALUATED` before inspecting supplied observations.

For explicitly configured test scenarios, the evaluator:

- requires a positive integer UTC lookback window, a minimum sample size of at least three, a positive MAD threshold, and an explicit inclusive `GREATER_THAN_OR_EQUAL` comparison;
- uses strict UTC-Z timestamps and exact decimal arithmetic;
- includes reference observations on the lookback boundary and excludes older observations;
- rejects future, malformed, or non-decimal evidence;
- returns `NOT_EVALUATED` for insufficient samples and zero MAD;
- computes exact odd and even medians, median absolute deviation, absolute deviation, and the MAD score; and
- classifies the score as `UNUSUAL` only when it reaches or exceeds the supplied threshold.

Every result states `hardValidityEffect: NONE` and `tradingSignalEffect: PROHIBITED`. Statistical plausibility therefore neither changes hard OHLC validity nor becomes a trading recommendation.

## Focused fixture evidence

The focused plausibility suite passed 17 tests covering:

- unconfigured fail-safe behavior without evidence inspection;
- invalid lookback, minimum, threshold, and comparison configuration;
- deterministic `NORMAL` and `UNUSUAL` results;
- an exact inclusive threshold-boundary result;
- inclusive UTC lookback filtering and insufficient-sample behavior;
- exclusion of evidence older than the UTC window;
- future and malformed observation/reference evidence;
- zero-MAD behavior; and
- exact even-sample medians.

TypeScript strict checking and focused ESLint also passed.

## Full repository verification

The repository `pnpm verify` command completed with exit code `0` under the exact pinned runtime:

- governed bundle compilation: `PASS`, seven runtime artifacts, bundle `1.4.0`, six declared tools, and twelve standalone schemas;
- Wrangler generated-type drift, TypeScript, ESLint, Prettier, and dependency-cruiser: passed; 45 modules and 50 dependencies with zero violations;
- Vitest coverage suite: 14 test files and 155 tests passed;
- total coverage: 93.38% statements, 87.15% branches, 97.35% functions, and 94.17% lines;
- `plausibility.ts`: 96.36% statements, 90.90% branches, 100% functions, and 96.22% lines;
- component and Worker production builds: passed; and
- local Workerd reconnect smoke: restart persistence, session return, profile discovery, and `MARKET DATA DEMO` classification passed.

## Files

- `packages/domain/src/plausibility.ts`
- `packages/domain/src/index.ts`
- `tests/unit/plausibility.test.ts`

## Open decision and limitations

`DLD-008` remains open. The product owner has not approved:

- the production UTC lookback window;
- the production minimum sample size;
- the production MAD alert threshold; or
- whether the threshold comparison is inclusive or strict.

The implementation uses an explicit inclusive comparison only in test-supplied configurations so that boundary semantics are deterministic and reviewable. This is not a production-policy decision. The governed bundle remains `UNCONFIGURED`, and no public plausibility classification is enabled.

Reference-sample eligibility beyond the mechanical UTC window also needs ratification: the caller must provide the intended historical series and exclude the target observation unless the approved policy says otherwise. No history is inferred, retrieved, or persisted by this pure evaluator.

Accordingly, `WP03-007`, `DLD-008`, `T2`, and `G2` remain false. This report proves a local deterministic engine foundation, not approved production plausibility behavior, live-source integration, staging, deployment, or ChatGPT-host behavior.
