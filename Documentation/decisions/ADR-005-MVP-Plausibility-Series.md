# ADR-005: MVP plausibility series

- **Status:** Accepted
- **Decision date:** 2026-07-21 UTC
- **Owners:** Quality-rules owner; product owner approver
- **Affected records:** OD-009, DLD-008, WP03-007, WP03-010, T2, G2
- **Owning artifact:** `ODPMarketStewardBundle/rules/ohlc-rules.yaml` version 1.4.0
- **Public boundary:** MARKET DATA DEMO; contextual review evidence only

## Context

ADR-004 fixed the statistical baseline and eligible history, but a bar contains multiple OHLC fields and derived values. An untyped evaluator could silently compare different series or leave users unable to interpret an unusual result. The product owner explicitly approved `CLOSE` as the MVP series on 2026-07-21.

## Decision

1. The MVP contextual bar-plausibility series is `CLOSE`.
2. A target Close is compared only with prior Close values from references eligible under ADR-004.
3. Open, High, Low, ranges, movement values, and other derived metrics must not be inserted into the Close reference series.
4. Every plausibility result identifies `series: CLOSE`.
5. Additional series require a new named, versioned policy and must produce separate results; no combined opaque bar score is permitted.
6. Hard validity, descriptive calculations, plausibility, calendar, freshness, service state, and fitness remain separately typed.

## Consequences

- The rules artifact and registry expose `targetSeries: CLOSE` and prohibit series mixing.
- The normalized aggregate filters eligible full-bar history and projects only each accepted bar's Close into the pure scalar evaluator.
- Calendar, freshness, service state, and fitness stay `UNKNOWN` or `INDETERMINATE` until their governing decisions close.

## Verification contract

Acceptance requires an exact registry projection, an aggregate fixture in which a materially different Open value cannot change the Close-series plausibility result, explicit series labeling, reference-exclusion evidence, invalid-target suppression, static checks, full tests/builds, and local Workerd smoke.

## Approval record

- **Approved by:** Product owner, 2026-07-21 UTC.
- **Implementation authority:** The user explicitly confirmed `CLOSE` as the MVP plausibility series and instructed Codex to proceed.
- **Cloud boundary:** Local contract and implementation changes only; no Cloudflare deployment or remote cloud write is authorized.
