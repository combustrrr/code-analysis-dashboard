# Code Analysis Dashboard

A standalone code-analysis application: React/Ant Design dashboard, Cloudflare
authentication, GitHub Actions orchestration, scanner adapters, and current reports.

Start with the [documentation index](docs/README.md), then read
[docs/HANDOFF.md](docs/HANDOFF.md). Current operational guides are grouped under
the [current](docs/current/README.md), [architecture](docs/architecture/README.md),
[operations](docs/operations/README.md), and [governance](docs/governance/README.md)
indexes.

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

For the already configured analysis instance, sign in and open **Projects** to browse
the service's three trusted targets. Selecting a project opens its current report and
does not trigger a scan. Users with write access to the fixed execution host can
separately choose **Run analysis** against a configured branch, PR, or exact commit SHA;
repository administration is required to change the versioned target registry. There is
no per-user execution-repository selection or App installation flow. See the
[read-only analysis runbook](docs/operations/READ_ONLY_ANALYSIS.md) for the end-to-end
steps, source boundaries, and storage locations.

The source scanner jobs use an ephemeral, read-only checkout at the selected immutable
SHA. They do not push commits, edit files, change refs, create pull requests, or publish
checks/SARIF to either analyzed source. Service request state and reports are stored
separately by the control plane, as documented in the runbook.

Each execution repository runs its own Actions. GitHub Releases retain the bounded
request queue and compatibility state; current reports and temporary producer
artifacts are stored in Cloudflare R2. Small wrappers reference immutable shared
workflows in this service repository. Scanner credentials are supplied by that
repository's owner; configuration alone does not prove usable scanner evidence.
Source-only observer projects do not upload checks or security findings to the source.

## Deployment

The shared UI is hosted on GitHub Pages; Cloudflare handles authentication,
authorization and report delivery. Reports are not bundled into the UI build.
The checked-in project registry targets `ARYDESTROYER/Kavach-AgenticSOC`,
`combustrrr/code-analysis-dashboard`, and `combustrrr/Agentic-Kibana`; the dashboard is
the fixed execution host and its self-analysis target. Registry/workflow changes are
local until deployed. Independent external-owner installations are not part of the
dashboard onboarding flow.

See [migration status](docs/MIGRATION.md) and
[authenticated launch setup](docs/current/AUTHENTICATED_LAUNCHING.md).
Future scanner, triage, compliance and onboarding work is tracked in
[the roadmap](docs/roadmap/ROADMAP.md); roadmap items are not current product guarantees.

## Finding filters and connection checks

Issues supports combined severity, scanner, rule, file, directory, source-location and
scanner-overlap filters, plus free-text search and Clear filters. Multiple scanners
means supporting scanner families, not proof of a shared root cause. Overview
shortcuts and target changes clear unrelated filters.

The Threat Report view adds deterministic catalog explanations, potential impact,
remediation steps, coverage limitations, private links, JSON/Markdown downloads, and
print-to-PDF output without changing the underlying scanner evidence.

Evaluation mode is enabled only for the configured Kavach `Testing` branch. It freezes
one exact commit SHA and permits one durable dispatch budget. Refreshing the dashboard
does not launch work; only an explicit **Run analysis** action can consume that budget.
Duplicate request assets are idempotent and return the existing queued request.

Readiness verifies the selected project's profile and both execution workflows. A
successful readiness check does not imply complete scanner evidence. Read-only
collaborators can inspect configured targets and reports; only execution-host writers
can submit a scan request, and only administrators can change the trusted registry.

See [free services and OSS perks](docs/operations/FREE_SERVICES.md) for the Cloudflare operations
configuration, diagnostics privacy and evaluated optional programs.
