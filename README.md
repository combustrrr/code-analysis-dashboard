# Code Analysis Dashboard

A standalone code-analysis application: React/Ant Design dashboard, Cloudflare
authentication, GitHub Actions orchestration, scanner adapters, and current reports.

Start a new chat with [docs/HANDOFF.md](docs/HANDOFF.md). Current operational guides
are indexed in [docs/code-analysis/README.md](docs/code-analysis/README.md).

## Project layout

- `analysis-ui/`: static dashboard, themes, issues, provenance, and direct scan launch.
- `analysis-launcher/`: GitHub sign-in and authorized launching on Cloudflare.
- `scripts/code_analysis/`: discovery, scanner adapters, normalization, publication.
- `config/code-analysis/`: repository profile, scanner inventory, report contracts.
- `.github/workflows/`: producers, discovery, compatibility, updates, Pages.
- `tests/security_canary/`: scanner fixtures, never product runtime code.
- `docs/code-analysis/`: architecture, integrations, and operations.

## Local verification

```shell
python -m pip install -r .ci/requirements.txt
python -m unittest scripts.code_analysis.test_hosted scripts.code_analysis.test_extensions scripts.code_analysis.test_portability scripts.code_analysis.test_scanner_access scripts.code_analysis.test_scanner_updates
python -m scripts.code_analysis.audit_workflows
node --test analysis-launcher/worker.test.mjs
cd analysis-ui
npm ci --ignore-scripts
npm run build
```

## Connect a repository

Open the application's **Repositories** section, sign in with GitHub, and install
Code Analysis Dashboard on an execution repository you administer. Load repositories
and select it. Leave Source repository blank to analyze that repository, or enter
another public repository to analyze it read-only.

Preview setup and review every generated workflow and profile before confirming
the installation commit. Branch protection is never bypassed. Load configured
projects to review scanner commands and credentials, then open the project and
choose **Run analysis**. Select a branch, PR number, or full 40-character commit SHA.
The activity view distinguishes queued execution from published results.

Each execution repository runs its own Actions and stores current reports in
managed Release assets. Small wrappers reference immutable shared workflows in
this service repository. Scanner credentials are supplied by that repository's
owner; configuration alone does not prove usable scanner evidence. Source-only
observer projects do not upload checks or security findings to the source.

## Deployment

The shared UI is hosted on GitHub Pages; Cloudflare handles authentication,
authorization and report delivery. Reports are not bundled into the UI build.
This instance currently executes connected service-self and read-only source
projects in combustrrr/code-analysis-dashboard. Agentic-Kibana and upstream remain
read-only. Independent external-owner installation is outside the current scope and not live-proven;
do not treat the second read-only source test as independent onboarding acceptance.

See [migration status](docs/MIGRATION.md) and
[authenticated launch setup](docs/code-analysis/AUTHENTICATED_LAUNCHING.md).

## Finding filters and connection checks

Issues supports combined severity, scanner, rule, file, directory, source-location and
scanner-overlap filters, plus free-text search and Clear filters. Multiple scanners
means supporting scanner families, not proof of a shared root cause. Overview
shortcuts and target changes clear unrelated filters.

Connections verifies the selected project identity, current App access and both
execution workflows. A successful connection check does not imply complete scanner
evidence. Repositories allows scan users to inspect projects; administrator access
is required for setup or configuration commits. Changing the source invalidates
an installation preview, and failed requests can be retried.
