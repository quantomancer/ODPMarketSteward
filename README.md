# ODP Market Steward

> **Governed Live Market Data in ChatGPT**<br>
> An OpenAI Build Week submission that turns a live FX market-data feed into an inspectable, standards-led data product inside ChatGPT.

[![Demo](https://img.shields.io/badge/Watch_the_demo-YouTube-red)](https://youtu.be/26mSDmXEA6c)
[![ODPS](https://img.shields.io/badge/ODPS-4.1-14563d)](https://opendataproducts.org/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1.2-6ba539)](Documentation/ODPMarketStewardBundle/interface/fxlive.openapi.yaml)
[![MCP](https://img.shields.io/badge/MCP-Streamable_HTTP-654ff0)](https://modelcontextprotocol.io/)

## The problem

Market-data users should not have to choose between a convenient AI interface and evidence they can inspect. A price table alone does not say which product contract applies, whether all expected instruments arrived, whether its OHLC values are internally valid, or what limitations govern its use.

ODP Market Steward brings those concerns together. It retrieves the latest completed one-minute bars for a governed set of 35 FX instruments, validates them deterministically, attaches product provenance and quality evidence, and presents the result through a professional ChatGPT component. The user can then ask natural-language questions without manually reading YAML contracts.

## What the demo does

- Retrieves the latest coherent FX-35 completed-minute board from a public read-only service.
- Enforces the governed 35-instrument value set and UTC timestamp requirements.
- Checks hard OHLC plausibility constraints such as `low <= open/close <= high`.
- Reports coverage, evidence state, service state, bar-end time and per-row validity.
- Returns governed product declarations from the maintained ODPS-centred bundle.
- Lets ChatGPT produce grounded analyst summaries from the structured result while explicitly avoiding investment advice.
- Keeps a permanent **MARKET DATA DEMO** disclaimer visible without interrupting access with acknowledgement loops.

The public competition POC currently exposes two MCP tools:

| Tool | Purpose |
| --- | --- |
| `get_fx_market_board` | Retrieve and evaluate the latest coherent governed FX-35 board. |
| `get_fx_product_profile` | Discover product identity, purpose, access, SLA, quality and artifact provenance. |

## Why it is different

The AI is not the source of numerical truth. Deterministic TypeScript services retrieve, normalize and validate the data first. ChatGPT receives structured evidence and adds an accessible explanation on top. That separation makes the result more useful to analysts, governance teams and developers—and provides a path from a competition POC toward professional finance data stewardship.

## Standards-led architecture

```text
FXLive read-only API
        │  OpenAPI 3.1.2
        ▼
Cloudflare Worker adapter
        │
        ├── ODPS 4.1 product contract
        ├── governed FX-35 value set
        ├── deterministic OHLC rules
        ├── monitoring and publication policies
        └── versioned bundle manifest
        │
        ▼
Streamable HTTP MCP server
        │
        ├── typed tool results
        └── embedded Apps SDK component
        ▼
ChatGPT: interactive board + natural-language stewardship
```

The bundle deliberately avoids treating ODPS as an execution, monitoring and presentation specification. Responsibilities are separated across:

- **ODPS 4.1** — product identity, purpose, access, service levels and quality commitments.
- **OpenAPI 3.1.2** — source HTTP routes, parameters and response schemas.
- **Project value set** — the governed FX-35 instrument membership.
- **Rule contracts** — deterministic OHLC and descriptive calculations.
- **Operational policy** — availability, evidence and monitoring states.
- **Publication policy** — permitted identity, disclaimer and public-display requirements.

Start with the [bundle documentation](Documentation/ODPMarketStewardBundle/ODPMarketStewardBundleDocumentation.html), [bundle manifest](Documentation/ODPMarketStewardBundle/bundle.yaml), and [detailed design](Documentation/ODPMarketStewardBundle/design/DetailedLevelDesign.html).

## Try it in ChatGPT

The competition deployment is public and requires no authentication.

1. In ChatGPT, open **Settings → Plugins**.
2. Select **Create plugin** (`+`).
3. Enter the name `ODP Market Steward`.
4. Choose **Server URL** and enter:

   ```text
   https://odp-market-steward.qmvp.workers.dev/mcp
   ```

5. Select **No Auth**, acknowledge ChatGPT's standard custom-server warning, and create the plugin.
6. Start a new chat, enable **ODP Market Steward**, and try:

   ```text
   Show me the current governed FX-35 market board.
   ```

Useful follow-up prompts:

```text
Give me an analyst summary of the current board without investment advice.
Which instruments failed hard OHLC validation?
Explain the coverage and evidence status.
What ODPS product contract and quality rules govern this result?
Describe the product purpose, access method and limitations.
```

Market coverage varies while a coherent minute is forming and outside active feed periods. A partial or unavailable response is reported as such; it is not silently presented as complete or live.

## Local development

Prerequisites:

- Node.js `24.18.0`
- pnpm `11.15.1`

```bash
corepack pnpm@11.15.1 install --frozen-lockfile
corepack pnpm@11.15.1 run verify
```

The verification pipeline regenerates governed artifacts, checks Worker types, TypeScript, linting, formatting and dependency boundaries, runs tests with coverage, builds the component and Worker, and exercises a local persisted MCP reconnect smoke. It does not deploy or modify Cloudflare resources.

## Repository map

- [`apps/worker/`](apps/worker/) — Cloudflare Worker, MCP transport and tool composition.
- [`apps/component/`](apps/component/) — embedded React market-board component.
- [`packages/`](packages/) — domain, application, adapters and contract runtime.
- [`Documentation/ODPMarketStewardBundle/`](Documentation/ODPMarketStewardBundle/) — maintained product bundle and professional documentation.
- [`generated/`](generated/) — reproducible runtime materialization of governed contracts.
- [`tests/`](tests/) — unit, contract, integration and local Worker tests.
- [`evidence/`](evidence/) — machine-readable verification evidence.
- [`Documentation/ProjectPlan.html`](Documentation/ProjectPlan.html) — evidence-controlled living delivery plan.

## Build Week work and prior work

**Pre-existing input:** FXLive was an independently deployed, public, read-only market-data API before Build Week. It supplies the raw latest-snapshot and completed-bar endpoints consumed by this project. Its implementation is not presented as new competition work.

**Built for this project:** the ODPS-centred governed bundle; OpenAPI contract; FX-35 value set; deterministic decimal, UTC, coherence and OHLC evaluation; evidence and availability classification; Cloudflare MCP Worker; typed tool contracts; ChatGPT component; professional documentation; tests; deployment; and competition demo were created and integrated as ODP Market Steward.

## How Codex and GPT-5.6 were used

Codex was the principal engineering collaborator across requirements analysis, standards research, architecture, contract generation, TypeScript implementation, tests, Cloudflare deployment diagnostics, MCP/App integration, documentation and demo preparation. The human product owner made the consequential decisions: product scope, public identity, rights authorization, disclaimer language, UX priorities, deployment approvals and final acceptance.

GPT-5.6 in ChatGPT provides the conversational stewardship layer demonstrated in the video: it selects the read-only MCP tools, interprets their typed governed results and produces user-directed summaries. Numerical validation, coverage and governance status remain deterministic tool outputs rather than model-generated facts.

## Current POC boundaries

- Demonstration only; not a production trading or execution service.
- No authentication in the public competition deployment.
- No orders, transactions or write actions.
- Availability follows the upstream demonstration feed and market schedule.
- The POC does not claim that every planned catalogue, graph, vocabulary or recipe artifact is an official ODPI-family implementation.
- Broader historical evidence, production-grade tenant isolation, calendar-backed freshness and the remaining planned domain tools are future work.

## Disclaimer

**MARKET DATA DEMO.** This API and application are provided solely to demonstrate app functionality for the competition. Use at your own risk. Data may be delayed, incomplete, unavailable, inaccurate, or contain errors. The provider accepts no responsibility for use of the API, application, or data and gives no guarantee regarding data accuracy or service availability. Nothing presented is investment advice, a recommendation, or an offer to buy or sell any financial instrument. The API, application, and data must not be used for live trading or order execution.

## Demo

Watch the 2:53 submission video: **[ODP Market Steward — Governed Live Market Data in ChatGPT](https://youtu.be/26mSDmXEA6c)**.
