# ADR-001: Toolchain and dependency baseline

- **Status:** Accepted — approved and locally compatibility-validated
- **Decision date:** 2026-07-21 UTC
- **Last evidence refresh:** 2026-07-21T11:15:31Z
- **Owners:** Technical lead and architecture lead
- **Approver:** Product owner / architecture approver
- **Project records:** WP01-002, WP01-003, DLD-002; enables WP01-004 through WP01-007
- **Scope:** Local build and test toolchain, Cloudflare Worker and Durable Object runtime, MCP server, ChatGPT component, schema and exact-number processing

## Decision summary

ODP Market Steward will use an ESM-only pnpm workspace written in strict TypeScript. One Cloudflare Worker application will contain the `/mcp` and `/healthz` service, the stateful Agent/Durable Object session implementation, and versioned React component assets. Vite with the Cloudflare Vite plugin will build the Worker and component together; Wrangler remains the configuration, runtime-type generation and deployment CLI. Vitest, ESLint, Prettier and dependency-cruiser provide the initial test, static-analysis, formatting and module-boundary controls.

All direct dependencies are exact-pinned with `pnpm-lock.yaml`. The product owner approved this baseline and its local compatibility spike. Exact-runtime installation, builds, focused tests, persistent workerd reconnection, static controls, advisory review and generated type drift checks passed; see the linked execution evidence. This acceptance does not imply staging, ChatGPT-host, live-source or production validation.

## Why this decision is needed

The accepted detailed design depends on a stateful Streamable HTTP MCP server, persistent `WorkerTransport`, a React MCP Apps component, lossless market-number handling, validation of governed ODP artifacts, and a reproducible Cloudflare build. Those requirements cross several rapidly changing SDKs. Selecting packages by name without checking exact compatibility would make DLD-002 unverifiable.

Current compatibility findings materially affect the selection:

- Node.js 24 is an LTS line supported through April 2028. Node.js 26 is still Current, so it is not selected for the production build baseline.
- TypeScript 7.0.2 is available, but `typescript-eslint` 8.65.0 declares TypeScript support below 6.1. TypeScript is therefore pinned to 6.0.3 rather than the registry's newest major.
- `@modelcontextprotocol/ext-apps` 1.7.4 requires `@modelcontextprotocol/sdk` 1.29.0-compatible versions and supports React 19 and Zod 4.
- `@cloudflare/vite-plugin` 1.45.1 requires Wrangler 4.112.0-compatible versions and supports Vite 8.
- Cloudflare recommends generating Worker runtime and binding types with `wrangler types`, keyed to the configured compatibility date and flags. The application will not directly depend on `@cloudflare/workers-types`.

## Accepted runtime and toolchain pins

| Concern | Exact pin / policy | Role and compatibility rationale |
|---|---:|---|
| Local and CI Node.js | `24.18.0` | Latest verified Node 24 LTS patch in the evidence snapshot; production applications should use an LTS line. |
| Package manager | `pnpm@11.15.1` | Workspace and deterministic lockfile manager; its declared engine is Node `>=22.13`. Pin in the root `packageManager` field and Corepack. |
| Module system | ESM only | Root and package manifests use `"type": "module"`; no dual CommonJS output. |
| TypeScript | `6.0.3` | Newest verified 6.0 patch compatible with `typescript-eslint` 8.65.0's `<6.1.0` constraint. Strict mode and project references are required. |
| Node type declarations | `@types/node@24.13.3` | Major-aligned with Node 24; used only where Node-compatible APIs or build tools require it. |
| Cloudflare CLI | `wrangler@4.112.0` | Exact peer expected by the selected Cloudflare Vite plugin; provides local runtime, type generation, configuration checks and deployment commands. |
| Worker build integration | `@cloudflare/vite-plugin@1.45.1` | Official Vite/workerd integration for one full-stack Worker plus component assets. |
| Bundler and dev server | `vite@8.1.5` | Supported by the Cloudflare plugin, React plugin, Agents SDK and Vitest peer ranges. |
| React Vite transform | `@vitejs/plugin-react@6.0.3` | Exact Vite 8-compatible React plugin. |
| Test runner | `vitest@4.1.10` | Vite 8-compatible unit/integration runner with Node 24 support. |
| Coverage | `@vitest/coverage-v8@4.1.10` | Must exactly match the Vitest version. |
| Linter | `eslint@10.7.0` | Flat-config linter; supported by the chosen Node and `typescript-eslint` versions. |
| ESLint core rules | `@eslint/js@10.0.1` | Published ESLint-maintained flat configuration package. It versions independently from the `eslint` CLI package. |
| TypeScript lint integration | `typescript-eslint@8.65.0` | Supports ESLint 10 and TypeScript 6.0, but not TypeScript 7. |
| Formatter | `prettier@3.9.6` | Deterministic source and configuration formatting. |
| Dependency rule enforcement | `dependency-cruiser@18.1.0` | Enforces DLD M01-M18 dependency direction in CI; supports Node 24. |
| UI runtime | `react@19.2.7`, `react-dom@19.2.7` | Matching React runtime versions supported by MCP Apps and Cloudflare Agents peers. |
| UI type declarations | `@types/react@19.2.17`, `@types/react-dom@19.2.3` | Exact development-time declarations aligned to React 19. |

