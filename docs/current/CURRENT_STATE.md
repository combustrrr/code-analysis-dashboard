# Current implementation state

## 2026-10-20 interface language review

The primary developer journey now uses consistent, plain-English terminology across
Projects, analysis configuration, progress, Issues, Report, authentication, and empty or
failure states. Scanner selection is described as choosing scanners rather than abstract
coverage, actions use direct verbs, and technical terms remain limited to revision and
evidence details where they are necessary.

## 2026-10-20 GitHub sign-in interaction

GitHub authentication now has one stable pending state across redirect preparation,
callback redemption, and session verification. All sign-in entry points lock while an
attempt is active, retain their width, show explicit progress, and suppress retry/error
controls until the attempt completes. This prevents duplicate redirects and the brief
unsigned landing-page flash previously visible after returning from GitHub.

## 2026-10-20 analysis journey simplification

The project workspace presents analysis as Choose, Analyze, and Review. Fast analysis is
the recommended one-click path; configured analysis keeps revision and coverage choices
available without exposing scanner implementation details by default. Progress remains
visible without blocking report review, detailed channel and GitHub Actions information
is collapsed under Technical details, and newly published results open automatically for
the project the user is currently viewing.

Configured analysis exposes only channels enabled for the selected project's reviewed
language and execution profile. Deferred global catalog entries such as Go, JVM, or Ruby
scanners do not appear for these Python and TypeScript projects; they remain internal
registry diagnostics and are never presented as runnable or successful evidence.

## 2026-10-20 approved OSS vendor defaults

Snyk and SonarQube Cloud are approved default lanes for all three configured public
repositories. Fast and operator preferred-branch analyses request them alongside the
credential-free defaults; vendor credentials remain confined to the isolated vendor
workflow and never accompany source-executing jobs. CodeRabbit remains PR-only because
its evidence is a review of an exact pull-request head/base boundary. The collector may
use the execution workflow's read-only GitHub token for public PR metadata when no
dedicated collector credential exists. A repository still requires an active CodeRabbit
installation/review before this channel can produce evidence.

## 2026-10-20 community scanner production verification

Production source run `39432996302` completed successfully and published immutable
dashboard evidence using tooling `7cc795e9554e225fd688dfb78319e41f19e5c016`.
Credentialless zizmor, njsscan, and TruffleHog lanes completed with read-only source
access; their retained observations were reconciled without exposing detected secret
values. The follow-up tooling change enables the already reviewed TypeScript adapters
for portable profiles and removes UTF-8 byte-order marks from three Python modules that
caused Radon parse failures. Repository security-posture evidence remains unavailable
until a dedicated read-only security API credential or equivalent GitHub App permission
is configured; it is not passed to source-executing jobs.

## 2026-10-20 Settings control-center deployment

Pages run `39415699309` deployed commit
`01436fda4ac2ee37ff4275b1641ab9e7fecb9e86`. The live application now uses the
institutional Trust Lab × Mphasis header lockup and the refactored read-only Settings
control center. Production asset checks and dark/light desktop/mobile rendering passed.
No Worker deployment or source analysis was part of this release.

## 2026-10-20 concurrent analysis implementation

The worktree implements `analysis-request-v4`: immediate dispatch, concurrent project and
revision execution, active project/SHA channel merging, independently fenced channel claims,
and per-project publication serialization with newest-accepted-wins protection. Queue positions
and the global FIFO are removed from the public contract. Production remains on the deployment
recorded below until the paused-admission cutover is completed.

## 2026-10-20 production execution-backbone cutover

The v3 execution backbone is deployed. Worker version
`d14b8468-5bc7-4c9c-b08d-eae0f9881378` was deployed before the protected reset.
Cutover runs `39373080533`, `39373121443`, and `39373556150` paused, reset, and
resumed production admission. Reset generation 2 cancelled two retained requests and
deleted 201 objects only from
`repositories/combustrrr/code-analysis-dashboard/`. Public GitHub Actions artifacts
were intentionally retained under their existing seven-day policy.

Tooling promotion PR #77 merged as `a67b581f507a2e74b69525b8847615af681b8d4a`
and pins tooling `07d757c6a3c7d08a90130a5b93434269e02af314`, which contains all
v3 queue/source/publication consumers. Pages run `39372919684` deployed the reset
notice UI from `a089ef6ff7c082a854bae92f7b411a9d60d49b63`. Commissioning enqueue run
`39373589327` admitted one immutable preferred-branch request for each configured
project. Coordinator run `39373608117` claimed FIFO sequence 1 with generation 2 and
successfully entered independent scanner execution; remaining requests stay durable
for subsequent coordinator claims.

