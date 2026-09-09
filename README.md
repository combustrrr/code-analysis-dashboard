# Code Analysis Dashboard

A standalone code-analysis application: React/Ant Design dashboard, Cloudflare
authentication, GitHub Actions orchestration, scanner adapters, and current reports.

## Project layout

- `analysis-ui/`: static dashboard, themes, issues, provenance, and scan wizard.
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

## Deployment

This extraction branch consolidates the service files. Live host cutover is pending;
see [migration prerequisites](docs/MIGRATION.md) before merging or activating it.

Source: ARYDESTROYER/Kavach-AgenticSOC. Analysis host: combustrrr/Agentic-Kibana.

GitHub Actions produces exact-revision reports. This repository maintains current report assets and publishes one UI to GitHub Pages. No application source is executed by the publisher.

Configure config/code-analysis/service.json to replicate the service. The source host runs the discovery and exact-source workflows; this repository runs the publication template.

Viewing reports is public and static. Direct analysis launching uses GitHub sign-in through the optional Cloudflare Worker in analysis-launcher/. No report database or historical findings browser is required.

See [authenticated launch setup](docs/code-analysis/AUTHENTICATED_LAUNCHING.md). Direct launch is disabled until the GitHub App and Worker are configured; the Run analysis dialog provides the GitHub Actions handoff meanwhile.

To retry one target after vendor access is repaired, run Discover upstream analysis targets in the analysis host Actions tab. Set refresh_target to a branch name, PR #number, or dashboard target ID. Other targets remain visible and the two-analysis limit still applies.
