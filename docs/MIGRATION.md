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
- Preferred-branch analysis launches require one explicit Fast Path action. The Worker
  applies the operator-configured default scanner policy and resolves the immutable
  revision before admission. Non-default revisions or channels use the separate
  revision -> scanners -> exact-SHA review custom wizard. The `analysis-request-v3` envelope pins the
  configured project, selected SHA, tooling/profile digests, requested channels, actor,
  and idempotency key; 202 is accepted/queued, not complete.
- Accepted requests drain FIFO from a bounded queue with one active source revision
  globally. Each claim has a generation and opaque lease token, heartbeat renewal, and
  stale-finalizer rejection. A best-effort wake follows durable admission; scheduled
  recovery still claims accepted work only and never creates a request from discovery.
- Each configured repository keeps one current source-only report and at most one
  separately keyed current PR overlay (project, PR, head repository/SHA, base SHA,
  tooling, profile). Same-SHA runs replace only successfully validated selected
  channels; matching channel evidence is reused unless **Run again** is requested.
- No scanner feedback is written to analyzed sources, including the connected
  self-analysis target. Public Actions artifacts remain accessible outside the
  authenticated dashboard; this migration does not make them confidential.

## Storage Boundary

- GitHub Actions executes scanners and dispatch/reconciliation workflows.
- Cloudflare R2 stores current report manifests, compressed report shards, and temporary
  producer artifacts under `temp-runs/`.
- The current manifest references the source-only report and optional PR overlay;
  overlay content is stored in its own content-addressed asset and fetched only when
  named in the current manifest. Superseded report/overlay assets are deleted only after
  the replacement manifest is committed.
- The `temp-runs/` prefix has a one-day lifecycle rule; the Worker enforces 100 MB asset
  and 900 MB compressed-manifest limits.
- Cloudflare KV stores report service state. The SQLite-backed Durable Object stores
  OAuth exchanges, encrypted grants/session metadata, and the bounded FIFO request
  queue. GitHub Releases are no longer used for request admission or execution.

## Change Rules

1. Change service code, workflows, profiles, or documentation only in this repository.
2. Preserve source repository, target revision, workflow run, attempt, and tooling
   provenance across changes.
3. Generate workflows 11 and 12 with `generate_source_workflow.py`.
4. Run service tests, workflow audit, launcher tests, and relevant UI checks before
   deployment.
5. Deploy the Worker/report reader and trusted workflows before exposing the matching
   UI. Retain backward reading of `analysis-current-v1` manifests through the first
   valid new publication. This order was completed for the 2026-10-16 rollout; see
   [HANDOFF.md](HANDOFF.md) for the Worker version and Pages run.
6. Do not retire an active host or alter an upstream repository without separate,
   explicit authorization.

## Frontend route cutover

The authenticated information architecture uses `#/projects`, `#/activity`,
`#/projects/:projectId`, the project `issues`, `report`, and `run` routes, and the global
`#/settings?section=<section>&project=<optional-id>` workspace. Legacy query hashes,
`#/dashboard`, project-scoped settings, and the old custom-run route are removed rather
than normalized. Opening projects, changing navigation, filtering, refreshing, and
downloading evidence never enqueue analysis. Only the explicit **Run analysis** action
can create a request.

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
