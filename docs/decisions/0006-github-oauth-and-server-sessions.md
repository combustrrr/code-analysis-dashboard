# ADR-0006: Use GitHub OAuth with opaque server-side sessions

- Status: Accepted
- Date: 2026-10-23
- Decision owners: service maintainers
- Related: [Dashboard access](../operations/DASHBOARD-ACCESS.md), [authenticated launching](../current/AUTHENTICATED_LAUNCHING.md)

## Context

The browser needs GitHub-based sign-in without receiving or retaining a GitHub access
token. Access must be revocable and limited to current collaborators of the execution
repository.

## Decision

Use GitHub OAuth with a fixed Worker callback, server-side and browser-bound PKCE,
encrypted state, and a one-time exchange. The browser receives only an opaque session
handle kept in memory. The Durable Object retains encrypted grant and identity metadata.
Protected requests revalidate current GitHub identity and collaborator access.

## Consequences

- GitHub credentials and access tokens are never exposed to application JavaScript.
- Reloads and new tabs require a fresh sign-in by design.
- Logout revokes stored session state and attempts token deletion.
- Periodic access checks can remove a revoked viewer without waiting for session expiry.
- Protected startup depends on GitHub and Worker latency; independent checks should run
  concurrently without caching away revocation.