## 2026-10-20 execution-backbone replacement implementation

The worktree implements the new queue boundary as `analysis-request-v3`. Durable
admission now supports explicit pause/resume, a destructive cutover reset that marks
old queued/running rows `cancelled_cutover`, monotonically advances the fencing
generation, issues an opaque lease token, renews leases through heartbeats, and rejects
stale completion. After durable commit the Worker best-effort dispatches the sole
coordinator with request/SHA hints; dispatch failure leaves scheduled recovery intact.
Generated workflow 11 is no longer manually dispatchable, workflow 12 remains
diagnostic-only, source and vendor producers no longer depend on one another, and the
unused privileged reconciliation workflow has been removed.

The production cutover evidence and commissioning status are recorded above. Older
production evidence below remains historical context rather than current state.

## 2026-10-19 production scan verification

The configured-source implementation was deployed and exercised for all three trusted
projects. Exact producer runs were Kavach `39246779470` at source
`db8d9357e4300763be9b558d073fb23b3d7702bd`, Agentic-Kibana `39250128961` at source
`22d4d2c3b3bbac3fe3ddd22e6b78fe6606aa1971`, and dashboard self-analysis
`39252123413` at source `22266097c8c84ce8540aa7ac5c3ee319b38fe18e`. All used tooling
`b305d1ec43b3f5221ca83833c9731586633d7b75`. Their exact reconciliation runs
`39248673557`, `39251831440`, and `39253614443` succeeded and published partial/current
reports without report errors. Schemathesis failed for the two agentic projects and OSV
failed for self-analysis; successful sibling evidence remained publishable and was not
erased.

The production queue needed exact manual retirement of each verified terminal request
asset because a partial publication could lose the request-owned target row during
inventory reconciliation. The local follow-up recovers terminal ownership only from a
matching durable receipt and exact published run/attempt. It also creates the portable
OSV nested SARIF directory before invoking the pinned action. Queue assets are now empty.

## Local post-rollout hardening (not deployed)

The current worktree closes configured-source follow-up gaps without changing the
same-tab sign-in boundary: all missing scanner lane groups for accepted project/SHA
analyses fan out concurrently, public responses use the four-state lifecycle without
queue position, and Python registry validation rejects native feedback for every target. Opt-in
vendor jobs consume a one-day source snapshot made by a separate credentialless
checkout job; credential-bearing jobs cannot check out source or run project-controlled
setup/test commands. These changes are locally validated only until a later authorized
deployment updates the verified versions below.

The latest verified Pages deployment is run `38889165977` for main commit
`5fac872f0b30fe1f116185793a8ffe0846b6304a`; live HTML references
`assets/index-DBJkr9AJ.js` and `assets/index-DnQgVVvr.css`, both verified `200`. The
active Worker is `35e6c6a4-097c-40a9-8c48-456092987be8`. Its public config requires login
for dashboard and report routes, and anonymous project/report API checks returned `403`.

The deployed source fixes execution, storage and publishing to
`combustrrr/code-analysis-dashboard` (ID `1360051890`). Its trusted registry contains
Kavach-AgenticSOC (`1267340546`), service self-analysis (`1360051890`), and
Agentic-Kibana (`1278177697`). Authorized collaborators can browse reports and explicitly
launch analysis; repository admin access is required to change the
versioned registry. Selecting a project does not trigger a workflow. The repository
setup, arbitrary execution-host selection, and per-user App installation screens are
removed from the repository-mode UI.

The deployed application has same-tab GitHub OAuth with PKCE and a one-time Durable
Object exchange, fixed-host project API validation, exact target identity checks,
separate viewer/write/admin enforcement, and visible-tab session rechecks. Source scans
still execute only in isolated GitHub Actions jobs; Cloudflare Workers do not execute
source code.

Reports remain in Cloudflare R2 and service state in KV. Public Actions artifacts are
not confidential merely because the dashboard is authenticated. The project currently
has no claim of private artifact handling.

Open exceptions remain Sonar non-main-branch entitlement and upstream repository-
security posture permissions. A successful advisory workflow is not a complete scanner
report. Another collaborator's live sign-in is not a verified deployment check; the
access behavior is covered by local browser/API tests.

Pages deployments are triggered from main. The previous 2026-10-14 rollout was run
`38598467689`; the older deployment used a Kavach Evaluation Mode target. The
2026-10-16 configured-source rollout removed the frozen SHA and dispatch budget.
Backend/workflow commit `1675f105af2b82cf0181b81aa627eb1e60c54e60` landed first; its
Scanner compatibility check was manually run on that exact SHA and passed after GitHub
reported an expected-check bypass on the normal push. UI/docs PR #45 passed the required
check and merged as `5fac872f0b30fe1f116185793a8ffe0846b6304a`; Worker deployment
preceded Pages run `38889165977`. No production source-analysis scan was triggered.

