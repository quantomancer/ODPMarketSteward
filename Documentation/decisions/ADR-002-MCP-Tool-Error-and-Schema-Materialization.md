# ADR-002: MCP tool-error contract and standalone schema materialization

- **Status:** Accepted
- **Decision date:** 2026-07-21 UTC
- **Owners:** MCP contract owner; architecture approver
- **Affected records:** DLD-001, WP00-002, WP02-003, WP02-004, WP04-002, WP06-002
- **Owning artifact:** `ODPMarketStewardBundle/application/mcp-application.yaml` version 1.2.0
- **Public boundary:** MARKET DATA DEMO; UTC

## Context

The six MCP outputs previously represented disclosure and successful domain results but had no common schema-valid application-failure branch. That prevented stable handling of contract, source, output, model, session and internal failures and blocked DLD-001. The application contract also used maintainable local `#/schemas/...` references that cannot be advertised as standalone tool schemas.

Current OpenAI Apps SDK guidance describes MCP tools as self-describing input/output JSON Schema contracts and requires returned structured content to match each advertised `outputSchema`. It also distinguishes runtime error results such as authentication challenges from protocol setup and framing failures. The project therefore needs both a typed application-error result and an explicit protocol boundary.

## Decision

1. Version the governed bundle and MCP application contract at 1.2.0.
2. Add `ToolErrorOutput` to all six output unions, including product discovery and component-only acknowledgement.
3. Use these stable application codes: `INVALID_INPUT`, `INVALID_SESSION`, `CONTRACT_UNAVAILABLE`, `SOURCE_UNAVAILABLE`, `SOURCE_INVALID`, `OUTPUT_INVALID`, `MODEL_UNAVAILABLE`, and `INTERNAL_ERROR`.
4. Require a safe message, retryability, safe next action, opaque correlation identifier, and the complete MARKET DATA DEMO disclaimer. Stack traces, raw upstream payloads, credentials and infrastructure identifiers are prohibited.
5. Return completed application failures as an MCP tool result with `isError: true`; `structuredContent` is the schema-valid `ToolErrorOutput`, and `content` is one short summary containing no additional fact.
6. Reject structurally malformed arguments through the advertised input-schema boundary as MCP `invalid_params`. Keep initialization, framing, unsupported-method and transport failures as standard JSON-RPC/MCP errors. Do not disguise these as domain results.
7. Materialize exactly one input and one output JSON Schema for each of the six declared tools. Every schema uses JSON Schema 2020-12, contains only local `#/$defs/...` references, has a unique deterministic `$id`, and compiles independently.
8. Fail generation on duplicate tool names, missing references, reference cycles, unsupported non-local root references, invalid JSON Schema, manifest digest drift or application-contract version drift.

## Consequences

- DLD-001 and WP06-002 can close with versioned contract and mapping-test evidence.
- The twelve schema artifacts now exist and compile independently, but WP02-003 remains incomplete until all six actual registered handlers and published descriptors prove parity with them.
- Product-profile output is now an explicit success-or-error union; the temporary profile handler still uses its earlier focused spike schema and must be migrated before WP02-006 or WP06-003 can complete.
- An HTTP 200 response can carry an MCP `tools/call` application error; transport success must not be interpreted as domain success.
- No Cloudflare deployment, source API access, credential access or live market-data call is authorized or implied by this decision.

## Verification contract

Acceptance requires deterministic two-run generation, independent AJV compilation of all twelve schemas, missing/cycle/duplicate/non-local negative cases, one ToolErrorOutput validation against every tool output, safe mapping and protocol-policy tests, strict TypeScript/lint/format/dependency checks, production builds, local workerd MCP smoke, and exact Node 24.18.0 plus pnpm 11.15.1 execution. Results are recorded in the [WP02 standalone MCP schema report](../development/WP02-Standalone-MCP-Schema-Report.md).

## References

- [OpenAI Apps SDK MCP concepts](https://developers.openai.com/apps-sdk/concepts/mcp-server)
- [OpenAI Apps SDK integration testing](https://developers.openai.com/apps-sdk/deploy/testing)
- [MCP application contract](../ODPMarketStewardBundle/application/mcp-application.yaml)
- [Detailed-level design](../ODPMarketStewardBundle/design/DetailedLevelDesign.html)
