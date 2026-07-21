# ODP Market Steward Agent Rules

## Authority and scope

- `Documentation/` is the authoritative home for the accepted functional requirements, technical requirements, detailed-level design, governed ODP bundle, and living project plan.
- Before material work, inspect `Documentation/ProjectPlan.html` and identify the affected FDN, WP, DLD, T, G, and R records.
- After every material decision, artifact or code change, test, deployment, blocker, failure, rollback, or evidence update, update `Documentation/ProjectPlan.html` before final reporting whenever project state changed.
- Public conclusions derived from local raw research must be incorporated into a reviewed controlling document; `Documentation/Import/` remains local and ignored.
- Do not infer acceptance of an implementation decision from the presence of a placeholder directory.
- Keep changes traceable to project-plan identifiers (FDN, WP, DLD, T, G, or R).

## Implementation boundaries

- TypeScript is the planned implementation language for both the MCP server and component.
- `packages/domain` must not import Cloudflare, MCP, network, OpenAI, UI, or persistence implementations.
- `packages/application` may depend inward on domain types and ports, not concrete adapters.
- Source API DTOs must remain inside `packages/adapter-source-api`.
- `apps/component` may consume only generated public result types and its bridge boundary.
- Worker bindings and secrets may be read only in the Worker composition/bootstrap boundary.
- Files in `generated/` are outputs. They must never overwrite or become the source of contracts in `contracts/bundle/`.
- Do not add dependency or toolchain versions until the corresponding decisions are approved and recorded.

## Product and publication rules

- The product name is **ODP Market Steward**.
- The competition title is **ODP Market Steward — Governed Live Market Data in ChatGPT**.
- User-facing and public artifacts must clearly say **MARKET DATA DEMO**.
- All service timestamps and time semantics must be UTC.
- Do not name, reference, imply, or expose any prohibited upstream data provider in public artifacts.
- Do not expose Cloudflare credentials, account identifiers, internal environment details, or local credential-wrapper details.
- This repository must never contain secrets. Use documented runtime bindings and local ignored files only after configuration decisions are approved.

## Quality and evidence

- Do not claim completion without inspecting the exact artifact or completed process.
- Keep contract, unit, adapter, session, MCP, component, and end-to-end tests separate.
- Store generated reports and release evidence under `evidence/`; do not commit sensitive or environment-specific data.
- Generated evidence must identify its scope, timestamp, inputs, and result.
- A placeholder, sampled check, or interrupted run is not acceptance evidence.

## Repository policy

- Git is permitted in this external implementation repository.
- Do not create or mirror Git metadata inside separate analysis or operations workspaces.
- Do not configure a remote or publish changes unless explicitly authorized.
- WebStorm is the primary review environment; `.idea/` remains local and ignored.
