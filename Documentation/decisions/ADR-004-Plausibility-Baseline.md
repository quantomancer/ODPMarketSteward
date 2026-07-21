# ADR-004: Contextual OHLC plausibility baseline

- **Status:** Accepted
- **Decision date:** 2026-07-21 UTC
- **Owners:** Quality-rules owner; product owner approver
- **Affected records:** OD-009, DLD-008, WP00-002, WP03-007, T2, G2
- **Owning artifact:** `ODPMarketStewardBundle/rules/ohlc-rules.yaml` version 1.3.0
- **Public boundary:** MARKET DATA DEMO; contextual review evidence only

## Context

The domain already implements an exact-decimal rolling median and median absolute deviation evaluator, but the governed configuration intentionally returned `NOT_EVALUATED`. The product owner approved the recommended baseline on 2026-07-21.

## Decision

1. Use an inclusive 3,600-second UTC lookback window.
2. Require at least 30 eligible reference bars.
3. Eligible references are completed, hard-valid one-minute bars for the same instrument and granularity, strictly before and excluding the target bar.
4. Include a reference whose timestamp is exactly on the UTC lookback boundary.
5. Compute the rolling median, median absolute deviation, absolute deviation, and MAD score with the approved 34-significant-digit exact-decimal policy.
6. Classify a MAD score greater than or equal to 6 as `UNUSUAL`; a lower score is `NORMAL`.
7. Return `NOT_EVALUATED` when fewer than 30 eligible references exist or the reference MAD is zero.
8. Plausibility never changes hard validity and never produces a forecast, rank, recommendation, trading signal, order, or execution instruction.

## Consequences

- DLD-008 and OD-009 close after the owning artifacts, manifest digests, registry projection, implementation, and fixtures pass exact-runtime verification.
- The source/snapshot layer must enforce reference eligibility before passing the value series to the pure evaluator.
- Selection of a specific OHLC field or derived metric for a caller remains part of that caller's typed evaluation request; this decision controls the statistical baseline and eligible history, not an implicit untyped target.
- Any parameter or eligibility change requires a new rules-artifact version, regenerated bundle, migration note, and boundary-fixture update.

## Verification contract

Acceptance requires a contract projection of the exact governed values, normal and unusual 30-bar fixtures, inclusive threshold and UTC-window boundaries, insufficient-sample, zero-MAD, invalid-evidence, hard-validity isolation, trading-signal prohibition, static checks, full repository coverage, both production builds, and local Workerd smoke.

## Approval record

- **Approved by:** Product owner, 2026-07-21 UTC.
- **Implementation authority:** The user explicitly confirmed the recommended DLD-008 baseline and instructed Codex to continue.
- **Cloud boundary:** This decision authorizes local contract and implementation changes only; it does not authorize Cloudflare deployment or any remote cloud write.
