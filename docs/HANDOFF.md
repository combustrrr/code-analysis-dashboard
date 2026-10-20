# New-chat handoff: Code Analysis Dashboard

## 2026-10-20 Projects and evidence workspace redesign

The worktree makes Projects the only signed-in home and removes the Activity route,
component, navigation entry, and `/api/dashboard` endpoint. `GET /api/projects` now
returns the workspace refresh time, four-state lifecycle aggregates, active-analysis
identity, current-report freshness/SHA, channel totals, limitations, and sanitized
attention guidance. The landing, shell, Projects register, and project revision context
use the locally bundled Manrope, Sora, and IBM Plex Mono fonts with the calm dark/light
evidence palette. Project CTAs are Review evidence, Run analysis, or View progress.
This is repository state only; no production deployment was performed.

## 2026-10-20 concurrent analysis implementation

The worktree replaces the global FIFO with `analysis-request-v4` project/SHA records.
Accepted analyses wake immediately, unrelated projects and revisions can run in parallel,
active duplicates merge missing channels, and Run again is rejected while matching work is
active. Channel claims retain generation/token fencing and heartbeat recovery. Publication
is serialized per project and rechecks newest-accepted status before writing. The public
lifecycle is Preparing, Analyzing, Ready, or Needs attention. This is repository state only;
production cutover still requires paused admission, v3 reset verification, deployment, and
live concurrent checks.

## 2026-10-20 production execution-backbone reset

The v3 queue/workflow contract is live. Worker version
`d14b8468-5bc7-4c9c-b08d-eae0f9881378` is active. Protected cutover runs paused
admission (`39373080533`), advanced the queue to generation 2 and reset reports
(`39373121443`), then resumed admission (`39373556150`). Two retained requests were
marked cancelled and 201 current-report objects under the execution repository's exact
R2 prefix were deleted. GitHub Actions artifacts were not deleted and remain public
until their existing retention expires.

Promotion PR #77 pinned tooling
`07d757c6a3c7d08a90130a5b93434269e02af314`. Commissioning enqueue run
`39373589327` admitted all three configured preferred branches. First coordinator run
`39373608117` successfully claimed and fenced sequence 1; at this handoff its scanner
lanes were still running and sequences 2-3 remained durable. Verify their eventual
publication before describing all three new reports as commissioned.

## 2026-10-20 execution-backbone replacement implementation

The deployed source contains the `analysis-request-v3` queue
contract. It adds Durable Object admission pause/reset, generation plus lease-token
fencing, heartbeat renewal, stale finalizer rejection, and a best-effort GitHub Actions
wake after the queue commit. The coordinator validates request/SHA wake hints against
the FIFO claim. Workflow 11 is generated as non-dispatchable `workflow_call`; workflow
12 remains manual diagnostics; vendor and source producers begin independently. The
dormant privileged `reusable-reconcile.yml` was removed after confirming that the
checked-in coordinator graph had no caller.

Future schema changes must still deploy both sides together. Existing public Actions
artifacts were intentionally not deleted and remain public until their seven-day
retention expires.

## 2026-10-19 production browser-recording follow-up

The authenticated production recording confirmed that GitHub sign-in, project access,
report APIs, issues, scanners, and immutable source links were working. It also exposed
a frontend performance defect: Threat Report attempted to mount every retained finding
card in one render (36,466 for the recorded Kavach report), leaving the loading screen
visible while the browser main thread was blocked. Threat findings are now paginated at
25 cards per page, JSON serialization happens only when requested for download, and the
JSON report can render without waiting for the Markdown export. Normal route changes no
longer invalidate verified report caches, and the header/project catalog share an
in-flight project-registry read for the current in-memory session.

Local validation passed: 71 service tests, 14 deployment tests, 14 launcher tests,
workflow audit, production UI build, and 18 active fixture browser tests (18 historical
fixtures skipped). The browser suite includes a new large-threat-report regression.
Phase 2 Pages run `39285623937` and Worker run `39285623900` subsequently completed
successfully. Follow-up Pages run `39296740277` deployed commit
`29b4be4aff2ef5250947ef18bece1a832c031404`; live HTML and JavaScript asset
`assets/index-tVn_UYiM.js` returned `200` and matched the deployment artifact. Public
configuration still requires login for both workspace and reports, and anonymous
project access returned `403`. A fresh authenticated recording of the 36,466-finding
production report remains the final browser-level confirmation.

## 2026-10-19 Phase 2 production rollout

