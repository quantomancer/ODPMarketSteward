# ODP Market Steward Documentation

This folder is the authoritative home for ODP Market Steward specifications, requirements, design, project controls, and maintained documentation.

## Controlling documents

- [Project plan](ProjectPlan.html) — living delivery status and acceptance evidence.
- [Functional requirements](ODPMarketStewardBundle/requirements/FuncitionalRequirements.html) — functional and non-functional product baseline. The historical filename is retained for bundle compatibility.
- [Technical requirements](ODPMarketStewardBundle/requirements/TechnicalRequirements.html) — architecture, Cloudflare, MCP, security, operations, and testing baseline.
- [Detailed-level design](ODPMarketStewardBundle/design/DetailedLevelDesign.html) — accepted implementation design.
- [Governed bundle manifest](ODPMarketStewardBundle/bundle.yaml) — authoritative ODPI-centred bundle inventory and dependency graph.
- [Bundle documentation](ODPMarketStewardBundle/ODPMarketStewardBundleDocumentation.html) — professional bundle guide and responsibility model.
- [ADR-001](decisions/ADR-001-Toolchain-and-Dependency-Baseline.md) and its [compatibility-spike report](development/ADR-001-Compatibility-Spike-Report.md) — accepted exact toolchain/dependency baseline and inspected local execution evidence.
- [Governed bundle compiler report](development/WP02-Governed-Bundle-Compiler-Report.md) — deterministic embedding, two-phase runtime verification, responsibility registry, module-skeleton evidence, and explicit remaining WP02 limitations.

## Supporting areas

- `architecture/`, `decisions/`, `development/`, and `operations/` hold maintained implementation documentation as it is produced.
- `Archive/PreBundleRoot/` preserves superseded standalone artifacts that predate the governed bundle. They are historical evidence, not controlling specifications.
- `Import/` contains raw research/session exports. It remains local and Git-ignored because manifests contain workstation paths and unreviewed source material. Maintained public conclusions belong in the controlling documents above.

## Maintenance rule

All future ODP Market Steward specifications, documentation, decisions, and project-control updates must be made here. Runtime-derived copies under `contracts/` or `generated/` are implementation artifacts and must not become competing sources of truth.
