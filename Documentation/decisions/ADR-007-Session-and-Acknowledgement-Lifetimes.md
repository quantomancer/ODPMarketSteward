# ADR-007 — Session and acknowledgement lifetimes

- Status: PROPOSED — product/security approval required
- Date: 2026-07-21 UTC
- Owners: session/security engineer, security lead, product owner
- Affects: DLD-004, DLD-018, WP05, TR-ACK-001..003
- Classification: MARKET DATA DEMO

## Context

The current contracts require three separate clocks: a signed MCP session, a short-lived stateless acknowledgement challenge, and accepted acknowledgement state that remains valid only inside the same session. The implementation now supports configurable challenge lifetime and clock skew, key rotation, policy invalidation, serialized first-wins commit, replay rejection, and cleanup. It deliberately does not select production values while DLD-004 and DLD-018 remain open.

The publication policy is version 1.2.0. MCP application contract 1.5.2 corrects four stale 1.1.0 schema constants so challenge metadata, acknowledgement input, acknowledgement output, and recorded-manifest policy binding refer to the current policy.

## Proposed decision

| Clock or behavior | Proposed value | Rationale |
|---|---:|---|
| Signed MCP session lifetime | 24 hours, never extended by reconnect | Long enough for a demonstration/work session while bounding abandoned Durable Object state. |
| Accepted clock skew | 30 seconds | Bounded tolerance for edge/client timing without materially extending token validity. |
| Challenge lifetime | 600 seconds maximum | Matches the controlling application and technical contracts; may be shortened operationally without a contract change. |
| Accepted acknowledgement lifetime | Until the signed MCP session ends or policy version/disclaimer digest changes | Avoids repeated prompts during one session and stores no cross-session user decision. |
| Multiple outstanding challenges | Permitted while unacknowledged | Challenge issuance stays stateless. |
| Winning transition | First valid serialized commit wins | Exactly one concurrent submission becomes ACKNOWLEDGED; all later challenges are replay/already-completed rejections. |
| Key rotation | One current key for issuance; narrowly configured previous keys for verification only | Supports controlled rotation without allowing old keys to mint new challenges. |
| Cleanup | Idempotent alarm at signed-session expiry | Deletes acknowledgement and transport namespaces; challenge expiry needs no cleanup because issuance is stateless. |

## Security invariants

- Session and challenge signing use distinct per-environment secrets.
- Challenges bind the digest of the validated opaque session ID, policy version, disclaimer digest, random nonce, issuance time and expiry.
- The stored state contains only policy version, disclaimer digest, nonce hash, challenge times, server acknowledgement time and replay state.
- No prompt, transcript, user profile, account identifier, pending request, market result, raw token, signing key or market value is stored.
- Missing, malformed, modified, expired, replayed, cross-session or policy-mismatched acknowledgement causes zero market-source and model calls.
- A reconnect never extends session expiry.

## Current evidence and limitations

The pure service and in-memory serialized store pass signature, expiry, skew, rotation, cross-session, policy, replay, concurrent-first-wins and cleanup fixtures. The MCP server passes disclosure, component-only challenge metadata, commit, replay and zero-source-call tamper tests. The Agent contains a transaction-backed acknowledgement state adapter that is activated only when every required runtime binding is present.

This evidence does not approve the proposed values and does not prove target Cloudflare Durable Object behavior, session-ID signing, alarm cleanup, secret provisioning, staging reconnect or ChatGPT component interaction.

## Approval required

The product owner and security lead must explicitly accept or revise the proposed values and first-wins behavior. Only then may DLD-004, DLD-018 and WP05-001 be closed and the selected values be placed in controlled environment configuration.
