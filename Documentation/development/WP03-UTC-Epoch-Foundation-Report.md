# WP03 UTC and Epoch Foundation Report

- Work item: `WP03-002`
- Related records: `T2`, `G2`
- Evidence time: `2026-07-21T14:02:29Z`
- Tested implementation revision: `fa78fd52437faa0778e5098a319d662a3b9ebbd3`
- Runtime: checksum-verified Node.js `24.18.0`
- Package manager: pnpm `11.15.1`
- Remote scope: no Cloudflare, source API, ChatGPT host, staging, or public endpoint was accessed

## Outcome

The domain package now contains strict string-facing `UtcTimestamp` and `EpochLexeme` value objects plus exact completed one-minute interval validation.

`UtcTimestamp`:

- accepts four-digit Gregorian dates with uppercase `T`, a required trailing `Z`, seconds, and an optional one-to-nine-digit fractional second;
- rejects offsets, lowercase notation, whitespace, invalid dates, year `0000`, out-of-range time components, more than nine fractional digits, and leap seconds;
- preserves the source string and emits a canonical UTC string with insignificant trailing fractional zeros removed;
- calculates exact signed Unix epoch nanoseconds using bounded civil-date components and integer arithmetic rather than `Date.parse()` or millisecond floating-point conversion;
- exposes epoch nanoseconds and differences as decimal strings.

`EpochLexeme` accepts only canonical non-negative decimal integers of at most 40 digits. It preserves values beyond JavaScript's safe-integer range, rejects signs, leading zeros, fractions, exponent notation, whitespace, and excessive length, and can compare exactly with a parsed UTC timestamp without exposing a JSON-incompatible `bigint` value.

`parseOneMinuteUtcInterval` requires the end instant to be exactly `60,000,000,000` nanoseconds after the start. It works across minute, day, leap-day, month, and year boundaries and rejects one-nanosecond-short, one-nanosecond-long, and reversed intervals.

## Golden and boundary coverage

- Unix epoch: `1970-01-01T00:00:00Z` → `0` nanoseconds.
- Safe-range overflow: `2000-01-01T00:00:00Z` → `946684800000000000` nanoseconds.
- Leap day and nanosecond fraction: `2024-02-29T23:59:59.123400000Z` → canonical `.1234Z` and exact `1709251199123400000`.
- Pre-epoch fractional instant: `1969-12-31T23:59:59.5Z` → `-500000000`.
- Equivalent whole/fractional forms compare equal.
- Exact one-minute intervals pass across ordinary, leap-day, and year boundaries.
- Offsets, lowercase markers, invalid leap dates, `24:00`, leap seconds, malformed fractional precision, non-canonical epoch forms, and overlong epochs fail.

## Exact verification

The repository's full `verify` command completed with exit code `0` under the pinned runtime:

- governed bundle compilation: `PASS`, seven runtime artifacts, bundle `1.2.0`, six declared tools, and twelve standalone schemas;
- Wrangler generated-type drift, TypeScript, ESLint, Prettier, and dependency-cruiser: passed; 41 modules and 39 dependencies with zero violations;
- Vitest coverage suite: ten test files and 93 tests passed;
- total coverage: 92.11% statements, 84.09% branches, 96.07% functions, and 93.11% lines;
- domain package: 97.69% statements and 97.65% lines;
- `utc-time.ts`: 98.59% statements, 91.11% branches, 100% functions, and 98.57% lines;
- component and Worker production builds: passed;
- local Workerd reconnect smoke: restart persistence, session return, profile discovery, and `MARKET DATA DEMO` classification passed.

## Files

- `packages/domain/src/utc-time.ts`
- `packages/domain/src/index.ts`
- `tests/unit/utc-time.test.ts`

## Limitations

Leap seconds are deliberately rejected because the current Unix-epoch correspondence contract does not define their treatment. The source data contract uses completed minute bars and does not require leap-second acceptance.

This increment validates temporal syntax, exact instants, epoch lexemes, and one-minute duration. It does not provide the authoritative UTC FX calendar, market-open/closed classification, `CreatedAt` producer semantics, freshness verdicts, coherent snapshot assembly, or source response normalization. DLD-005, DLD-006, WP03-008, and their dependent claims remain blocked or open.

This is local deterministic foundation evidence, not live-source, staging, deployment, or competition-release evidence.
