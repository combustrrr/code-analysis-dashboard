# ADR-0001: Operate analysis as an external service

- Status: Accepted
- Date: 2026-10-02
- Decision owners: service maintainers
- Related: [Migration boundaries](../MIGRATION.md), [upstream boundary](../architecture/UPSTREAM_SYNC_BOUNDARY.md)

## Context

The service analyzes repositories owned by different people and organizations. Copying
dashboard runtime, scanner orchestration, credentials, or publication code into each
source repository would expand the trust boundary and require upstream writes.

## Decision

`combustrrr/code-analysis-dashboard` owns the authorization API, scanner tooling,
workflows, report publication, and UI. Configured repositories are read-only analysis
sources checked out at immutable SHAs. Upstream changes require separate authorization.

## Consequences

- Source repositories do not need dashboard runtime or service credentials.
- Central tooling and policy can be reviewed and upgraded once.
- The service must maintain a trusted registry of exact repository identities.
- Native source feedback is disabled unless a future decision explicitly authorizes it.
- Cross-repository onboarding requires explicit identity, permission, and acceptance
  verification.