Phase 2 frontend IA commit `1a4cae5f764b0174db1293fc109300475da95fb3`
was pushed to `main`. The Worker was deployed directly with authenticated Wrangler
after local validation because GitHub Actions was degraded; Worker version
`ac0979ea-42cc-4d4e-b29c-e81929eab5ec` is active. Live public configuration returned
`200`, while anonymous project access returned `403`, as required.

Canonical Worker run `39285623900` and Pages run `39285623937` were still queued with
zero runner time during the GitHub Actions and Pages incident. The public site therefore
still served its preceding asset at the last check. Do not call the Phase 2 frontend
deployed until Pages run `39285623937` succeeds and the live asset is verified. No new
production scan was admitted: the launch API correctly rejected a GitHub CLI token as
an invalid application session, and source analysis must continue to enter through the
signed-in application and durable FIFO rather than a direct workflow dispatch.

## 2026-10-19 configured-source production verification

The configured-source rollout is live. Pages run `39239386083` deployed commit
`26e638370b522dc302885ebf06b5745f4bb74a5a`; Worker version
`40f08c18-238d-43fb-966c-4774bbe14134` is active and anonymous project/report probes
return `403`. The adopted tooling revision for the production scans was
`b305d1ec43b3f5221ca83833c9731586633d7b75`.

Three explicit immutable requests were exercised through the global FIFO. Kavach
request `7d6cfa9e-0aba-46ce-80ca-b9aa2e82294b` analyzed
`db8d9357e4300763be9b558d073fb23b3d7702bd` in run `39246779470`; Agentic-Kibana
request `b3d41631-f1bd-4311-a7cd-f68b1e7ba9f0` analyzed
`22d4d2c3b3bbac3fe3ddd22e6b78fe6606aa1971` in run `39250128961`; service self-analysis
request `f9fb968e-b2f3-4606-a683-43696c1df860` analyzed
`22266097c8c84ce8540aa7ac5c3ee319b38fe18e` in run `39252123413`. Reconciliation
runs `39248673557`, `39251831440`, and `39253614443` published a current report for
each project with no publication errors. Kavach and Agentic-Kibana explicitly retain a
failed Schemathesis channel; self-analysis explicitly retains a failed OSV channel.
Healthy sibling evidence was preserved in every case.

Production exposed two follow-up defects. A terminal partial publication could retain
its FIFO request asset when inventory no longer contained the request-owned target row;
the three exact terminal assets were manually removed only after publication was
verified. The reconciler now recovers terminal ownership from the matching request
receipt plus exact published run/attempt before advancing. Portable OSV also attempted
to write its SARIF file before creating the nested output directory; the generated
workflow now creates that directory first. Do not describe the failed channels as
completed until a later explicit rerun publishes valid evidence.

Latest verified deployment: 2026-10-16, main commit
`5fac872f0b30fe1f116185793a8ffe0846b6304a`, Pages run `38889165977`. The active Worker
version is `35e6c6a4-097c-40a9-8c48-456092987be8`. This is the service handoff; read it
before AGENTS.md, README.md and the current architecture guide. Old session documents
are historical evidence, not instructions to restore old hosting.

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
- Pages deployment is triggered by the main branch workflow. Run `38889165977` deployed
  commit `5fac872f0b30fe1f116185793a8ffe0846b6304a`; live HTML references
  `assets/index-DBJkr9AJ.js` and `assets/index-DnQgVVvr.css`, both verified `200`.
  Worker version `35e6c6a4-097c-40a9-8c48-456092987be8` is active. Live
  `/api/public/config` reports `require_login=true` and `require_report_login=true`;
  anonymous project/report API requests returned `403`.

## 2026-10-16 configured-source rollout

Backend/workflow commit `1675f105af2b82cf0181b81aa627eb1e60c54e60` was pushed first; its
required `Scanner compatibility` check was then run on that exact SHA and passed. The
normal push response reported that GitHub had bypassed the expected check before that
manual run. UI/docs PR #45 passed the required check and merged as
`5fac872f0b30fe1f116185793a8ffe0846b6304a`; Worker deployment preceded Pages run
`38889165977`. No production source-analysis scan was triggered.

## 2026-10-14 project profile validation fix

Worker version `63068c97-2f88-4121-8539-d97ff0729a19` is deployed at 100% traffic.
It validates portable profiles with the portable policy while continuing to accept
the trusted legacy scanner profiles in the two observer projects. The production
public config still requires login; anonymous `/api/projects` returned `401`.
Launcher tests (80), analysis service unit tests (67), deployment tests (13), and
the workflow audit passed before deployment. An authenticated production registry
read was not run because no signed-in browser session was available.

