# ADR-0005: Store current report assets in Cloudflare R2

- Status: Accepted
- Date: 2026-10-16
- Decision owners: service maintainers
- Related: [R2 migration RFC](../architecture/R2_ARTIFACT_MIGRATION_RFC.md), [free services](../operations/FREE_SERVICES.md)

## Context

Large reports and tens of thousands of findings exceeded practical single-asset and
GitHub Pages delivery limits. Rebuilding the application for every publication also
coupled data freshness to UI deployment.

## Decision

Store current report manifests, compressed report shards, PR overlays, and temporary
producer artifacts in Cloudflare R2 under repository-qualified keys. The Worker serves
authorized report reads. Application assets remain on GitHub Pages.

## Consequences

- Report publication is independent of UI deployment.
- Large reports can be sharded with explicit per-asset and per-project limits.
- Replacement uploads assets before atomically changing manifest references.
- Operators must manage lifecycle, capacity, qualified keys, and legacy-read migration.
- GitHub Actions artifacts remain separate execution evidence and are not made private by
  this storage decision.

