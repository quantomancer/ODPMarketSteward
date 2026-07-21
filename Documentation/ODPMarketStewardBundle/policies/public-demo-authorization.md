# Public competition-demo use authorization

- Status: ACCEPTED
- Decision: ADR-006
- Decision date: 2026-07-21 UTC
- Decision owner: FXLive API and ODP Market Steward product owner
- Scope: ODP Market Steward competition demonstration

## Decision

The product owner states that they control the public FXLive API and authorizes ODP Market Steward to retrieve its public responses, display them in the public ChatGPT App, make the App available to competition judges, show the App and its responses in competition screenshots and demonstration video, and perform the governed deterministic calculations and plausibility evaluations defined by the ODP Market Steward bundle.

For this project, public attribution is limited to the identities permitted by `publication-policy.yaml`: ODP Market Steward, FXLive, and QMVP. No prohibited upstream-provider identity or private operational identity may appear on a public surface.

This is an authoritative internal product-owner authorization record for the stated project scope. It is not an independent legal opinion or a third-party legal audit, and it does not authorize unrelated redistribution, resale, order execution, or the optional capture, storage, and replay workflow in WP11.

## Mandatory public notice

Every applicable public surface must carry this exact notice:

> MARKET DATA DEMO. This API and application are provided solely to demonstrate app functionality for the competition. Use at your own risk. Data may be delayed, incomplete, unavailable, inaccurate, or contain errors. The provider accepts no responsibility for use of the API, application, or data and gives no guarantee regarding data accuracy or service availability. Nothing presented is investment advice, a recommendation, or an offer to buy or sell any financial instrument. The API, application, and data must not be used for live trading or order execution.

The notice must be acknowledged through the governed application flow before the first interactive market-data retrieval. It is a safety and publication condition; it is not the source of the authorization above.

## Consequences

- Public App display, competition-judge access, screenshots, demo video, and governed calculation use may proceed within this decision's scope.
- `DLD-009`, `WP00-004`, `G1`, and `WP10-001` may close when this record and the corresponding policy/contract changes have been validated.
- The `MARKET DATA DEMO` label, UTC presentation, no-advice boundary, use-at-own-risk statement, responsibility exclusion, and availability/accuracy non-guarantee are mandatory.
- WP11 recorded evidence remains on hold pending its own explicit capture, storage, retention, replay, and deletion authorization.

## Evidence boundary

The evidence for this decision is the product owner's explicit written instruction in the project conversation on 2026-07-21. The project does not claim that an external lawyer or third party independently verified the declaration.
