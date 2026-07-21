# ADR-001 compatibility spike report

- **Evidence timestamp:** 2026-07-21T11:15:31Z
- **Implementation source revision:** `58cf496dfc7072575d96e06c79478570b7ce999c`
- **Scope:** local implementation compatibility only
- **Runtime:** Node.js 24.18.0, pnpm 11.15.1
- **Cloud boundary:** no Cloudflare deployment, account mutation, secret access, or remote resource write occurred
- **Public classification:** MARKET DATA DEMO; UTC

## Outcome

The exact ADR-001 dependency baseline is locally compatible. A frozen install, strict source type-check, generated Worker type drift check, lint, formatting, dependency-direction rules, focused tests, coverage bootstrap, React component build, Cloudflare Worker build, and a stateful MCP restart test completed successfully under the exact Node.js 24.18.0 runtime. The spike establishes a buildable foundation; it does not claim staging, ChatGPT-host, live-source, security, accessibility, or production acceptance.

The implementation source revision was committed and verified against the private repository's `main` branch. This report remains execution evidence for that revision; a later documentation-only project-control commit does not alter the tested implementation source.

## Acceptance evidence

| ADR requirement | Inspected result |
|---|---|
| Exact manifests and lockfile | Nine-workspace frozen install completed with Node.js 24.18.0 and pnpm 11.15.1. `pnpm-lock.yaml` SHA-256: `0417ab2a6ef029e5d3c89fccc1319a3e9d32609661c6ebab2197186528457ba5`. |
| Cloudflare Worker, Agent/Durable Object and component | Production builds completed. The Worker exports `OdpMarketStewardAgent`; Wrangler configuration declares its SQLite Durable Object binding and migration; the component is embedded as a versioned MCP resource. |
| Persistent MCP transport | Local workerd initialize, runtime stop, runtime restart using the same repository-local persistence, `tools/list`, and `tools/call` passed. The session ID was returned and `get_fx_product_profile` remained available after restart. |
| Typed MCP tool and Apps resource | The tool uses Zod input/output schemas and returns structured content classified `MARKET DATA DEMO`; the server registers a versioned `ui://` component resource. |
| Lossless and decimal vectors | Focused tests passed for preserved numeric tokens and decimal OHLC movement calculations without native floating-point business arithmetic. |
| Governed artifact validation | Focused AJV/YAML tests accepted the governed 35-instrument artifact and rejected tampered semantic content. |
| Static and test controls | TypeScript: pass; Wrangler generated types: up to date; ESLint: pass; Prettier: pass; dependency rules: zero errors and zero warnings after generated build output exclusion; Vitest: 3 files and 6 tests passed. |
| Coverage bootstrap | Statements 81.66%, branches 70.90%, functions 84.61%, lines 85.71%. This is spike coverage, not an MVP release threshold. |
| Runtime requests | `/healthz` became ready in local workerd; MCP initialize/reconnect/tool discovery/tool execution passed. No Cloudflare deployment was attempted. |

## Build inventory

| Artifact | Bytes | SHA-256 / note |
|---|---:|---|
| `apps/component/dist/component.js` | 918,188 | Vite reported 254.07 kB gzip; generated local build output, not committed. |
| `generated/component-resource.ts` | 922,673 | `dc5cad3e1757f3c302b8a70ce2c256d3e2d2c3e978124c9efe0cea31fc9a760f`; deterministic embedded source with non-empty component CSS inspected. |
| `dist/odp_market_steward/index.js` | 2,349,565 | `9471e6b142d4ea58159846b0c7950a5179f250536d0c323188d2968cd88dafa9`; Vite reported 569.37 kB gzip; generated local build output, not committed. |

`nodejs_compat` is retained for this baseline. The spike proved the selected configuration but did not separately prove that a narrower compatibility flag is sufficient; narrowing remains a future reviewed optimization.

## Dependency and licence review

`pnpm audit --prod` reported no known vulnerabilities at the evidence timestamp. This is a point-in-time registry result, not a guarantee against future advisories.

The production dependency inventory contained these licence-family/version counts: MIT 171; MIT OR Apache-2.0 1; Apache-2.0 3; ISC 16; BSD-3-Clause 4; BSD-2-Clause 1; MPL-2.0 2; CC-BY-4.0 1; BlueOak-1.0.0 1. The less-common entries were `caniuse-lite@1.0.30001806` (CC-BY-4.0), `lightningcss@1.33.0` and `lightningcss-darwin-arm64@1.33.0` (MPL-2.0), and `lru-cache@11.5.2` (BlueOak-1.0.0). This inventory is technical evidence and is not legal approval.

## Focused corrections made during the spike

- Replaced the unpublished `@eslint/js@10.7.0` candidate with published `@eslint/js@10.0.1` while retaining `eslint@10.7.0`; the packages version independently.
- Routed the Agent through its Durable Object `fetch()` interface. Direct RPC invocation of `onRequest()` failed in workerd because that method is not exposed as an RPC callable.
- Executed Wrangler as a child of the current Node executable in the restart test so the exact runtime pin is preserved.
- Corrected the component embed step to read Vite's emitted `component.css`; the final generated resource was inspected for a non-empty style block before its digest was recorded.
- Kept `skipLibCheck` enabled to isolate conflicts among third-party Worker/DOM declarations; strict checking remains active for repository source.
- Excluded deterministic generated component source and build output from source-format/dependency-orphan checks while retaining type-check/build validation.

## Explicitly not proven

- ChatGPT host rendering, tool invocation, widget accessibility, responsive layout, and CSP behavior.
- Live FX source retrieval, freshness/session evaluation, all 35 instrument observations, or governed financial calculations beyond focused vectors.
- Staging or production Durable Object behavior, concurrency, security, performance, reliability, or Cloudflare account configuration.
- Clean bootstrap on a second independent environment; WP01-007 remains open.
- Full DLD M01-M18 implementation; WP01-004 remains in progress despite this buildable vertical slice.
