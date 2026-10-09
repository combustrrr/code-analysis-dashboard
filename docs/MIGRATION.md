# Migration and Deployment Boundaries

This file is the stable migration entry point required by repository contributor
instructions. Current deployment evidence is maintained in [HANDOFF.md](HANDOFF.md).

## Current Boundary

- `combustrrr/code-analysis-dashboard` owns scanner execution, orchestration, current
  reports, the Pages application, and the Cloudflare Worker.
- `ARYDESTROYER/Kavach-AgenticSOC` and `combustrrr/Agentic-Kibana` are read-only source
  projects for this service instance.
- No scanner workflow, credential, report publication, or dashboard runtime is copied
  into an upstream/product repository.
- Source-executing jobs use the configured immutable tooling revision and do not receive
  vendor or publication credentials.

## Storage Boundary

- GitHub Actions executes scanners and dispatch/reconciliation workflows.
- Cloudflare R2 stores current report manifests, compressed report shards, and temporary
  producer artifacts under `temp-runs/`.
- The `temp-runs/` prefix has a one-day lifecycle rule; the Worker enforces 100 MB asset
  and 900 MB compressed-manifest limits.
- Cloudflare KV stores service state. GitHub Releases remain only for the bounded request
  queue and compatibility state where the current implementation requires them.

## Change Rules

1. Change service code, workflows, profiles, or documentation only in this repository.
2. Preserve source repository, target revision, workflow run, attempt, and tooling
   provenance across changes.
3. Generate workflows 11 and 12 with `generate_source_workflow.py`.
4. Run service tests, workflow audit, launcher tests, and relevant UI checks before
   deployment.
5. Do not retire an active host or alter an upstream repository without separate,
   explicit authorization.

## Storage Key Compatibility

New KV and R2 writes are qualified as `repositories/<owner>/<repo>/...` to prevent
projects in different execution repositories from colliding. Public report routes and
manifest schemas remain unchanged. Readers try the qualified key first and then the
legacy unqualified key for ordinary manifest/state reads, so existing configured
projects continue to work while their next normal reconciliation publishes qualified
objects. Threat-report asset reads require the immutable asset to be present under the
qualified key; a legacy-only asset is not served.

The migration is write-forward, not a bulk copy: legacy objects are not fabricated or
deleted automatically. A repository that never republishes remains legacy-backed for
the reads that support fallback. Operators should confirm a successful qualified
publication before removing legacy objects. The current repository identity is used
directly; runtime repository remapping is not part of the storage migration.
Roadmap proposals are documented in [roadmap/ROADMAP.md](roadmap/ROADMAP.md) and are not current
deployment requirements.