## Accepted application dependency pins

| Package | Exact pin | Placement and purpose |
|---|---:|---|
| `agents` | `0.17.4` | Worker transport/session package. Supplies Agent, `createMcpHandler`, persistent `WorkerTransport`, and Durable Object integration required by the accepted DLD. |
| `@modelcontextprotocol/sdk` | `1.29.0` | MCP server, tool and resource contracts. Satisfies the MCP Apps extension peer requirement. |
| `@modelcontextprotocol/ext-apps` | `1.7.4` | MCP Apps UI bridge and host protocol for the ChatGPT component. |
| `openai` | `6.48.0` | Server-only optional Steward Brief adapter. It must never be imported by the deterministic domain core or browser component. |
| `zod` | `4.4.3` | MCP input/output boundary schemas and typed DTO validation where executable schemas are needed. Satisfies Agents, MCP and OpenAI peer ranges. |
| `ajv` | `8.20.0` | JSON Schema validation for ODPS-family and generated runtime schemas. |
| `ajv-formats` | `3.0.1` | Standard JSON Schema format validation; its AJV 8 peer constraint is satisfied. |
| `yaml` | `2.9.0` | YAML parsing for governed bundle artifacts. Duplicate keys and unsafe/custom tag behavior must be configured fail-closed and tested. |
| `lossless-json` | `4.3.0` | Parses upstream JSON without first coercing numeric tokens to IEEE-754 numbers. |
| `decimal.js` | `10.6.0` | Deterministic decimal OHLC, change and plausibility calculations; display rules remain governed by DLD-007. |

## Cloudflare runtime policy

- The initial `compatibility_date` will be `2026-07-21` and will change only through a reviewed dependency/runtime update.
- The compatibility spike will begin with `nodejs_compat` because the selected npm dependency set may require Node-compatible APIs. Bundle size and imported modules must be inspected; if focused tests prove that only `nodejs_als` or no Node compatibility flag is needed, the narrower configuration wins and this ADR will be revised before acceptance.
- `wrangler types` will generate and commit `worker-configuration.d.ts`. CI will run `wrangler types --check` before type-check and build.
- `@cloudflare/workers-types` is intentionally omitted from application dependencies; generated types must reflect the actual compatibility date, flags and bindings.
- The Worker and React assets will be built as one Cloudflare application using the Vite plugin. The component does not call FXLive or OpenAI directly.
- Durable Object migrations, bindings and environment-specific names belong in non-secret Wrangler configuration. Credentials and private operations wrappers remain outside the repository.

## Workspace and dependency boundaries

The repository will use a single pnpm workspace with independently testable packages that align to the DLD module boundaries. This does not require Nx, Turborepo or another orchestration framework for the MVP.

| Layer | Allowed dependency direction | Key packages |
|---|---|---|
| `apps/worker` | May compose application, transport and adapters; no business rules defined here | `agents`, MCP SDK, Wrangler/Vite build integration |
| `apps/component` | May consume versioned presentation contracts; must not import Worker adapters or issue source/model network calls | React, React DOM, MCP Apps extension |
| `packages/domain` | Pure deterministic logic only; no Cloudflare, MCP, React, network or OpenAI imports | `decimal.js` where exact arithmetic is required |
| `packages/contracts` | Governed DTOs, schemas and generated registry contracts; no UI or transport dependencies | Zod, AJV, YAML as narrowly assigned |
| `packages/application` | Orchestrates domain ports; imports contracts/domain, never concrete network/UI adapters | No vendor SDK unless exposed behind a port |
| `packages/adapters-*` | Implement one outward port each | lossless JSON, OpenAI, source HTTP or persistence package as applicable |
| `packages/test-support` | Synthetic/authorized fixtures and test builders only | Vitest support dependencies |

`dependency-cruiser` rules will fail CI on inward dependency violations, cross-package cycles, undeclared dependencies, or imports from browser code into server adapters.

## Version and update policy

1. Direct dependencies use exact versions—no caret, tilde, `latest`, wildcard or unbounded workspace range.
2. `pnpm-lock.yaml` is committed. CI installs with `pnpm install --frozen-lockfile`.
3. The exact Node and pnpm versions are recorded in `package.json`, developer instructions and CI.
4. A dependency update is a reviewed change containing registry metadata, peer/engine evaluation, lockfile diff, advisory scan, build/test evidence and, for Cloudflare changes, a runtime compatibility check.
5. Production deployment uses the same lockfile digest and source revision that passed release gates.
6. The app version, MCP server version, component resource version and governed bundle version remain distinct identifiers.