## What is implemented

The deployed source implements an Ant Design application with light/dark themes, current
source/target/revision provenance, overview charts, issues, scanners, connections and a
fixed-host project catalog. Its repository-mode flow is: sign in, choose one of the three
trusted projects, inspect its current report, then (with current collaborator access)
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
not qualify. Collaborators with `pull` can browse reports and explicitly launch analysis;
`admin` is required for configuration changes. Report assets are delivered through the
Worker/R2 path and access gating is an application boundary, not a substitute for
confidential storage guarantees.

## Execution and storage

Trusted profiles: `.github/code-analysis/projects.json` on execution default branch.
The deployed source accepts only explicit `analysis-request-v2` intents from the bounded
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

Next chat: use the deployed configured-source implementation as the current baseline.
Preserve unrelated local edits, never log secrets, and record material operational
changes in the relevant current/operations documentation. No live source scan was run
during this rollout; scanner completion must be verified from its own report evidence.
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

## 2026-10-19 Phase 1 read-only cutover preparation

The retired Release queue contains no active `request-*.json` assets; retained assets are
explicitly named `superseded-request-*`. A `production` GitHub Environment restricted
to the `main` branch and the non-secret `WORKER_URL` repository variable were created.
The `CLOUDFLARE_ACCOUNT_ID` Environment secret is configured, but the least-privilege
`CLOUDFLARE_API_TOKEN` is not, so the Phase 1 Worker/coordinator cutover has deliberately
not been deployed. Do not publish the matching Pages change or enable Durable Object
queue admission until those two deployment prerequisites exist and the Worker deploy
workflow passes.

The Phase 1 service now has one supported runtime architecture. The Worker routes only
to the fixed repository service, `/webhook` and direct workflow-dispatch launcher routes
are absent, and `code-analysis-coordinator.yml` is the only automatic orchestration entry
point. The old discovery/source/reconcile workflows were removed rather than retained as
compatibility shims. The sole production runtime consumes the already-provisioned
central App credentials through Cloudflare's encrypted `GITHUB_CLIENT_SECRET` and
`GITHUB_APP_PRIVATE_KEY` bindings; the values are never exposed or copied. The
transitional `NEXT_*` bindings were retired after the current private key was provisioned.

## 2026-10-13 repository journey release

Main commit `5b07952` deployed to Pages in workflow run `38441170421`; the matching
Worker API was deployed as `b990585d-1412-4a8c-8c43-8abb0e096577`. Public Pages and
the unauthenticated Worker boundary were smoke-tested. Fixture Playwright coverage
passed 24 tests (5 access tests are excluded in the default fixture build); the separate
access-enabled suite passed all 5, including a mocked login-to-published-report path.
No authenticated production launch or scanner dispatch was performed, so this is not
live end-to-end scan/publication evidence.

## 2026-10-20 PDF export deployment and production scan batch

Main commit `6872a24b0a27bd70da9a07ac6118b9e6d08fe40a` was deployed to GitHub
Pages by workflow run `39380331836`. The public site and its fingerprinted JavaScript
asset returned HTTP 200, and the deployed bundle contains the generated PDF export
action (`Download filtered PDF`) rather than the retired print/save action. This was a
frontend-only release, so no Worker deployment was required; the live Worker remained
in repository mode with login and report-login enforcement enabled and queue admission
open.

Preferred-branch batch run `39380456086` admitted three immutable requests. Existing
FIFO requests were allowed to finish first; no queue state was reset or bypassed.
Production coordinator evidence for the fresh requests is:

- Kavach request `bce75485-ade9-4a97-a7c8-6ddaa15b3cd1`, source
  `ARYDESTROYER/Kavach-AgenticSOC@db8d9357e4300763be9b558d073fb23b3d7702bd`,
  coordinator run `39382345704`: report publication and terminal queue completion
  succeeded; Schemathesis was the only failed scanner channel.
- Agentic-Kibana request `eb58a322-5fe6-48ad-a277-479c0780374e`, source
  `combustrrr/Agentic-Kibana@22d4d2c3b3bbac3fe3ddd22e6b78fe6606aa1971`,
  coordinator run `39384177466`: report publication and terminal queue completion
  succeeded; Schemathesis was the only failed scanner channel.
