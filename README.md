# Code Analysis Dashboard

One public static dashboard for current upstream branch and pull-request findings.

Source: ARYDESTROYER/Kavach-AgenticSOC. Analysis host: combustrrr/Agentic-Kibana.

GitHub Actions produces exact-revision reports. This repository maintains current report assets and publishes one UI to GitHub Pages. No application source is executed by the publisher.

Configure config/code-analysis/service.json to replicate the service. The source host runs the discovery and exact-source workflows; this repository runs the publication template.

No database, external object store, account system, or historical findings browser is required.

To retry one target after vendor access is repaired, run Discover upstream analysis targets in the analysis host Actions tab. Set refresh_target to a branch name, PR #number, or dashboard target ID. Other targets remain visible and the two-analysis limit still applies.
