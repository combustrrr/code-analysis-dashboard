# New-chat handoff: Code Analysis Dashboard

Verified implementation baseline: 2026-09-11, PR #17, commit
`479702f69c4ed28614b54e361f0c0b628b4fff99`. This is the service handoff; read it
before AGENTS.md, README.md and the current architecture guide. Journals and old
session documents are historical evidence, not instructions to restore old hosting.

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
- Pages deployment `34632779427` succeeded. Worker version
  `13dc3e20-4d86-4350-9167-4223ed24ad04` deployed.

## What is implemented

Ant Design application with light/dark themes, current source/target/revision
provenance, overview charts, issues, scanners, connections and repository setup.
Run analysis is a single form: select branch, PR or full 40-character SHA, then
Run analysis. Readiness expands optionally. Polling follows the request, exact
scanner run/attempt and publication; published output opens the selected target.

Issues combines text, severity, scanner, rule, file, directory, source-location and
scanner-overlap filters. Clear filters and overview shortcuts reset unrelated
filters. Group by rule/scanner/file/directory; inspect immutable source links,
explanation and supporting observations. Related findings are not proven root causes.
Connections uses `/api/project-integration` for the selected project, verifies App
access, source identity and both execution workflows. Repository forms gate edits
on admin permission, invalidate stale previews, and recover from failed requests.

The Worker requires GitHub login and accepted collaborator membership in the service
repository for dashboard/API viewing. Public repo read permission alone does not
qualify. Launch requires write access; configuration requires admin access and exact
preview confirmation. Reports are still publicly accessible through GitHub Releases;
this is application access control, not confidential storage.

## Execution and storage

Trusted profiles: `.github/code-analysis/projects.json` on execution default branch.
Hourly reconciliation and manual requests use the same bounded queue (two analyses).
Exact source checkout and producer IDs/attempts prevent mixed-revision publication.
One current report per active branch/open PR plus one bounded manual selection per
project. Keep previous SHA visibly while replacements run; a valid partial replaces
old findings without borrowing evidence. Releases hold state, requests and compressed
report shards. Artifacts are temporary seven-day handoff evidence. UI builds contain
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

PR #17: 59 service tests, 31 launcher tests and workflow policy passed. Retained
21,189-finding browser coverage includes provenance, grouping, charts, filters,
mobile navigation, themes, launch tracking and configuration confirmation. Repeated
repository recovery checks passed after stable accessible loading labels were added.
Production-mode login/logout/revocation browser test passed. Live anonymous smoke:
sign-in visible, project-integration HTTP 401. Both execution workflows active.

Owner login is confirmed; another accepted collaborator's live sign-in is deferred
by the owner. No need to request it repeatedly. Outstanding external exceptions:
Sonar branch entitlement and upstream posture access. Do not buy plans or modify
upstream. General repository onboarding exists and has mocked acceptance coverage;
independent installation by another owner is not live-proven and is outside current
Kavach-focused scope. Do not claim unrestricted self-service acceptance.

Next chat: read live profile/run/Release state, keep named scanner limitations honest,
and implement new requested work only in the service unless product work is explicit.
Preserve unrelated local edits, never log secrets, and journal work at start/end.
See README.md for validation commands and docs/code-analysis/README.md for guides.

## 2026-09-12 free-service operations update

Workers Logs is configured for sanitized API errors and 5% of successful API requests.
Automatic invocation logs and traces are disabled; OAuth callbacks are excluded.
Responses carry an opaque X-Request-ID. Existing auth and GitHub storage are unchanged.
See [free-service decisions](FREE_SERVICES.md) for quotas, operational steps and OSS
programs assessed. No paid plans, credit programs or third-party accounts activated.

## 2026-09-12 synchronization and branch cleanup

Fork Testing ccc711e3 includes upstream Testing 231bb41f; fork main already matched
upstream main. Source backend/webui match upstream, with independent fork docs/CI
and external analysis ownership preserved. Dashboard obsolete implementation branches
were removed after merge/tree verification; main and two open scanner-update PR
branches remain. Future merged PR branches are automatically deleted. See
[cleanup audit](BRANCH_CLEANUP_2026-09-12.md) for exact deleted refs and recovery proof.

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
collaborator live login stays deferred. No paid plan or upstream write is authorized.
