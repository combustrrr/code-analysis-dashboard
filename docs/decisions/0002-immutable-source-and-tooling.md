# ADR-0002: Bind analysis to immutable source and tooling identities

- Status: Accepted
- Date: 2026-10-16
- Decision owners: service maintainers
- Related: [Authenticated launching](../current/AUTHENTICATED_LAUNCHING.md), [system architecture](../architecture/SYSTEM_OVERVIEW.md)

## Context

Branch names move, scanner definitions change, and a report is not defensible if its
source or tooling can only be inferred after execution.

## Decision

Every accepted analysis resolves and records a full source SHA before execution. The
request also pins the tooling SHA, profile digest, project identity, requested channels,
actor, and idempotency key. Published evidence retains workflow run and attempt identity.

## Consequences

- Reports are reproducibly attributable to one source and tooling context.
- Branch and pull-request selection remain conveniences, not evidence identities.
- A ref moving between preview and confirmation rejects the launch.
- Cache reuse is allowed only when source, tooling, profile, and contextual identity
  match.
- More metadata must be preserved throughout admission, execution, and publication.
