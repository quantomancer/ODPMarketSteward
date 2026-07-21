# ODP Market Steward

**Competition title:** ODP Market Steward — Governed Live Market Data in ChatGPT

ODP Market Steward is a ChatGPT App and MCP service under active implementation for governed discovery, validation, and professional interpretation of live market metadata and OHLC data. It is a **MARKET DATA DEMO** and does not provide investment advice or a production trading service.

## Repository status

The repository contains the authoritative project documentation and an executable compatibility-spike implementation: an exact-pinned TypeScript workspace, a Cloudflare Worker with a persistent Agent/Durable Object MCP transport, one typed discovery tool, and one React MCP Apps component resource. This is a buildable foundation, not a live deployment or completed MVP. It contains no copied credentials.

The implementation is planned in TypeScript, with:

- an MCP server hosted on Cloudflare Workers;
- an optional ChatGPT component UI with the OpenAI Apps SDK bridge;
- ODPI-family contracts and generated runtime artifacts kept separate;
- deterministic calculations and validation recipes;
- evidence-driven tests and release gates.

## Structure

- `apps/worker/` — Cloudflare Worker composition, MCP transport, and operational endpoints.
- `apps/component/` — ChatGPT component UI, bridge, state, views, and accessibility.
- `Documentation/` — authoritative specifications, requirements, design, project plan, decisions, and maintained documentation.
- `contracts/bundle/` — reproducible runtime materialization of approved contracts once the vendoring/generation decision is complete; never the maintained source.
- `packages/` — domain, application, adapter, contract-runtime, MCP-contract, and test-support modules.
- `generated/` — reproducible artifacts derived from governed contracts; never a contract source.
- `tests/` — package through end-to-end verification layers.
- `evidence/` — machine-readable validation reports and release manifests.
- `scripts/` — checked automation for generation, validation, and evidence production.

## Development and review

WebStorm is the primary development and code-review IDE. Begin with the [documentation index](Documentation/README.md), [living project plan](Documentation/ProjectPlan.html), [accepted toolchain ADR](Documentation/decisions/ADR-001-Toolchain-and-Dependency-Baseline.md), [compatibility-spike report](Documentation/development/ADR-001-Compatibility-Spike-Report.md), and [governed bundle compiler report](Documentation/development/WP02-Governed-Bundle-Compiler-Report.md). Follow [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

The exact local baseline is Node.js 24.18.0 and pnpm 11.15.1. With those versions active:

```text
corepack pnpm@11.15.1 install --frozen-lockfile
corepack pnpm@11.15.1 run verify
```

`verify` is local: it checks generated Worker types, TypeScript, lint, formatting, dependency directions, coverage, production builds, and a persisted local-workerd MCP restart. It does not deploy or mutate Cloudflare resources.

Current OpenAI references:

- [Build an MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Apps SDK quickstart](https://developers.openai.com/apps-sdk/quickstart)

## Public-safety boundary

Public artifacts must identify the service as a **MARKET DATA DEMO**, use UTC timestamps, avoid confidential infrastructure and credential details, and must not identify or imply any prohibited upstream data provider.
