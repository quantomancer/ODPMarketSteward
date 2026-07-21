# ADR-003: Decimal calculation and presentation policy

- **Status:** Accepted
- **Decision date:** 2026-07-21 UTC
- **Owners:** Rules owner; product owner approver
- **Affected records:** DLD-007, OD-008, WP00-002, WP03-001, WP03-005, T2, G2
- **Owning artifact:** `ODPMarketStewardBundle/rules/ohlc-rules.yaml` version 1.1.0
- **Public boundary:** MARKET DATA DEMO; descriptive observations only

## Context

The domain already preserves source numeric lexemes and exact canonical decimal values, but public calculations could not be verified while rounding mode, working precision, instrument price scale, trailing zeros, and signed-zero behavior remained undefined. The product owner approved the policy on 2026-07-21.

## Decision

1. Parse authoritative OHLC inputs from their lossless JSON-number lexical representation into arbitrary-precision decimal values; never use JavaScript `Number` for governed arithmetic.
2. Use 34 significant digits of working precision and `ROUND_HALF_EVEN`. Addition, subtraction, multiplication, minimum, maximum and absolute-value results remain exact when representable; division follows the approved working precision.
3. Machine-readable metric values are canonical decimal strings and are not rounded to UI display scale.
4. Apply display rounding only at the presentation boundary.
5. Derive price and price-delta precision from the governed instrument's quote currency: JPY and HUF use 3 decimal places; every other quote currency in FX-35 uses 5.
6. Display percentage and basis-point values at 2 decimal places and ratios at 4 decimal places.
7. Retain required trailing zeros for nonzero display values. Any value that rounds to signed zero is displayed exactly as `0`, never `-0`, `-0.00`, or another signed-zero form.
8. Expose machine and display values as separate typed fields so presentation cannot replace calculation evidence.
9. Calculate only after hard OHLC validity passes. Invalid required inputs suppress all dependent metrics.
10. Every metric remains descriptive. The calculation engine does not produce a forecast, rank, recommendation, signal, order, or execution instruction.

## Consequences

- DLD-007 and OD-008 close after the owning artifact, normalization record, detailed design, bundle digests, registry projection, implementation, and golden vectors pass exact-runtime verification.
- JPY/HUF quote-scale behavior is deterministic and contract-controlled rather than inferred from a live payload.
- Repeating division results are bounded by the 34-significant-digit working precision; display rounding is a separate operation.
- A zero range yields body-to-range ratio `0` as already required by the rule contract.
- A future scale or rounding change requires a new rule-artifact version, regenerated bundle digests, migration note, and golden-vector update.

## Verification contract

Acceptance requires contract projection tests, exact and repeating-division golden vectors, JPY/HUF/default price-scale vectors, percentage/basis-point/ratio precision, trailing-zero and signed-zero vectors, flat-bar zero-range behavior, invalid-bar suppression, strict type/lint/format/dependency checks, full repository coverage, both production builds, and local Workerd smoke.

## Approval record

- **Approved by:** Product owner, 2026-07-21 UTC.
- **Implementation authority:** The user explicitly approved the recommended DLD-007 policy and instructed Codex to proceed.
- **Cloud boundary:** This decision authorizes local contract and implementation changes only; it does not authorize Cloudflare deployment or any remote write.
