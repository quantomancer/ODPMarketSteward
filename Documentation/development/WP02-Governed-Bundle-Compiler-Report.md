# Governed bundle compiler and runtime registry report

- **Evidence timestamp:** 2026-07-21T11:41:22Z
- **Scope:** WP01-004, WP02-001 and WP02-002 local acceptance evidence; focused progress on WP02-004 and WP02-006
- **Runtime:** Node.js 24.18.0, pnpm 11.15.1
- **Cloud boundary:** no Cloudflare deployment, account mutation, secret access, source API call, or remote resource write occurred
- **Public classification:** MARKET DATA DEMO; UTC

## Outcome

The repository now has a buildable source boundary for every DLD module M01–M18. Modules that are not yet governed for full behavior expose explicit ports rather than invented implementations. The runtime contract foundation uses a deterministic generator to embed `bundle.yaml` and its seven `requiredAtRuntime` artifacts, followed by a fail-closed two-phase parse-then-link loader and a responsibility-aware registry.

WP01-004, WP02-001 and WP02-002 meet their stated local acceptance evidence. WP02-003 remains blocked by DLD-001. WP02-004 and WP02-006 have focused implementation progress but remain incomplete because the full typed registry/tool contract chain and all twelve standalone schemas do not yet exist.

## Implemented controls

| Control | Inspected implementation and result |
|---|---|
| M01–M18 skeleton | A typed module catalogue maps exactly 18 unique identifiers in order to existing source files. Implemented vertical slices and definition-only ports are explicitly distinguished. |
| Deterministic embedding | `compile-governed-bundle.mjs` parses the manifest and seven runtime artifacts with duplicate-key rejection, validates safe paths and source SHA-256 values, checks exact runtime load order, and generates one embedded TypeScript artifact. Two consecutive generations produced the same digest. |
| Phase 1 parse | The runtime loader parses the exact embedded manifest and every runtime artifact before resolving links. YAML errors and duplicate keys fail closed. |
| Phase 2 link | Safe bundle-relative paths, complete runtime input presence, dependency existence/cycles, artifact versions and exact byte digests are verified before a registry is returned. |
| Pointer API | Empty and RFC 6901-style local JSON Pointers resolve only inside verified artifacts; malformed and unresolved pointers fail closed. |
| Responsibility API | Registry responsibility lookup reads `runtimePolicy.conflictPolicy`, preserving ODPS, OpenAPI, instrument, rule, monitoring, publication and MCP ownership boundaries. |
| Registry-backed profile | The local discovery tool now obtains product name, application identity, MARKET DATA DEMO label, UTC basis, 35-member count and declared standards from verified owning artifacts rather than hard-coded application values. It performs no source API call. |
| Transitive peer control | Strict peer checks remain enabled. A narrow `@cloudflare/workers-types` allowed-version exception records the incompatible transitive ranges requested by Wrangler and PartyServer; runtime application types still come only from `wrangler types`. |

## Verification evidence

- Generated registry source: 129,816 bytes; SHA-256 `c2e38ae9d6939f01fb254559daee11fb5d5d7b0f936c40e4cf8b7eadc3f13c62`.
- Lockfile: 145,748 bytes; SHA-256 `3e7ff645427cdeeed27c596ae4f4f45b75227df4f5d5fcea4606e8a91ea4a999`.
- Wrangler generated types: up to date.
- TypeScript, ESLint and Prettier: pass.
- Dependency-cruiser: 34 modules, 29 dependencies, zero violations.
- Vitest: 5 files and 17 tests passed.
- Coverage bootstrap: statements 87.50%, branches 78.03%, functions 95.45%, lines 89.89%.
- Component and Worker production builds: pass under Node.js 24.18.0.
- Local workerd: health readiness, MCP initialization, persisted runtime restart, tool discovery and registry-backed profile execution passed.
- Governed bundle source: all seven embedded runtime artifacts retained their manifest-declared digests; the wider maintained bundle remains separately checked through its 13-artifact manifest.

Focused negative vectors cover artifact byte tampering, duplicate YAML keys, bundle-root path escape, missing dependency targets, dependency cycles, runtime load-order drift, artifact-version drift with a correspondingly revised digest, malformed pointers and unresolved pointers.

## Explicit limitations

- The normative MCP application contract advertises six tools and twelve standalone schemas. Only the earlier focused profile tool is registered; its temporary spike result is not claimed as the final `ProductProfileOutput` contract. WP02-003, WP02-004 and WP02-006 therefore remain incomplete.
- The loader validates the project manifest controls implemented here; it does not claim full ODPS controlling-schema, OpenAPI semantic, ODP SDK or independent third-party conformance.
- The buildable M01–M18 skeleton is not equivalent to complete feature behavior. Several modules are ports pending their owning DLD decisions.
- T0/T1 and G0 remain open because immutable acceptance-ledger packaging, full schema/conformance evidence and release provenance are not complete.
- No live market data, ChatGPT host, staging Durable Object, browser accessibility, security, concurrency, performance or production test was performed in this increment.