## Compatibility spike required for acceptance

After approval, WP01-003 and DLD-002 require an executed spike, not just metadata inspection. The spike must produce and inspect all of the following:

1. Exact root/workspace manifests and `pnpm-lock.yaml` created with Node 24.18.0 and pnpm 11.15.1.
2. A minimal Cloudflare Vite build containing one Worker, one Agent/Durable Object binding, one React component asset, and generated Worker types.
3. A stateful MCP initialize/reconnect test using `createMcpHandler` plus persistent `WorkerTransport` storage.
4. One MCP tool with Zod input/output schema and one versioned MCP Apps resource that renders through the component contract.
5. Focused parse/calculation vectors proving lossless JSON token preservation and decimal OHLC arithmetic without native floating-point business calculations.
6. AJV validation of one valid governed artifact and one tampered/invalid fixture.
7. Type-check, lint, formatting check, dependency-direction check, unit tests, coverage bootstrap and production build.
8. Package advisory/licence inventory, resolved dependency graph, bundle-size report and exact tool-version transcript.
9. `wrangler types --check` and a local workerd request test for `/healthz` and `/mcp`; no Cloudflare deployment is part of this spike.

The required local evidence was produced and inspected, so WP01-002, WP01-003 and DLD-002 may be changed to `true`. Any future incompatible pin returns this ADR to Proposed with the observed failure and revised candidate versions recorded.

## Execution evidence

The product owner accepted ADR-001 and authorized dependency installation plus a local compatibility spike without Cloudflare deployment. The executed results are recorded in [ADR-001 compatibility spike report](../development/ADR-001-Compatibility-Spike-Report.md). The exact Node.js 24.18.0 and pnpm 11.15.1 pair completed a frozen lockfile install; exact-runtime type-check, tests, Vite component/Worker builds and persistent local-workerd MCP restart passed. `wrangler types --check`, lint, formatting, dependency-direction checks, coverage bootstrap and the production advisory/licence inventory also completed. No Cloudflare remote write occurred.

## Alternatives considered

| Alternative | Decision |
|---|---|
| TypeScript 7 | Rejected for this baseline because the selected TypeScript ESLint integration does not declare support. Reconsider after compatible lint tooling is released and tested. |
| Node.js 26 Current | Rejected for production baseline until it reaches LTS and the dependency set is revalidated. |
| npm workspaces | Viable, but not selected; pnpm provides strict, efficient workspace resolution and an explicit package-manager pin. |
| Bun or Deno | Not selected because the primary SDK, Cloudflare and WebStorm path is Node/TypeScript and would add runtime variance without an MVP benefit. |
| Jest | Not selected; Vitest shares the Vite transform/runtime path and supports the chosen versions. |
| Separate component deployment | Not selected for the MVP; one Worker plus static assets reduces deployment and CSP/version drift. |
| `@cloudflare/workers-types` as app runtime types | Not selected; Cloudflare recommends `wrangler types` for configuration-accurate types. |
| Native JavaScript `number` for OHLC | Rejected for governed calculations because it cannot guarantee decimal preservation and display semantics. |
| Nx or Turborepo | Deferred; the current repository does not justify another orchestration layer. |
| Python service | Rejected for this deployment because it would create a second runtime and does not improve the required Cloudflare/MCP/React integration. |

## Consequences and risks

- The baseline is intentionally conservative at the compiler/runtime boundary while current at the SDK boundary.
- Pinning exact versions improves reproducibility but requires deliberate dependency maintenance and security review.
- `agents` is pre-1.0; its persistent MCP transport behavior is a high-risk compatibility item until the reconnect spike passes.
- Enabling `nodejs_compat` may increase Worker bundle size. The spike must justify the flag or narrow it.
- The OpenAI SDK remains isolated and optional so deterministic answers survive model unavailability.
- Registry metadata and documentation review do not prove transitive resolution, Cloudflare runtime behavior, ChatGPT host behavior or production fitness.

## Evidence sources

- [OpenAI Apps SDK: build an MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [OpenAI Apps SDK quickstart](https://developers.openai.com/apps-sdk/quickstart)
- [Cloudflare stateful `createMcpHandler` and `WorkerTransport`](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)
- [Cloudflare remote MCP server approaches](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)
- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Cloudflare React and Vite guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Cloudflare TypeScript and generated Worker types](https://developers.cloudflare.com/workers/languages/typescript/)
- [Cloudflare compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- Package version, engine and peer-dependency metadata queried from the [npm registry](https://www.npmjs.com/) at the evidence-refresh timestamp above.

## Approval record

- **Current decision:** Accepted by the product owner on 2026-07-21; local compatibility evidence inspected.
- **Implementation consequence:** the exact pins and dependency boundaries in this ADR control subsequent implementation until superseded by a reviewed ADR revision.
- **Cloud boundary:** acceptance does not authorize creating, changing or deploying Cloudflare resources; the spike performed no remote Cloudflare write.
