# WP04 source-client and coherence foundation report

- Evaluated at: 2026-07-21T17:59:59Z
- Scope: WP04-001 through WP04-004; bounded partial evidence for WP04-008
- Runtime: Node.js 24.18.0, pnpm 11.15.1
- Classification: MARKET DATA DEMO

## Outcome

The fixed-origin FXLive source client and first coherent snapshot assembler are implemented. WP04-001 through WP04-004 meet their stated deterministic acceptance evidence. WP04-005 through WP04-007 remain incomplete, and WP04-008 remains partial because its complete fixture/live evidence gate depends on them.

## Implemented boundary

- The source origin is a compile-time constant: `https://fxlive.qmvp.workers.dev`.
- The client exposes only `GET /health`, `GET /meta`, and `GET /latest?bar={instrument}`.
- Callers cannot supply a URL, origin, path, selector, debug flag, method, or redirect target.
- Instrument input must be exactly six uppercase ASCII letters before any fetch.
- Requests use `redirect: error`, `cache: no-store`, JSON-only response negotiation, a required positive deadline, and a required positive streamed-byte limit.
- Response bodies are read incrementally, rejected when empty/oversized/non-UTF-8/non-JSON, and parsed with lossless numeric capture.
- Network-facing failures use a finite safe `SourceClientError` vocabulary without raw payloads, URLs, stack details, price values, or infrastructure identifiers.
- Epoch values remain decimal strings; OHLC lexemes preserve source scale; bar timestamps must form one exact RFC 3339 UTC minute.
- Metadata-before, stable sorted fan-out, and metadata-after are executed in order with configurable concurrency from one through six.
- Stable targets return `COHERENT`; missing target metadata, rollover, and mixed bar intervals return explicit `INCOHERENT` results. Different completed minutes are never merged.

## Deterministic evidence

The adapter fixtures cover fixed URLs and options, query injection attempts, invalid instruments, unsafe epoch integers, preserved OHLC scale, redirect rejection, timeout versus caller abort, status families, wrong content type, empty body, malformed JSON, oversized streams, undeclared fields, duplicate metadata instruments, invalid intervals, and requested/returned instrument mismatch.

The assembler fixtures cover metadata/fan-out ordering, stable output order, configured concurrency two, exact maximum concurrency six, rejection above six, coherent target, missing target, mixed bar interval, rollover, and repeated rollover detection without cross-minute merging.

The focused gate passed three files and 40 tests before the final exact-six and repeated-rollover additions. The final complete repository verify passed 17 files/184 tests with one opt-in live test skipped, 92.80% statement and 93.72% line coverage, 47 modules/55 dependencies, component and Worker builds, and local Workerd reconnect smoke.

## Bounded live compatibility evidence

The opt-in `tests/adapter/fxlive-live.test.ts` test passed once against the public source on 2026-07-21 UTC. It retrieved metadata and one instrument bar through the new client and confirmed currency, granularity, BarStart, and BarEnd coherence. It persisted and printed no market values. This is a focused point-in-time compatibility sample only; it does not prove all 35 instruments, service availability outside that window, performance, freshness, market state, or fitness.

An earlier attempted live command failed before network access because `vite-node` is not installed. No API request was made by that failed attempt. The reusable opt-in Vitest path replaced it.

## Explicitly incomplete

- No automatic full rollover reread or 37/74-call budget benchmark exists (WP04-005).
- Missing, extra, timeout, and partial-evidence decision-table assembly is not implemented (WP04-006).
- Health fallback after missing usable evidence is not integrated (WP04-007).
- The opt-in live test samples metadata plus one bar, not the complete FX-35 board (WP04-008 remains partial).
- The assembler is not yet wired into `get_fx_market_board`, the Worker composition root, Cloudflare staging, or ChatGPT.
- Calendar, CreatedAt provenance, freshness, service state, and fitness remain UNKNOWN/INDETERMINATE under their existing blockers.