- Dashboard request `0e262070-7a8b-419a-a01c-926db67dcd9e`, source
  `combustrrr/code-analysis-dashboard@6872a24b0a27bd70da9a07ac6118b9e6d08fe40a`,
  coordinator run `39385331702`: all applicable portable scanner channels, report
  publication, and terminal queue completion succeeded.

All three requests retained their exact source revision, request ID, coordinator run,
attempt, and configured tooling provenance. A red coordinator conclusion for either
configured-source run reflects the explicit Schemathesis failure; it does not invalidate
or erase the successfully published sibling scanner evidence.

## 2026-10-20 concurrent-analysis and evidence-workspace cutover

Commit `03bcbff06e3174d75401170ec630b789fbf00a91` replaced the global FIFO
with project/SHA-scoped v4 analysis records and deployed the evidence-first Projects
workspace. Worker run `39403450257` deployed version
`4f5506f1-3a2b-4e0e-a4a1-65fa5a5c946f`; Pages run `39403450221` deployed the
matching frontend. Admission was paused before migration, reset run `39403670012`
reported zero active v3 requests and removed 11 current-report objects, and resume run
`39403726075` confirmed `analysis-control-v4`, generation 3, and open admission.
Retained Actions artifacts were not deleted.

Preferred-branch batch run `39403769301` admitted three immutable analyses. Their
coordinator workflows claimed and scanned concurrently, with no application FIFO:

- Kavach request `d0123e9c-8b73-42c0-aeb2-9ce6dd94daf5`, source
  `ARYDESTROYER/Kavach-AgenticSOC@db8d9357e4300763be9b558d073fb23b3d7702bd`,
  coordinator run `39403805298`.
- Agentic-Kibana request `75f88dc7-c371-43ed-bcf2-9f27758a5b76`, source
  `combustrrr/Agentic-Kibana@22d4d2c3b3bbac3fe3ddd22e6b78fe6606aa1971`,
  coordinator run `39403808983`.
- Dashboard request `733c6536-e151-4c9c-912c-8a2bb561c9b1`, source
  `combustrrr/code-analysis-dashboard@ec88c8def1a8f9df6ac303d0145490aa6e475659`,
  coordinator run `39403812270`.

All three coordinator runs, report publications, and fenced terminal completions
succeeded. The live Pages document and fingerprinted JavaScript asset returned HTTP
200 and were visually reviewed at desktop width. The bundle contains the evidence
workspace thesis, `Review evidence`, and `How evidence is protected`, with no Activity
navigation. The Worker public config returned HTTP 200 with admission open; anonymous
`/api/projects` access correctly returned 403.

## 2026-10-20 evidence-workspace visual refinement

Commit `ed4a734f147156c62638e5c51609d051a88b105c` deployed the refined public
landing page, locally bundled Sora and Manrope typography, clearer institutional
co-branding, and the reset-notice lifecycle fix. Pages run `39409970355` completed
successfully. Worker run `39409970362` completed its validation and deployment gates
and published version `5d7a8d0d-4ca7-4e80-af62-64ab6fd7f61f`.

The live Pages document and fingerprinted JavaScript asset returned HTTP 200 and were
visually reviewed at desktop width. The deployed bundle contains `Know what was
scanned`, `Current project coverage`, and the revised sign-in recovery copy. It no
longer contains the old evidence-chain heading, generic GitHub sign-in error, or
`Analysis reset in progress`. The Worker public config reports generation 3 with
admission open and `reset_notice: null`; anonymous `/api/projects` access remains 403.

Commit `140e451cc9c0910605189e9110b2421f2226e8c2` corrected the public landing
page's light-theme contrast and deployed through Pages run `39410791048`. Production
browser verification confirmed the persisted light theme, dark readable hero copy,
darker teal emphasis, and white proof surfaces. The production build, UI unit tests,
and Playwright suite passed before deployment.

Commit `8272994e195ede6deff0842030b2799169e378ce` completed an interface
copywriting pass and deployed through Pages run `39411557310`. The public landing
page, access guidance, preferred-branch action, and Settings introduction now use
plain, grammatical, action-oriented language. The production bundle was checked for
the revised headline and workflow copy after the build, unit tests, and Playwright
suite passed.

Commit `e236d047729ba8a12f528f53176f9478736c3efb` unified typography across
the signed-in workspace and deployed through Pages run `39412248440`. Manrope now
covers interface copy and controls, Sora covers headings, and IBM Plex Mono is limited
to technical identifiers and numeric evidence. Computed fonts were verified in the
fixture-backed project workspace, and the production stylesheet was confirmed to
contain all three locally bundled families.
