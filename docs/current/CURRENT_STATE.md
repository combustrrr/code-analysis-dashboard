# Current implementation state

The latest verified Pages deployment is run `38598467689` for main commit
`216393820ab8ca05c4729115ceb98dfec1d7ce0e0`; its live HTML references the same JavaScript
and CSS assets recorded in the workflow build log. The active Worker is
`63068c97-2f88-4121-8539-d97ff0729a19`. Its public config requires login for dashboard and
report routes, and anonymous project/report API checks returned `401` after rollout.

The local source now fixes execution, storage and publishing to
`combustrrr/code-analysis-dashboard` (ID `1360051890`). Its trusted registry contains
Kavach-AgenticSOC (`1267340546`), service self-analysis (`1360051890`), and
Agentic-Kibana (`1278177697`). Read-only collaborators can browse reports; execution
write access is required to launch; repository admin access is required to change the
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

Pages deployments are triggered from main. The latest rollout is commit
`216393820ab8ca05c4729115ceb98dfec1d7ce0e0` in run `38598467689`; the live site serves
`assets/index-Dl9P-4d-.js` and `assets/index-D9a50ibX.css`, matching the uploaded build
artifact. At that Pages rollout, Worker version `a56a008d-7de0-4d66-8717-b7b41aa6b53d`
was active with `require_login=true` and `require_report_login=true`; anonymous project
and report API requests were denied with `401`.
This deployed baseline predates the configured-source implementation now in the local
working tree. The older deployment used a Kavach Evaluation Mode target; the local
implementation removes the frozen SHA and dispatch budget. No claim is made that this
local policy is active in production until the Worker, report reader, workflows, and UI
are cut over in the required order.

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

## 2026-10-16 Configured-Source Implementation (Local)

The sole implementation specification is
`.kilo/plans/1791898173827-configured-source-project.md`. Its changes are local and
not deployed; the production baseline above remains the last verified deployment.
The local source supports explicit preview then confirmation, immutable
`analysis-request-v2` envelopes, idempotency, FIFO with one active source revision
globally, per-channel producer lanes and matching-evidence reuse, and incremental
same-SHA merge. Scheduled reconciliation is recovery-only. Channel states distinguish
requested/running/completed/failed from `NOT_SELECTED`, `NOT_APPLICABLE`, and `DEFERRED`.

Local reports retain one source-only report per configured repository and one optional
PR overlay. Source report identity is configured project/repository + SHA + tooling +
profile. PR overlay identity adds the PR number, head repository/SHA, and base SHA; its
CodeRabbit asset is stored and read separately so PR evidence never contaminates source-
only findings. A successful source-only publication that advances to another SHA retires
an incompatible older overlay; queued or failed source attempts preserve prior overlay
state. Superseded content-addressed assets are deleted after manifest commit. Native
feedback is disabled for all three configured projects. Public GitHub Actions artifacts remain
publicly accessible regardless of dashboard authentication.

Before cutover, run the service, launcher, workflow audit, deployment, and UI checks,
then verify migration prerequisites. Deploy the Worker/report reader and trusted
workflows before exposing the matching UI. No production scan or deployment was
performed for this local implementation.
