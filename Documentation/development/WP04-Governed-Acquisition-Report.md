# WP04 governed acquisition report

- Evaluated at: 2026-07-21T18:13:48Z
- Scope: WP04-005 through WP04-008 implementation and evidence increment
- Runtime: Node.js 24.18.0, pnpm 11.15.1
- Classification: MARKET DATA DEMO

## Outcome

The governed acquisition layer now implements one budget-guarded full rollover reread, honest AVAILABLE/PARTIAL/UNAVAILABLE/INCOHERENT outcomes with explicit coverage counts and identifiers, and a bounded non-upgrading health diagnostic only after no usable market evidence remains.

WP04-007 meets its exact acceptance evidence. WP04-005 remains PARTIAL because the implementation and one 37-call live measurement exist, but a representative observed 74-call rollover benchmark and approved production limit configuration do not. WP04-006 remains PARTIAL because the safe decision-table behavior is implemented and tested while DLD-014 still requires explicit product-owner closure in its owning contract. WP04-008 and T3 remain PARTIAL because their declared dependencies are not all complete.

## Guarded rollover behavior

- One attempt costs `N + 2` calls: metadata before, N requested bars, metadata after.
- The constructor requires a positive safe total call budget and concurrency from one through six.
- A rollover reread can run only when it is enabled and the total configured budget covers `2 × (N + 2)`.
- The full FX-35 production-shaped path therefore requires 37 calls for one attempt and permits 74 only for exactly one full reread.
- If reread is disabled or the total budget is insufficient, the result is `INCOHERENT / ROLLOVER_BUDGET_UNAVAILABLE` without a partial reread.
- If the sole reread also rolls, the result is `INCOHERENT / ROLLOVER_AFTER_REREAD`. A third attempt is impossible.

## Evidence outcomes

- `AVAILABLE / COMPLETE / COHERENT`: every requested member is present exactly once and matches the stable metadata interval.
- `PARTIAL / PARTIAL / COHERENT`: at least one usable requested member remains, with failed and missing identifiers plus all counts exposed. Live partial evidence is never silently replaced.
- `UNAVAILABLE / NONE / NOT_EVALUATED`: no usable market evidence exists.
- `INCOHERENT`: metadata is missing after acquisition, metadata targets roll without a permitted successful reread, or any accepted bar identifies a different interval.
- Coverage reports requested, successful, failed, missing, unexpected, and duplicate counts and sorted identifier lists.
- Source failures are counted without exposing raw error messages, payloads, prices, URLs, or infrastructure details.

## Health diagnostic invariant

Health is not called after COMPLETE, PARTIAL, or INCOHERENT results containing usable bars. It is called at most once only after no usable evidence remains and only when one call remains in the configured budget. Its result is `REACHABLE`, `UNREACHABLE`, or `SKIPPED_BUDGET`, and all four claims—market state, freshness, coherence, and fitness—remain explicitly false. A reachable health response never upgrades `UNAVAILABLE`.

## Deterministic verification

The focused gate passed 31 tests across the governed acquirer, existing coherent assembler, and fixed-origin client. Cases include complete coverage, partial failures, missing and unexpected members, no evidence, reachable and unreachable health, budget-skipped health, one successful reread, disabled/underfunded reread, repeated rollover, and mixed intervals.

The final full repository verification exited 0 with 18 test files passed, one opt-in file skipped, 193 tests passed, two opt-in tests skipped, 92.33% statement coverage, 93.22% line coverage, 48 modules/56 dependencies, bundle/compiler and twelve schemas, TypeScript, ESLint, Prettier, component and Worker builds, and local Workerd reconnect smoke.

An earlier focused run stopped at lint before tests because of one unnecessary assignment and unbound mock assertions. Those findings were corrected before the passing focused and full gates.

## Bounded live FX-35 evidence

The opt-in live suite passed both the single-bar compatibility check and a complete governed FX-35 snapshot on 2026-07-21 UTC. The sanitized full-board evidence was:

```json
{"status":"PASS_FOCUSED_LIVE_FX35","callCount":37,"attemptCount":1,"requestedCount":35,"successfulCount":35,"failedCount":0,"elapsedMilliseconds":462,"marketValuesLogged":false}
```

The test used the digest-verified contract-registry projection of the governed 35-member set, concurrency six, total budget 74, and the production source client. It asserted AVAILABLE, COMPLETE, COHERENT, zero failure/missing/unexpected/duplicate counts, no health call, and exactly 35 bars. It did not persist or print market values.

This single live window proves neither a 74-call rollover execution nor general availability, latency, freshness, market state, or fitness. It is a point-in-time compatibility and one-attempt benchmark only.

## Remaining work

- Product owner must close DLD-014 explicitly before WP04-006 can become complete.
- A representative rollover or controlled staging measurement must exercise the 74-call path, and the production Worker limit configuration must be approved before WP00-005/WP04-005 can become complete.
- WP04-008/T3 durable release evidence still depends on those closures and the final exact runtime composition.
- The governed acquirer is not yet wired into `get_fx_market_board`, the Worker environment, Cloudflare staging, or ChatGPT.
