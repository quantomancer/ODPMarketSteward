# WP03 Lossless Decimal Foundation Report

- Work item: `WP03-001`
- Related records: `DLD-007`, `T2`, `G2`
- Evidence time: `2026-07-21T13:51:10Z`
- Tested source baseline: `dac3689176d727d9d146a101fd9e02796f4bc994` plus the uncommitted changes described below
- Runtime: checksum-verified Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Remote scope: no Cloudflare, source API, ChatGPT host, staging, or public endpoint was accessed

## Outcome

The domain package now contains a canonical internal `DecimalValue` and the source adapter validates every captured OHLC token against the same strict JSON-number grammar before returning its original lexical representation.

`DecimalValue` preserves four distinct facts:

- the exact source lexeme, including exponent notation and trailing zeros;
- the fraction scale written in the source token;
- the effective fixed-point scale after applying the exponent;
- whether the original token was a negative-zero candidate.

It also exposes a normalized, non-exponential internal canonical string and exact arbitrary-precision equality through the pinned `decimal.js` dependency. The represented decimal value is never converted through JavaScript `Number`. A bounded safe integer conversion is used only for the exponent used to position the decimal point; exponent and expanded-output limits prevent excessive allocation.

The source adapter continues to return raw OHLC lexemes so later normalization can retain raw-versus-normalized evidence. Numeric strings are accepted only when they independently satisfy the exact JSON-number grammar; whitespace, leading plus signs, leading zeros, missing digits, non-finite values, and malformed decimals are rejected.

## Golden vectors

| Source lexeme | Internal canonical | Source scale | Effective scale | Negative-zero candidate |
|---|---:|---:|---:|---:|
| `1.2300` | `1.23` | 4 | 4 | false |
| `1.2300e-2` | `0.0123` | 4 | 6 | false |
| `1.2300E+2` | `123` | 4 | 2 | false |
| `-0.0000` | `0` | 4 | 4 | true |
| `9007199254740993` | `9007199254740993` | 0 | 0 | false |
| `-12.3400e+1` | `-123.4` | 4 | 3 | false |

Additional tests prove exact equality between differently scaled/exponent-form values, rejection of invalid grammar, bounded exponent expansion, preservation of exponent/scale/negative-zero tokens by `lossless-json`, and identical validation for numeric strings.

## Exact verification

The repository's full `verify` command completed with exit code `0` under the pinned runtime:

- governed bundle compilation: `PASS`, seven runtime artifacts, bundle `1.2.0`, six declared tools, and twelve standalone schemas;
- Wrangler generated-type drift, TypeScript, ESLint, Prettier, and dependency-cruiser: passed; 40 modules and 38 dependencies with zero violations;
- Vitest coverage suite: nine test files and 59 tests passed;
- total coverage: 90.95% statements, 82.97% branches, 95.34% functions, and 92.10% lines;
- domain package: 96.61% statements and 96.55% lines;
- `decimal.ts`: 96.07% statements, 94.44% branches, and 96.00% lines;
- component and Worker production builds: passed;
- local Workerd reconnect smoke: restart persistence, session return, profile discovery, and `MARKET DATA DEMO` classification passed.

## Files

- `packages/domain/src/decimal.ts`
- `packages/domain/src/index.ts`
- `packages/adapter-source-api/src/index.ts`
- `tests/unit/decimal-value.test.ts`

## Explicit limitation: DLD-007 remains open

This increment defines an internal exact canonical representation. It does not approve or implement the public display policy for rounding mode, working/presentation precision, instrument-specific display scale, trailing zeros, or negative-zero presentation.

The source lexeme and negative-zero candidate remain available so the eventual versioned DLD-007 policy can make those presentation decisions without reconstructing lost evidence. Existing descriptive movement output remains prototype behavior and is not accepted as the final public calculation/display contract by this report.

This is local deterministic foundation evidence, not live-source, public formatting, staging, deployment, or competition-release evidence.