Operational safeguards: generated source and reusable workflows must be regenerated
from their scripts and kept in parity with checked-in outputs. Signed webhook replay
markers require KV, expire after 24 hours, and do not provide atomic concurrent
exclusion. Current report manifests fail closed when undated or older than the
configured freshness window (24 hours by default). UI GitHub links are restricted to
HTTPS GitHub hosts. Free-tier/provider quotas and entitlements remain shared or
unverified unless the handoff records current evidence.
Upstream synchronization inspection is not implemented: the configuration has no
upstream/target pair and the service has no non-mutating conflict-analysis boundary.

## Recent maintenance

The source-analysis pipeline now uses an immutable artifact-first workflow revision
(`df50ec7a8c40ea29818e65be5cc43ea0086ab5fb`). Source runs no longer cancel an
earlier explicit launch for the same target, scanner jobs publish GitHub artifacts
instead of attempting source-side R2 uploads, and the report job always assembles
`hosted-report-{workflow_run_id}-{run_attempt}` after identity validation. The
The local reconciler is triggered by source completion, scheduled recovery, or explicit
request handling. Only a durable accepted request may introduce scan work; scheduled
recovery does not discover refs and launch scans. Completed-run recovery is tied to
exact source SHA and canonical artifact name before report publication.

The legacy scanner workflow files had been serialized with `true:` instead of the
GitHub trigger key `'on':`, which made GitHub register push runs with zero jobs.
Those triggers are repaired and the workflow audit now rejects that serialization.
GitHub Pages was rebuilt from main commit `216393820ab8ca05c4729115ceb98dfec1d7ce0e0`
by workflow run `38598467689`. The live JavaScript/CSS asset fingerprints match the
build log and uploaded Pages artifact. At that rollout the Cloudflare Worker was version
`a56a008d-7de0-4d66-8717-b7b41aa6b53d`; its public configuration reported both login
requirements enabled and anonymous project/report API probes returned `401`.

The earlier repository workspace connected user-selected execution repositories to
source projects and offered an optional folder-mapping setup flow. That implementation
is superseded by the deployed fixed-host target registry and read-only viewer flow. No
authenticated production launch or live scanner request was performed as part of this
deployment verification.

Portable-profile detection and validation were moved into the dedicated
`analysis-launcher/profile-policy.mjs` module; the former duplicate inline policy and
dead code were removed from the application module. The UI lockfile now resolves the
transitive `source-map-js` dependency to `1.2.2` as the dependency-vulnerability
remediation. This records the repository change only; it is not a claim that every
consumer or deployment has independently reinstalled and rescanned dependencies.

Playwright browser tests use one worker and a fixture-only build/server to serialize
stateful UI coverage and avoid test-data races. This improves repeatability of the
local/CI browser suite but does not prove production availability or parallel-worker
compatibility.

Deployment smoke coverage is limited to repository tests, build/workflow checks,
deployment configuration validation, and the documented anonymous/authenticated
checks. It does not establish an end-to-end scan and publication for an independently
owned external repository. External verification still requires a real authorized
owner, installed App, configured Worker secrets/bindings, Pages and Worker rollout
checks, and a live launch through publication with exact source/run/attempt evidence.

The connected service-self project must explicitly enable or defer every scanner
channel known by the pinned tooling revision. Reconciliation may run after explicit
requests and in the scheduled recovery pass; only previously accepted durable request
assets may create scan work. Correlate runs by request ID and persisted target state.

On 2026-10-14, Worker version `63068c97-2f88-4121-8539-d97ff0729a19` was deployed
at 100% traffic to fix project discovery rejecting trusted legacy scanner profiles.
Portable profiles remain subject to strict portable-profile validation. The production
public config requires login and anonymous `/api/projects` returns `401`. Validation
passed: 67 analysis service unit tests, 13 deployment tests, workflow audit, and 80
launcher tests. An authenticated production registry read was not performed because
no signed-in browser session was available.

Portable analysis now discovers repository-relative dependency manifests and
Dockerfiles outside product-specific paths. A discovered dependency manifest
enables the isolated OSV-Scanner producer, while absent inputs remain explicit
`NOT_AVAILABLE` evidence; source-executing jobs still receive no vendor or
publication credentials. Generic Dockerfile discovery is currently used for
planning and remains pending a pinned multi-file Hadolint producer.

