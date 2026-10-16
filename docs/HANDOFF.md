# New-chat handoff: Code Analysis Dashboard

Last verified deployed baseline: 2026-10-14, main commit
`216393820ab8ca05c4729115ceb98dfec1d7ce0e0`. Worker version
`63068c97-2f88-4121-8539-d97ff0729a19` is live with the fixed-host dashboard access
configuration. This is the service handoff; read it
before AGENTS.md, README.md and the current architecture guide. Old session documents
are historical evidence, not instructions to restore old hosting. The configured-source
project implementation is currently local and not deployed; do not assume the live
Worker, Pages UI, or workflows provide its manual FIFO/channel/overlay behavior yet.

## Repository and deployment boundaries

- Service implementation, Actions, current-report Releases and App installation:
  `combustrrr/code-analysis-dashboard` (main).
- Read-only sources: `ARYDESTROYER/Kavach-AgenticSOC` (project `1267340546`)
  and `combustrrr/Agentic-Kibana` (project `1278177697`). Both prefer Testing.
- Connected self-analysis: `combustrrr/code-analysis-dashboard` (project
  `1360051890`, main). Native feedback is disabled for all three configured targets;
  trusted publication stores reports only in service-managed storage.
- Parking-lot monitoring was removed. Do not restore it or install analysis in the
  product fork. No writes to upstream are authorized.
- Website: https://combustrrr.github.io/code-analysis-dashboard/
- Worker: https://code-analysis-launcher.icsarthak9.workers.dev
- Pages deployment is triggered by the main branch workflow. Pages run
  `38598467689` deployed commit `216393820ab8ca05c4729115ceb98dfec1d7ce0e0`.
  The workflow artifact and live site both reference `assets/index-Dl9P-4d-.js` and
  `assets/index-D9a50ibX.css`. Worker version
  `63068c97-2f88-4121-8539-d97ff0729a19` is active. Live `/api/public/config` reports
  `require_login=true` and `require_report_login=true`; anonymous `/api/projects`,
  `/api/public/projects`, and `/api/public/manifest` requests returned `401`.

## 2026-10-14 project profile validation fix

Worker version `63068c97-2f88-4121-8539-d97ff0729a19` is deployed at 100% traffic.
It validates portable profiles with the portable policy while continuing to accept
the trusted legacy scanner profiles in the two observer projects. The production
public config still requires login; anonymous `/api/projects` returned `401`.
Launcher tests (80), analysis service unit tests (67), deployment tests (13), and
the workflow audit passed before deployment. An authenticated production registry
read was not run because no signed-in browser session was available.

## What is implemented

The local source implements an Ant Design application with light/dark themes, current
source/target/revision provenance, overview charts, issues, scanners, connections and a
fixed-host project catalog. Its repository-mode flow is: sign in, choose one of the three
trusted projects, inspect its current report, then (with execution-host write access)
choose a branch, open PR, or full SHA, review the resolved SHA and selected scanner
channels, and explicitly confirm. Project selection, inventory, and preview are read-only.
Per-user execution-host selection, generic repository discovery, source setup and
folder-mapping commits are not part of this flow.
Project profiles are changed through the trusted versioned registry by an administrator.
Threat Reports add deterministic JSON/Markdown/PDF exports, severity-aware UI,
raw/normalized channel coverage, finding provenance, and explicit limitations.
Dashboard refresh is read-only; analysis starts only after an explicit user action.

Issues combines text, severity, scanner, rule, file, directory, source-location and
scanner-overlap filters. Clear filters and overview shortcuts reset unrelated
filters. Group by rule/scanner/file/directory; inspect immutable source links,
explanation and supporting observations. Related findings are not proven root causes.
Connections uses `/api/project-integration` and `/api/project-readiness` for the selected
project and verifies source identity and both execution workflows. `/api/projects` reads
the three-entry registry using a centrally installed, repository-scoped App token.

The Worker requires GitHub login and current collaborator membership in the fixed
execution repository for dashboard/API viewing. Public repo read permission alone does
not qualify. Collaborators with `pull` can browse reports; `push` is required to launch;
`admin` is required for configuration changes. Report assets are delivered through the
Worker/R2 path and access gating is an application boundary, not a substitute for
confidential storage guarantees.

## Execution and storage

Trusted profiles: `.github/code-analysis/projects.json` on execution default branch.
The local source accepts only explicit `analysis-request-v2` intents from the bounded
FIFO (maximum 100), processes one source revision globally, and sequences selected
producer lanes for that pinned SHA. Scheduled reconciliation is recovery-only and never
creates scans from branch/PR discovery. A 202 means accepted/queued. Exact source
checkout, request, tooling/profile, workflow run, and attempt provenance prevent
mixed-revision publication. Keep one current source-only report per configured project;
retain one PR-context overlay separately, keyed by project, PR, head repository/SHA, base
SHA, tooling and profile. A successful source-only report that advances to another SHA
retires an incompatible older overlay; queued/failed source attempts do not. Matching per-channel evidence is reused unless Run again is
explicitly selected. Same-SHA publication replaces only successful selected channels;
`NOT_SELECTED`, `NOT_APPLICABLE`, `DEFERRED`, and failures remain distinct. Keep the
previous source report while queued/running and on failure before valid new evidence.
R2 holds manifests and content-addressed compressed report/overlay shards; `temp-runs/`
holds ephemeral producer artifacts and expires after one day. UI builds contain no
reports. Superseded assets are removed only after the replacement manifest is committed.
GitHub Actions artifacts in the public service repository remain publicly accessible;
dashboard authentication does not make them confidential.

