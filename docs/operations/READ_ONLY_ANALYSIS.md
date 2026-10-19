# Read-only analysis workflow

The configured-source implementation described below was deployed on 2026-10-16. The
Worker, workflows, and Pages rollout order and versions are recorded in
[HANDOFF.md](../HANDOFF.md). No production source-analysis scan was triggered during
deployment; use the source report provenance to verify any later scan independently.

This runbook covers the three public source targets configured on the fixed analysis host:

| Target | Branch to select | Read-only inspection baseline (2026-10-13) | Detected code/dependency surfaces |
|---|---|---|---|
| [`ARYDESTROYER/Kavach-AgenticSOC`](https://github.com/ARYDESTROYER/Kavach-AgenticSOC) | `Testing` | `db8d9357e4300763be9b558d073fb23b3d7702bd` | Python and TypeScript/JavaScript; `backend/`, `webui/`, `updater/`; Python requirements, npm lockfile, and shipping Dockerfiles |
| [`combustrrr/code-analysis-dashboard`](https://github.com/combustrrr/code-analysis-dashboard) | `main` | `239ef8627b99a49768900cf9cc0195d5cbb16068` | Python and TypeScript/JavaScript; `scripts/code_analysis/`, `analysis-ui/`; `.ci/requirements.txt` and `analysis-ui/package-lock.json`; its only Dockerfile is a scanner canary fixture |
| [`combustrrr/Agentic-Kibana`](https://github.com/combustrrr/Agentic-Kibana) | `Testing` | Not inventoried in this baseline | Python and TypeScript/JavaScript; `backend/`, `webui/`; backend and web UI dependency manifests |

The branch names move. Each request resolves and records the actual full source SHA;
the table SHAs are reproducibility anchors for the read-only repository inventory, not
permanent branch pins. GitHub tree/language/branch metadata was read with GET-only API
calls. No scanner run, workflow dispatch, clone on the operator machine, push, or target
repository write was performed as part of this implementation.

## Run an analysis

1. Open the deployed dashboard and sign in with an authorized collaborator account.
2. Open **Projects** and choose one of the configured source targets. Selection opens its
   current report and is read-only; it does not submit a workflow or change configuration.
3. Users with write access to the fixed execution repository may separately choose
   **Run analysis**. Read-only collaborators can inspect existing reports without write
   access; repository administration is required to change the trusted project registry.
4. Choose the target's configured branch (`Testing` for Kavach and Agentic-Kibana,
   `main` for dashboard self-analysis), an open pull request, or a full 40-character
   commit SHA. Choose the scanner channels; the common portable baseline is preselected
   and vendor lanes are opt-in. CodeRabbit review is available only for an open PR.
5. Review the resolved full SHA, original selection, PR fork/head/base provenance, exact
   selected channels, cache/reuse state, readiness, and usage caveat. Confirm explicitly
   to create work. A 202/queued response means only accepted/queued. If a branch or PR
   changes after preview, refresh the preview; accepted work remains pinned to its SHA.
6. Follow FIFO queue position and per-channel progress. Only one source-revision request
   is active globally; selected lanes for that SHA may run concurrently. Scheduled
   reconciliation recovers durable accepted requests only and never starts scans from
   discovered refs. Refreshing the UI is read-only.
7. Inspect the current source-only report and any separate current PR overlay. Source-only
   identity uses configured project/repository, SHA, tooling, and profile; overlay identity
   uses project, PR, head repository/SHA, base SHA, tooling, and profile. Matching channel
   evidence is reused unless **Run again** is selected. A same-SHA success replaces only
   its selected channels; a different SHA replaces the one current report only after its
   first valid channel result. Check source SHA, channel status, workflow run/attempt,
   tooling, and explicit unavailable/deferred/not-applicable status before interpreting
   finding counts.

There is no Evaluation Mode SHA or dispatch budget. This local implementation does not
deploy the Worker, report reader, UI, or workflows and does not trigger a live scan.

## Source and write boundaries

- Scanner jobs run in isolated GitHub Actions workers against the selected immutable
  SHA. `actions/checkout` creates a temporary read-only checkout inside the worker;
  there is no operator-machine clone and checkout credentials are not persisted.
- Source-executing jobs have `contents: read` only. They receive no GitHub write token,
  scanner vendor token, or report-publication credentials. A credentialless checkout
  produces a one-day pinned source snapshot for the isolated vendor workflow; its
  credential-bearing jobs cannot check out the repository or run project-controlled
  setup/test commands. Missing credentials/entitlements remain explicit
  incomplete evidence.
- Native feedback is disabled for observer and connected self-analysis targets alike.
  Source-executing jobs receive no publication credentials and do not create checks,
  upload SARIF, push commits, alter branches/tags, edit files, or create/update pull
  requests. Reports are stored only in the service control plane.
- The dashboard repository is also the execution/control-plane repository. Its Actions
  run metadata and bounded analysis-request Release state are service-control writes;
  they do not alter the scanned source tree. The service also writes report data to its
  configured storage. Those service-side writes are necessary for queueing and delivery
  and are distinct from writes to analyzed source code.
- No branch protection is bypassed. The central App is installed only on the fixed
  execution host. Users do not install it on source repositories or add arbitrary
  repositories through the dashboard.

## Scanner coverage

The project profile selects the configured scanner stack for each source and requires
every known channel to be enabled or explicitly deferred. Portable channels are
preselected for a run; configured vendor lanes (including Snyk and Sonar) require an
explicit opt-in and use the pinned source repository/commit with trusted settings.
CodeRabbit is an optional PR-only advisory lane; its evidence is retained in a distinct
PR overlay, not merged into the source-only report. The dashboard-source profile
explicitly defers container-image/SBOM channels (there is no shipping image),
Schemathesis (there is no application API contract), and Hadolint (its only Dockerfile
is a scanner fixture). The Kavach product profile retains its Python/API/web/image-
specific adapters. Unsupported integrations remain explicitly deferred/unavailable,
not clean zeroes.

An analysis can publish a valid partial report while some channels are unavailable.
Known limitations include vendor access/plan entitlement and GitHub security-posture
permissions. Scanner counts are evidence from that exact run and revision; absence of
findings from an unavailable, failed, or deferred channel is not a clean result.

## Result and state storage

| Data | Storage | Retention/behavior |
|---|---|---|
| Current report manifest and compressed report shards | Cloudflare R2, under repository-qualified `repositories/<owner>/<repo>/...` keys | Current report is served through the authenticated Worker API; the Pages UI contains no report data |
| Current PR overlay manifest entry and compressed overlay shard | Same current-report release and R2 namespace; separately referenced by the v1 manifest | One overlay is retained; its asset is never merged into the source-only report and is fetched only when referenced |
| Temporary producer handoff artifacts, when R2 handoff is enabled | Cloudflare R2 `temp-runs/<workflow_run_id>/<attempt>/...` | One-day lifecycle; artifacts are validated against source SHA, target, run, attempt, and tooling provenance before publication |
| Scanner job output | GitHub Actions artifacts | Workflow artifact retention is bounded (currently 7 days); these are producer evidence, not the current report store |
| Request queue and compatibility/control state | GitHub Release assets and Cloudflare KV | Bounded service state; do not edit or delete manually while requests are active |
| Dashboard application | GitHub Pages | UI bundle only; rebuilding Pages does not rescan or publish reports |

The selected project's report and optional overlay are read from the Worker/API by the
UI. Preserve workflow run and attempt when investigating producer artifacts. A published
report does not imply that every configured scanner completed; use the requested-channel
inventory, per-channel status, and selected coverage for completeness. `NOT_SELECTED`,
`NOT_APPLICABLE`, `DEFERRED`, and execution failure are different states. GitHub Actions
artifacts in the public service repository remain accessible outside the dashboard;
authentication does not make those scanner artifacts confidential.