The portable OSV producer, credential boundary, and isolated vendor producer are
pinned to `0ff77f8530c0f7c60b78f10c14d1ebe8216f2daf`; the Worker was redeployed as
version `5e009396-1371-434f-9ec7-448b0c789957` with that tooling revision.

In the prior deployed pipeline, portable source launches ran isolated Snyk and Sonar
evidence jobs before source report assembly. They received only exact target source and
optional GitHub Environment secrets (`SNYK_TOKEN`, `SONAR_TOKEN`, `SONAR_API_TOKEN`);
source jobs and publication jobs did not receive those credentials.

Published reports now expose one canonical current target per repository
project. The selected branch, pull request, or commit remains preserved as
provenance, while bounded `recent_runs` metadata supports launch polling and
superseded-request reporting without creating multiple current reports.

## 2026-10-16 Configured-Source Implementation (Deployed)

The sole implementation specification is
`.kilo/plans/1791898173827-configured-source-project.md`. The deployed source supports
explicit preview then confirmation, immutable
`analysis-request-v2` envelopes, idempotency, FIFO with one active source revision
globally, per-channel producer lanes and matching-evidence reuse, and incremental
same-SHA merge. Scheduled reconciliation is recovery-only. Channel states distinguish
requested/running/completed/failed from `NOT_SELECTED`, `NOT_APPLICABLE`, and `DEFERRED`.

Reports retain one source-only report per configured repository and one optional
PR overlay. Source report identity is configured project/repository + SHA + tooling +
profile. PR overlay identity adds the PR number, head repository/SHA, and base SHA; its
CodeRabbit asset is stored and read separately so PR evidence never contaminates source-
only findings. A successful source-only publication that advances to another SHA retires
an incompatible older overlay; queued or failed source attempts preserve prior overlay
state. Superseded content-addressed assets are deleted after manifest commit. Native
feedback is disabled for all three configured projects. Public GitHub Actions artifacts remain
publicly accessible regardless of dashboard authentication.

The rollout passed service tests, launcher tests, workflow audit, Worker dry run,
Worker deployment, UI build, focused browser flows, and the required PR compatibility
check. Deployment changed the Worker and dashboard only; no production scan was run.

## 2026-10-20 Report PDF and export preview

The authenticated report now previews a complete or filtered PDF export before
generating a download. The preview freezes and displays the export scope, finding
count, scanner completion, incomplete coverage, active filters, and single-document
output. The generated PDF is organized as an evidence report with an executive
summary, severity and category distributions, scanner coverage, explicit limitations,
immutable provenance, and detailed findings containing source links, scanner and rule
attribution, explanation, impact, remediation, and workflow evidence. Complete exports
include every retained finding in one PDF; filtered exports include the findings selected
by the active report filters. Incomplete scanner evidence is never presented as zero findings.

## 2026-10-20 Issues investigation workspace

Issues is organized as the primary developer investigation surface. It begins with the
current filtered scope, critical count, multi-scanner support count, and missing-location
count, followed by URL-preserved search, evidence filters, grouping, and the finding list.
Each finding keeps severity, immutable source location, applied rules, and scanner support
visually separate. Multi-scanner support is highlighted as correlation evidence without
claiming confidence, impact, a shared defect, or a common root cause. Opening a finding
retains source context, supporting observations, immutable links, developer copy actions,
and cautious rule, file, directory, and scanner relationships.

The shared visual tokens use the repository-owned institutional marks as their basis:
Trust Lab blue structures immutable provenance, Mphasis magenta identifies primary
actions and multi-scanner correlation, cyan identifies scanner evidence, green marks
completed evidence, amber marks incomplete coverage, and red remains reserved for
actionable failures. Dark and light themes use contrast-adjusted variants of the same
semantic roles rather than changing what each color means.

## 2026-10-20 Analysis progress placement

Live analysis progress is scoped to the project being analyzed and is no longer
rendered globally on Projects or Settings. A successful published or reused result
opens its report and then removes the temporary progress panel. Durable request and
revision identifiers are shown with the selected project in Settings, while report
and workflow provenance remains available from Security & provenance and Report.

## 2026-10-20 Proactive preferred-branch evidence

`preferred-branch-analysis.yml` now runs at minute 17 every six hours as well as on
manual dispatch. Each invocation resolves the configured preferred branch of all three
trusted public projects to an immutable SHA, requests every enabled non-deferred branch
channel, and immediately dispatches project-scoped coordinators. PR-only CodeRabbit
evidence and language-inapplicable channels remain excluded. Workflow-level concurrency
prevents overlapping batch admissions without serializing the three project analyses.
The coordinator's 15-minute schedule remains recovery-only and does not create work.
