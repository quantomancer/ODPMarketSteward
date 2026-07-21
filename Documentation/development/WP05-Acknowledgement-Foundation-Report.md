# WP05 acknowledgement foundation report

- Evaluated at: 2026-07-21 UTC
- Scope: WP05-004 through WP05-007, WP06-003/004, T4 and G3 foundation increment
- Runtime: Node.js 24.18.0, pnpm 11.15.1
- Classification: MARKET DATA DEMO

## Outcome

The repository now contains a Web Crypto HMAC-SHA-256 acknowledgement service, stateless policy/session-bound challenge issuance, a serialized first-wins commit transition, bounded stored state, replay rejection, policy/disclaimer invalidation, current/previous key rotation support, and idempotent cleanup. The MCP server registers the component-only acknowledgement tool and uses protected result metadata for the signed challenge and validated pending request. The Agent has a strongly consistent transaction-backed state adapter that remains disabled unless all required runtime bindings are present.

This is a verified local foundation, not a completed session release. Signed session-ID routing, approved lifetimes, target Durable Object execution, alarm cleanup, secret provisioning and staging reconnect evidence remain open.

## Contract reconciliation

The publication policy was already version 1.2.0, while four acknowledgement-related schemas in MCP application contract 1.5.1 still required 1.1.0. The stale constants were corrected, the application contract advanced to 1.5.2, the bundle advanced to 1.8.0, the application artifact digest was recomputed, and all twelve standalone schemas and the embedded bundle were regenerated.

## Challenge and commit behavior

- The challenge binds version, key ID, session digest, policy version, disclaimer digest, a 128-bit nonce, issuance time and expiry.
- Challenge lifetime is configurable but hard-bounded to 1–600 seconds; clock skew is configurable but hard-bounded to 0–300 seconds.
- Current keys issue and verify; explicitly configured previous keys verify only.
- The raw token and secret are never stored.
- The serialized store records the nonce hash and the six bounded policy/time/replay fields required by the contract.
- Multiple stateless challenges may exist; exactly one valid concurrent commit succeeds.
- Replay, tampering, unknown key, cross-session use, changed policy/disclaimer, future issuance beyond skew, expiry and malformed input are rejected.
- Policy changes make prior state ineligible; cleanup is idempotent.

## MCP and Agent integration

- `get_fx_market_board` checks the service-owned acknowledgement state before retrieval.
- When unacknowledged, it returns evidence NONE and the exact disclaimer, with the challenge and pending validated input only in component-visible `_meta`.
- `acknowledge_market_data_demo` is registered with generated input/output schemas and component-only visibility.
- A successful commit returns schema-valid ACKNOWLEDGED and instructs the component to reissue the pending request.
- Rejected acknowledgement returns schema-valid DISCLOSURE_REQUIRED and does not retrieve market data.
- When acknowledgement bindings are incomplete, the Agent omits the service and the acknowledgement tool returns typed INVALID_SESSION; market tools remain gated.
- When bindings are complete, the Agent uses Durable Object storage transaction semantics for the acknowledgement transition.

## Verification

The focused foundation gate passed 29 tests across the acknowledgement service, governed bundle and MCP server. A subsequent focused MCP/security run passed 21 tests including a modified-token integration case that proved metadata, bar and health call counts all remained zero.

The complete repository gate passed with bundle 1.8.0, seven runtime artifacts, six governed tool declarations, twelve standalone schemas, 50 modules/61 dependencies, 19 passing test files, 207 passing tests, one opt-in file with three skipped tests, 92.18% statement coverage, 93.00% line coverage, component and Worker builds, and local Workerd reconnect discovery of the acknowledgement, market-board and product-profile tools.

## Limitations

- DLD-004, DLD-018 and WP05-001 remain blocked pending explicit approval of [ADR-007](../decisions/ADR-007-Session-and-Acknowledgement-Lifetimes.md).
- The session identifier is not yet signed or expiry-bound; WP05-003 is not complete.
- Local Workerd discovered the tool but did not receive secret/runtime bindings and therefore did not execute a Durable Object acknowledgement transition.
- No alarm cleanup, target staging, Cloudflare secret mutation, deployment, MCP Inspector or ChatGPT component interaction occurred.
- Local/in-memory evidence cannot complete WP05-002, WP05-008, T4 or G3.
