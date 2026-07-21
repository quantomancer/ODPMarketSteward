# ODP Market Steward

**Competition title:** ODP Market Steward — Governed Live Market Data in ChatGPT

ODP Market Steward is a planned ChatGPT App and MCP service for governed discovery, validation, and professional interpretation of live market metadata and OHLC data. It is a **MARKET DATA DEMO** and does not provide investment advice or a production trading service.

## Repository status

This initial commit is a structural scaffold only. It establishes the architecture and review boundaries accepted in the detailed-level design. It does not yet contain executable application code, dependency manifests, Cloudflare deployment configuration, copied credentials, or a live deployment.

The implementation is planned in TypeScript, with:

- an MCP server hosted on Cloudflare Workers;
- an optional ChatGPT component UI with the OpenAI Apps SDK bridge;
- ODPI-family contracts and generated runtime artifacts kept separate;
- deterministic calculations and validation recipes;
- evidence-driven tests and release gates.

## Structure

- `apps/worker/` — Cloudflare Worker composition, MCP transport, and operational endpoints.
- `apps/component/` — ChatGPT component UI, bridge, state, views, and accessibility.
- `contracts/bundle/` — governed, versioned ODPI-family and supporting contracts once the vendoring decision is complete.
- `packages/` — domain, application, adapter, contract-runtime, MCP-contract, and test-support modules.
- `generated/` — reproducible artifacts derived from governed contracts; never a contract source.
- `tests/` — package through end-to-end verification layers.
- `docs/` — architecture, decisions, development, and operations documentation.
- `evidence/` — machine-readable validation reports and release manifests.
- `scripts/` — checked automation for generation, validation, and evidence production.

## Development and review

WebStorm is the primary development and code-review IDE. Do not add dependencies or toolchain versions until their project decisions are accepted. Follow [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

Current OpenAI references:

- [Build an MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Apps SDK quickstart](https://developers.openai.com/apps-sdk/quickstart)

## Public-safety boundary

Public artifacts must identify the service as a **MARKET DATA DEMO**, use UTC timestamps, avoid confidential infrastructure and credential details, and must not identify or imply any prohibited upstream data provider.
