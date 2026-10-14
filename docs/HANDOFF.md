# New-chat handoff: Code Analysis Dashboard

Verified implementation baseline: 2026-10-13, main commit `5b07952`. Worker version
`b990585d-1412-4a8c-8c43-8abb0e096577` contains the current deployed repository-setup
profile mapping. This is the service handoff; read it
before AGENTS.md, README.md and the current architecture guide. Old session documents
are historical evidence, not instructions to restore old hosting.

## Repository and deployment boundaries

- Service implementation, Actions, current-report Releases and App installation:
  `combustrrr/code-analysis-dashboard` (main).
- Read-only sources: `ARYDESTROYER/Kavach-AgenticSOC` (project `1267340546`)
  and `combustrrr/Agentic-Kibana` (project `1278177697`). Both prefer Testing.
- Connected self-analysis: `combustrrr/code-analysis-dashboard` (project
  `1360051890`, main). Only this relationship can publish native findings to itself.
- Parking-lot monitoring was removed. Do not restore it or install analysis in the
  product fork. No writes to upstream are authorized.
- Website: https://combustrrr.github.io/code-analysis-dashboard/
- Worker: https://code-analysis-launcher.icsarthak9.workers.dev
- Pages deployment is triggered by the main branch workflow. Pages run `38441170421`
  deployed commit `5b07952`; Worker version `ec340878-82e9-44c7-8105-d4053f677241`
  is deployed with the Pages base-path redirect fix. The current fixed-host plan work
  in this working tree has not been committed or deployed.

## What is implemented

The current source implements an Ant Design application with light/dark themes, current
source/target/revision provenance, overview charts, issues, scanners, connections and a
fixed-host project catalog. Primary repository-mode flow: sign in, choose one of the
three trusted projects, inspect its current report, then (with execution-host write
access) explicitly choose a branch/PR/full SHA and submit once. Project selection itself
is read-only and never dispatches a workflow. Per-user execution-host selection, generic
repository discovery, source setup and folder-mapping commits are not part of this flow.
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
Hourly reconciliation and manual requests use the same bounded queue (two analyses).
Exact source checkout and producer IDs/attempts prevent mixed-revision publication.
One current report per active branch/open PR plus one bounded manual selection per
project. Keep previous SHA visibly while replacements run; a valid partial replaces
old findings without borrowing evidence. R2 holds current manifests and compressed
report shards; `temp-runs/` holds ephemeral producer artifacts and expires after one
day. Releases still hold queue/compatibility state where required. UI builds contain
no reports. Publication does not rebuild UI or rescan. Per-project default report
budget is 900,000,000 bytes; compressed shards are bounded at 100 MB. Capacity errors
preserve prior valid data; cleanup follows successful manifest publication.

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
Production-mode login/logout/revocation browser test passed. The current plan change
has passed 78 launcher tests, 13 deployment tests, service unit tests, workflow audit,
UI build, 22 fixture browser tests, and all 11 repository-mode OAuth/access browser
tests locally. It has not been deployed, so the previous live anonymous smoke applies
only to the deployed code, not these uncommitted changes.

Owner login is confirmed; another accepted collaborator's live sign-in is deferred
by the owner. No need to request it repeatedly. Outstanding external exceptions:
Sonar branch entitlement and upstream posture access. Do not buy plans or modify
upstream. The dashboard does not offer arbitrary repository onboarding or per-user App
installation. Project access is limited to the fixed host and its validated registry.

Next chat: read live profile/run/Release state, keep named scanner limitations honest,
and implement new requested work only in the service unless product work is explicit.
Preserve unrelated local edits, never log secrets, and record material operational
changes in the relevant current/operations documentation.
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
