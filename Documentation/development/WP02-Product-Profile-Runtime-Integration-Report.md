# WP02 product-profile runtime integration report

- Evidence time: 2026-07-21T12:48:54Z
- Scope: `get_fx_product_profile` only
- Runtime: Node.js 24.18.0, pnpm 11.15.1, Wrangler 4.112.0
- Governed bundle: 1.2.0
- MCP application contract: 1.2.0
- Deployment or remote write: none
- Source API or live market-data call: none

## Implemented result

The Worker now registers one model-visible read-only tool, `get_fx_product_profile`. The tool descriptor is projected from the verified MCP application contract and advertises the generated standalone JSON Schema 2020-12 input and output contracts. The five other model/domain or component-only tool contracts remain generated but are not registered because their handlers are not implemented.

The accepted request requires one or more unique `sections` values. A valid call returns the normative `ProductProfileSuccessOutput` with:

- the governed product and bundle identity;
- the ODPS version and verified product-artifact SHA-256 digest;
- one artifact pointer, JSON Pointer and resolved value for each requested section;
- all seven verified runtime artifact pointers in the governance context;
- explicit validation-layer results that distinguish `PASS` from `NOT_TESTED`;
- `completeForRequiredLayers: false`, because controlling-schema, live source-alignment and ODP SDK compatibility are not executed by this network-free call; and
- the exact `MARKET DATA DEMO` disclaimer and policy version.

Malformed arguments are rejected at the MCP input-validation boundary and do not reach the application handler. Successful output is revalidated against the generated output schema before it is returned.

## Runtime integration details

The schema materializer now emits top-level `type: object` on every generated input and output schema, as required by the pinned MCP SDK tool descriptor validator, while retaining the standalone `$ref` and `$defs` graph. Build-time schema compilation remains AJV-based. Runtime request/result validation uses `@cfworker/json-schema` 4.1.1 because Cloudflare Workers prohibit AJV's dynamic `new Function` compilation.

The pinned Apps helper accepts Standard Schema types but the pinned MCP SDK serializes only Zod schemas. The integration therefore uses an object-shaped Zod validation shell backed by the Cloudflare-safe validator and overrides `tools/list` through the MCP SDK's documented low-level server surface so the published schemas remain byte-structure-equivalent to the generated governed schemas. Both root and compatibility `_meta` `noauth` security declarations are advertised.

## Exact verification

The complete `pnpm verify` command finished successfully under the exact pinned runtime. Verified stages were:

- deterministic governed-bundle compilation: 7 runtime artifacts, 6 declared tools, 12 standalone schemas;
- Wrangler generated-type drift check;
- TypeScript, ESLint and Prettier checks;
- dependency-cruiser: 38 modules, 33 dependencies, zero violations;
- Vitest: 7 files, 25 tests, all passed;
- coverage: 87.63% statements, 77.27% branches, 95.23% functions, 89.31% lines;
- component and Worker production builds; and
- local Workerd initialize, persisted restart, exact one-tool discovery, generated descriptor IDs and governed product-profile call.

The local Workerd smoke result was `PASS` with session ID issuance, restart persistence, `get_fx_product_profile` discovery and a returned `MARKET DATA DEMO` disclaimer.

## Acceptance boundary

- WP02-003 remains **false / IN_PROGRESS**: the profile tool has published descriptor/handler parity, but five declared tool handlers are still unimplemented and unregistered.
- WP02-004 remains **false / IN_PROGRESS**: the typed registry now projects MCP descriptor metadata and all product-profile sections from owning artifacts, but the complete multi-tool runtime registry depends on the remaining handlers.
- WP02-005 remains **false / NOT_STARTED**: no full readiness/criticality fixture matrix exists.
- WP02-006 remains **false / IN_PROGRESS**: the normative network-free use case and exact output now pass, but its declared WP02-004..005 dependencies are not complete.
- WP06-003 remains **false / NOT_STARTED**: exactly one of six tools is registered; intentionally no placeholder registrations were added.

This report is focused local evidence. It is not ChatGPT-host validation, staging evidence, a Cloudflare deployment result, an ODPI certification claim, a live-source alignment result or proof of public-release readiness.
