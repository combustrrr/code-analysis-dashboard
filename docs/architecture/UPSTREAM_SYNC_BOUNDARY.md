# Upstream Synchronization Inspection Boundary

Status: unsupported by the current service architecture (2026-10-09).

## What Was Inspected

The service configuration records an execution repository and one or more source
repositories in `.github/code-analysis/projects.json`. A source project is either
connected to the execution repository or an observer; it is not an upstream/target
pair. Analysis targets are immutable source selections for a scan, not synchronization
state.

The Worker can make authenticated, read-only GitHub metadata requests. Existing
repository and project APIs preserve repository identity, selected source SHA, target
SHA, workflow run and attempt provenance. These APIs do not expose a configured
upstream ref, target ref, or synchronization record.

## Unsupported Boundary

There is currently no `/api/upstream-sync` endpoint or service. The service cannot
truthfully report all of the requested synchronization facts because:

- no configuration field identifies an upstream repository/ref and a target
  repository/ref as a synchronization pair;
- GitHub's existing compare metadata can describe commit counts and ahead/behind
  state, but divergence is not proof of merge conflicts;
- the Worker does not execute Git, create a temporary merge, or call a non-mutating
  conflict-analysis service; and
- no write operation may be used as a dry run. Creating PRs, merges, rebases, ref
  updates and upstream installations remain prohibited.

Consequently, no SHA, ancestry, divergence or conflict result is synthesized from
the current observer configuration. The regression test in
`analysis-launcher/application.test.mjs` ensures this unsupported route does not
silently start making GitHub calls.

## Required Design Before Support

Future support would need an explicit, immutable configuration schema for the two
