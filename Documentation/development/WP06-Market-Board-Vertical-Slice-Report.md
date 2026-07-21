# WP06 governed market-board vertical-slice report

- Evaluated at: 2026-07-21 UTC
- Scope: WP06-003 through WP06-005, T5 and G4 implementation increment
- Runtime: Node.js 24.18.0, pnpm 11.15.1
- Classification: MARKET DATA DEMO

## Outcome

`get_fx_market_board` is now registered alongside `get_fx_product_profile` and wired through the generated MCP input/output schemas, contract readiness, the exact digest-verified FX-35 projection, the fixed-origin source client, the governed snapshot acquirer, hard OHLC validity, and a schema-valid market-board result.

This is a functioning local vertical slice, not a completed public application. WP06-003, WP06-004 and WP06-005 remain PARTIAL because four declared tools, the persistent server-owned acknowledgement mechanism, common semantics across every domain tool, and the instrument/movement/assessment handlers remain open.

## Safety and gate behavior

- The default server state is unacknowledged.
- An unacknowledged board call returns the exact schema-valid `DISCLOSURE_REQUIRED` result with `evidenceMode: NONE`, `liveBadgePermitted: false`, and the governed MARKET DATA DEMO disclaimer.
- Call-count tests prove that metadata, bar and health methods are invoked zero times before acknowledgement.
- A failed required contract-readiness observation returns the shared typed `CONTRACT_UNAVAILABLE` error before any source call.
- The current acknowledgement dependency is deliberately injectable test/session context. It is not represented as the final Durable Object session mechanism and cannot complete WP05 or WP06-004.

## Governed result composition

After acknowledged access, the handler:

1. resolves the exact 35 instruments and artifact pointers from the verified contract registry;
2. performs one governed acquisition with maximum concurrency six and an invocation budget capable of one complete rollover reread;
3. exposes honest AVAILABLE, PARTIAL, UNAVAILABLE or INCOHERENT evidence without recorded substitution;
4. emits live or no-evidence context, UTC snapshot identity, refresh identity, canonical bars, hard OHLC rule results, and explicit limitations;
5. keeps service state `UNKNOWN` for a complete board because no authoritative calendar exists;
6. keeps `liveBadgePermitted: false` because OPEN and freshness PASS are not established;
7. keeps plausibility `NOT_EVALUATED` because this invocation retrieves no governed reference history; and
8. says that purpose fitness is not assessed by this result.

## Deterministic verification

The focused TypeScript, ESLint and Vitest gate passed 20 tests across the MCP server and governed acquirer. Fixtures cover:

- exact two-tool discovery and standalone schema parity;
- default disclosure with zero source calls;
- acknowledged complete 35-bar output;
- honest 34-bar PARTIAL live output when one instrument fails;
- no recorded substitution even when fallback is requested; and
- contract-readiness failure before egress.

The final full repository verification exited 0 with bundle 1.7.0, seven runtime artifacts, six governed tool declarations, twelve standalone schemas, Wrangler type drift, TypeScript, ESLint, Prettier, 49 modules/59 dependencies, 18 passing test files, 198 passing tests, one opt-in file and three opt-in tests skipped, 92.41% statement coverage, 93.32% line coverage, component and Worker builds, and local Workerd reconnect discovery of both registered tools.

The first full run reached the final Workerd smoke after all preceding checks passed, then stopped because the smoke still expected the former one-tool list. The smoke was updated to assert both governed schemas and the complete full gate passed on rerun.

## Bounded live MCP evidence

The separately enabled live suite passed three tests against the public MARKET DATA DEMO API. The new end-to-end MCP evidence was:

```json
{"status":"PASS_FOCUSED_LIVE_MCP_MARKET_BOARD","returnedCount":35,"availabilityState":"AVAILABLE","elapsedMilliseconds":1670,"marketValuesLogged":false}
```

The parallel direct-acquirer sample completed one attempt in 37 calls with 35/35 successful and zero failed in 1,685 ms. The test output contained counts, state and timing only; it did not print or persist market values.

This point-in-time evidence does not prove general availability, production latency, a 74-call rollover, calendar state, freshness, fitness, Cloudflare deployment, Durable Object acknowledgement, ChatGPT rendering or MCP Inspector behavior.

## Remaining work

- Implement and verify the final server-owned session/challenge/acknowledgement state before production retrieval can be enabled.
- Register and implement the instrument, movement, assessment and component-only acknowledgement tools.
- Reuse identical gate, readiness and typed-result semantics across all domain tools.
- Complete MCP Inspector and remote target evidence.
- Build the market-board component; the present component resource is still the product-passport scaffold and does not render this board.