## Scanner maintenance and limitations

SCANNER_UPDATE_TOKEN is configured and working (run `34627221312`). Daily Renovate
proposes stable pinned updates; only eligible canary-covered patch families auto-merge.
Other updates need review. `15-tooling-rollout.yml` validates trusted main and proposes
an exact three-file immutable pin PR, then merges after required checks/protections.
PR #16 proved automatic adoption; current verified tooling pin is
`7cc92da3ecb6229359e364d163d42a70c305c096`. Read the live profile before using this
pin later. New connections use the adopted profile pin; external installations retain
their own reviewed pins. No promise of untested immediate latest-version execution.

Last inspected Kavach producer `34630716336` used that pin. Sonar job
`103366661860` reached the access probe and reported `branch_entitlement`:
organization denies non-main-branch data. The missing sonar-project.properties
integration defect was repaired. Upstream repository-security posture remains
permission-limited; SECURITY_POSTURE_TOKEN is not provisioned. Never mark these
channels completed or treat unavailable counts as zero. Workflow success alone is
not evidence of scanner completion. Inspect the newest Release manifest before
claiming a latest report or finding count; that producer's final publication was not
reverified in the UI repair session.

## Verification and next work

Historical PR #17 validation: 59 service tests, 31 launcher tests and workflow policy
passed. Retained
21,189-finding browser coverage includes provenance, grouping, charts, filters,
mobile navigation, themes, launch tracking and configuration confirmation. Repeated
repository recovery checks passed after stable accessible loading labels were added.
Production-mode login/logout/revocation browser test passed. The fixed-host dashboard
change passed 78 launcher tests, 13 deployment tests, service unit tests, workflow audit,
UI build, 22 fixture browser tests, and all 11 repository-mode OAuth/access browser
tests locally. It is deployed by Pages run `38598467689`; the live asset fingerprints
match that run's build log. Anonymous project/report API denial and the deployed Worker
version/configuration were rechecked after rollout. No authenticated production launch
or scanner dispatch was performed.

Owner login is confirmed; another accepted collaborator's live sign-in is deferred
by the owner. No need to request it repeatedly. Outstanding external exceptions:
Sonar branch entitlement and upstream posture access. Do not buy plans or modify
upstream. The dashboard does not offer arbitrary repository onboarding or per-user App
installation. Project access is limited to the fixed host and its validated registry.

Next chat: distinguish the deployed baseline from the un-deployed configured-source
implementation in the working tree. Before cutover, run the full service, launcher,
workflow-audit, deployment, and UI checks; then verify prerequisites and obtain separate
authorization for any deployment. Preserve unrelated local edits, never log secrets,
and record material operational changes in the relevant current/operations documentation.
See README.md for validation commands and docs/README.md for guides.

## 2026-09-12 free-service operations update

Workers Logs is configured for sanitized API errors and 5% of successful API requests.
Automatic invocation logs and traces are disabled; OAuth callbacks are excluded.
Responses carry an opaque X-Request-ID. Existing auth and GitHub storage are unchanged.
See [free-service decisions](operations/FREE_SERVICES.md) for quotas, operational steps and OSS
programs assessed. No paid plans, credit programs or third-party accounts activated.

## 2026-09-12 synchronization and branch cleanup

Fork Testing and upstream remain read-only observer boundaries. The service owns its
execution, report publication, and deployment workflows.

## Final cleanup checkpoint (2026-09-12)

Product synchronization CI 34635362172 and documentation CI 34635362297 both passed.
Dashboard reconciliation 34635758316 succeeded; this is discovery/publication
orchestration evidence, not proof every latest scanner completed. Cloudflare API
version fa8abdc1-4941-4626-9595-5ce8b7b33480 includes sanitized diagnostics and live
request correlation, with anonymous requests still denied. The implementation and
synchronization records are committed to service main and fork Testing.

Obsolete local publication clones/worktrees, scanner downloads, verification logs,
generated builds/test outputs and caches were removed. Active service dependencies
and retained browser-test data remain. Do not look for new implementation inside
product-side temporary directories. Tests can regenerate build outputs as needed.

Remaining: Sonar OSS branch entitlement, upstream posture permissions, exact latest
report/channel verification, and review of open scanner updates. Another accepted
collaborator live login stays deferred. Triage/suppression, SLA tracking, DAST/mobile
adapters and unrestricted external-owner onboarding are roadmap items, not implemented
or live-proven. No paid plan or upstream write is authorized.

## 2026-10-13 repository journey release

Main commit `5b07952` deployed to Pages in workflow run `38441170421`; the matching
Worker API was deployed as `b990585d-1412-4a8c-8c43-8abb0e096577`. Public Pages and
the unauthenticated Worker boundary were smoke-tested. Fixture Playwright coverage
passed 24 tests (5 access tests are excluded in the default fixture build); the separate
access-enabled suite passed all 5, including a mocked login-to-published-report path.
No authenticated production launch or scanner dispatch was performed, so this is not
live end-to-end scan/publication evidence.
