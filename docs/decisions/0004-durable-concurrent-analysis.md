# ADR-0004: Use durable admission, parallel scanner lanes, and fenced publication

- Status: Accepted
- Date: 2026-10-20
- Decision owners: service maintainers
- Related: [Workflow architecture](../architecture/WORKFLOWS.md), [read-only analysis](../operations/READ_ONLY_ANALYSIS.md)

## Context

An analysis request must survive a failed workflow dispatch without becoming duplicated.
Independent scanners should not be serialized, while concurrent results must not race
to replace the current report.

## Decision

The Worker durably admits `analysis-request-v4` before a best-effort coordinator wake.
Channel claims use generation and opaque lease-token fencing. Independent scanner lanes
run concurrently. Matching active requests merge missing channels. Publication alone is
serialized per project and must confirm that the request is still the newest accepted
revision.

## Consequences

- Dispatch failure is recoverable by scheduled reconciliation.
- Different projects, revisions, and scanner lanes can make progress concurrently.
- Duplicate submissions are idempotent instead of creating competing runs.
- Heartbeats, lease expiry, supersession, and stale-finalizer rejection add control-plane
  complexity.
- Publication latency includes a deliberate barrier for requested scanner evidence.

