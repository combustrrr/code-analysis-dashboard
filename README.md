# Code Analysis Dashboard

A standalone code-analysis application: lightweight React dashboard, Cloudflare
authentication, GitHub Actions orchestration, scanner adapters, and current reports.

Before contributing, read [CONTRIBUTING.md](CONTRIBUTING.md). Report security
vulnerabilities privately as described in [SECURITY.md](SECURITY.md), and see
[ACCESSIBILITY.md](ACCESSIBILITY.md) for the accessibility commitment and known
limitations.

Start with the [documentation index](docs/README.md), then read the
[system architecture](docs/architecture/SYSTEM_OVERVIEW.md). Operational guides are grouped under
the [current](docs/current/README.md), [architecture](docs/architecture/README.md),
[operations](docs/operations/README.md), and [governance](docs/governance/README.md)
indexes.

The authoritative system map is
[docs/architecture/SYSTEM_OVERVIEW.md](docs/architecture/SYSTEM_OVERVIEW.md), and
consequential engineering choices are recorded in
[docs/decisions/](docs/decisions/README.md).

## Project layout

- `analysis-ui/`: static dashboard, trusted-project browsing, reports, issues, provenance, and explicit scan launch ([guide](analysis-ui/README.md)).
- `analysis-launcher/`: GitHub sign-in and authorized launching on Cloudflare ([guide](analysis-launcher/README.md)).
- `scripts/code_analysis/`: discovery, scanner adapters, normalization, publication ([guide](scripts/README.md)).
- `config/code-analysis/`: repository profile, scanner inventory, report contracts ([guide](config/code-analysis/README.md)).
- `.github/workflows/`: producers, discovery, compatibility, updates, Pages ([guide](.github/README.md)).
- `tests/security_canary/`: scanner fixtures, never product runtime code ([guide](tests/README.md)).
- `docs/`: current implementation, architecture, operations, governance, roadmap, and archive indexes.

## Local verification

```shell
python -m pip install -r .ci/requirements.txt
python -m unittest scripts.code_analysis.test_hosted scripts.code_analysis.test_extensions scripts.code_analysis.test_portability scripts.code_analysis.test_scanner_access scripts.code_analysis.test_scanner_updates
python -m pytest scripts/deployment -v
python -m scripts.code_analysis.audit_workflows
node --test analysis-launcher/worker.test.mjs
cd analysis-ui
npm ci --ignore-scripts
npm run build
```

## Browse configured projects

For the already configured analysis instance, sign in and open **Projects**, the only
workspace home, to browse the service's three trusted targets. Project selection,
settings, and report viewing do not trigger a scan. On a project, **Fast analysis** repeats
that user's most recent branch, pull request, or commit, then recomputes and submits every
scanner currently available for the resolved revision. Without prior history it resolves the
configured preferred branch. The independent scanner lanes run concurrently; “Fast” refers to
automatic selection and never reuses an older reduced scanner subset. **Configure analysis** starts with a full 40-character SHA, offers
branch or pull-request selection as a fallback, and supports safe defaults, individual
producer groups, or every currently available channel with explicit vendor confirmation.
The service verifies the resolved immutable SHA before starting the request. A 202 means
accepted and preparing, not completed. Different projects and revisions run concurrently;
matching active project/SHA requests merge missing scanner channels instead of duplicating
work, and selected scanner lanes run concurrently. Repository administration
is required to change the versioned target registry. There is no per-user
execution-repository selection or App installation flow. See the
[read-only analysis runbook](docs/operations/READ_ONLY_ANALYSIS.md) for the end-to-end
steps, source boundaries, and storage locations.

The source scanner jobs use an ephemeral, read-only checkout at the selected immutable
SHA. They do not push commits, edit files, change refs, create pull requests, or publish
checks/SARIF to either analyzed source. Service request state and reports are stored
separately by the control plane, as documented in the runbook.

The fixed execution repository runs the Actions workflows. A SQLite-backed Durable Object
retains concurrent analysis leases and duplicate-suppression state; current source-only reports, the single
current PR overlay, and temporary producer artifacts are stored in Cloudflare R2. Small wrappers reference immutable shared
workflows in this service repository. Scanner credentials are supplied by that
repository's owner; configuration alone does not prove usable scanner evidence.
Source-only observer projects do not upload checks or security findings to the source.

## Deployment

The shared UI is hosted on GitHub Pages; Cloudflare handles authentication,
authorization and report delivery. Reports are not bundled into the UI build.
Every pull request and `main` push runs the repository-wide CI workflow. Scoped CD
workflows deploy UI changes to Pages, Worker changes to Cloudflare, and validated
scanner changes through immutable tooling promotion. See the
[CI/CD runbook](docs/operations/CI-CD.md).
The checked-in project registry targets `ARYDESTROYER/Kavach-AgenticSOC`,
`combustrrr/code-analysis-dashboard`, and `combustrrr/Agentic-Kibana`; the dashboard is
the fixed execution host and its self-analysis target. Registry/workflow changes are
deployed to the fixed service as part of the 2026-10-16 configured-source rollout.
Independent external-owner installations are not part of the
dashboard onboarding flow.

See [migration status](docs/MIGRATION.md) and
[authenticated launch setup](docs/current/AUTHENTICATED_LAUNCHING.md).
Future scanner, triage, compliance and onboarding work is tracked in
[the roadmap](docs/roadmap/ROADMAP.md); roadmap items are not current product guarantees.

## Finding filters and connection checks

Issues supports URL-preserved severity, category, scanner, rule, file, directory,
source-location and scanner-overlap filters, plus free-text search and Clear filters. Multiple scanners
means supporting scanner families, not proof of a shared root cause. Overview
shortcuts and target changes clear unrelated filters.

The Threat Report view adds deterministic catalog explanations, potential impact,
remediation steps, coverage limitations, private links, JSON/Markdown downloads, and
locally generated single-PDF exports without changing the underlying scanner evidence.

Analysis begins only after an authorized collaborator starts Fast or configured
analysis. Administrators may explicitly run the preferred-branch batch when all three
trusted projects need refreshing; it is not scheduled automatically. Scheduled
coordinator reconciliation recovers already accepted durable requests and never
discovers a branch or pull request. Each immutable
`analysis-request-v4` envelope pins the configured project, selected revision SHA,
tooling/profile digests, selected channels, actor, and idempotency key. Matching channel
evidence is reused unless **Run again** is selected. Same-SHA publication replaces only
validated selected channels; unselected channels are `NOT_SELECTED`, distinct from
`NOT_APPLICABLE`, `DEFERRED`, and failures. Source-only evidence is retained separately
from the current PR review overlay, keyed by project, PR, head repository/SHA, base SHA,
tooling, and profile. There is no Evaluation Mode SHA or dispatch budget. No findings,
comments, checks, SARIF, commits, or PRs are written to any analyzed source, including
self-analysis.

Readiness verifies the selected project's profile and execution workflows. A successful
readiness check does not imply complete scanner evidence. Authorized collaborators can
inspect configured targets and reports and explicitly submit a scan request; only
administrators can change the trusted registry. GitHub Actions
artifacts in the public service repository remain publicly accessible; dashboard sign-in
does not make scanner evidence confidential.

See [free services and OSS perks](docs/operations/FREE_SERVICES.md) for the Cloudflare operations
configuration, diagnostics privacy and evaluated optional programs.
