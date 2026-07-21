# Contributing

## Change workflow

1. Identify the governing project-plan and design records.
2. Keep the change small and respect the module boundaries in `AGENTS.md`.
3. Add or update the relevant automated tests and evidence.
4. Review the diff in WebStorm, including generated-file and secret checks.
5. Record only verified results; keep incomplete acceptance items open.

## WebStorm review checklist

- No unapproved dependency or toolchain drift.
- No secrets, account identifiers, local environment paths, or confidential provider details.
- UTC is used for service time semantics.
- User-facing language clearly identifies a MARKET DATA DEMO.
- Domain and application dependency directions remain inward.
- Source DTOs do not escape their adapter.
- Component code consumes only its public bridge/result contract.
- Generated artifacts are reproducible and are not edited as source contracts.
- Tests cover the changed behavior at the appropriate layer.
- Evidence precisely states whether validation was full, focused, sampled, partial, or failed.

Do not add a license, remote, deployment configuration, or release automation until its project decision is accepted.
