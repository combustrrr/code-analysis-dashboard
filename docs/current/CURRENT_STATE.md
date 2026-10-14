# Current implementation state

The latest verified deployed Worker is `ec340878-82e9-44c7-8105-d4053f677241`; it
contains the GitHub Pages base-path redirect correction. The fixed-host sign-in plan
implementation described below is present in the current working tree but has not been
committed or deployed. Do not treat local target/API/UI changes as live behavior.

The local source now fixes execution, storage and publishing to
`combustrrr/code-analysis-dashboard` (ID `1360051890`). Its trusted registry contains
Kavach-AgenticSOC (`1267340546`), service self-analysis (`1360051890`), and
Agentic-Kibana (`1278177697`). Read-only collaborators can browse reports; execution
write access is required to launch; repository admin access is required to change the
versioned registry. Selecting a project does not trigger a workflow. The repository
setup, arbitrary execution-host selection, and per-user App installation screens are
removed from the repository-mode UI.

The deployed application already has same-tab GitHub OAuth with PKCE and a one-time
Durable Object exchange. The local plan implementation also adds fixed-host project
API validation, exact target identity checks, separate viewer/write/admin enforcement,
and real visible-tab session rechecks. Source scans still execute only in isolated
GitHub Actions jobs; Cloudflare Workers do not execute source code.

Reports remain in Cloudflare R2 and service state in KV. Public Actions artifacts are
not confidential merely because the dashboard is authenticated. The project currently
has no claim of private artifact handling.

Open exceptions remain Sonar non-main-branch entitlement and upstream repository-
security posture permissions. A successful advisory workflow is not a complete scanner
report. Another collaborator's live sign-in is not a verified deployment check; the
access behavior is covered by local browser/API tests.

Latest documented Pages rollout: commit `056eee4`; Pages deployments are triggered
from main. The Worker was subsequently deployed as `ec340878-82e9-44c7-8105-d4053f677241`
for the Pages base-path redirect fix. The current fixed-host plan changes remain local.
Read the live project profile before reusing a tooling pin; the configured evaluation
target is Kavach `Testing` at the frozen SHA
`231bb41f7eb1b707e25113c258eb8d5c7356b743`.

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
reconciler is triggered by source completion, scheduled recovery, or an explicit
request; it recovers completed runs with a lost dispatch receipt by exact source SHA
and canonical artifact name, then publishes the partial/current report to R2.

The legacy scanner workflow files had been serialized with `true:` instead of the
GitHub trigger key `'on':`, which made GitHub register push runs with zero jobs.
Those triggers are repaired and the workflow audit now rejects that serialization.
GitHub Pages was rebuilt from main commit `5b07952` by workflow run `38441170421`.
The Cloudflare Worker was redeployed as version
`b990585d-1412-4a8c-8c43-8abb0e096577`; its R2 bindings and origin-protected public
configuration endpoint remain live.

The earlier repository workspace connected user-selected execution repositories to
source projects and offered an optional folder-mapping setup flow. That implementation
is superseded in the current local source by the fixed-host target registry and
read-only viewer flow. No live scanner request has been dispatched for this plan.

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
channel known by the pinned tooling revision. Reconciliation runs may occur both
from an explicit request and from the durable recovery/scheduled pass; correlate
them by request ID and persisted target state before treating them as duplicates.

Portable analysis now discovers repository-relative dependency manifests and
Dockerfiles outside product-specific paths. A discovered dependency manifest
enables the isolated OSV-Scanner producer, while absent inputs remain explicit
`NOT_AVAILABLE` evidence; source-executing jobs still receive no vendor or
publication credentials. Generic Dockerfile discovery is currently used for
planning and remains pending a pinned multi-file Hadolint producer.

The portable OSV producer, credential boundary, and isolated vendor producer are
pinned to `0ff77f8530c0f7c60b78f10c14d1ebe8216f2daf`; the Worker was redeployed as
version `5e009396-1371-434f-9ec7-448b0c789957` with that tooling revision.

Portable source launches now run isolated Snyk and Sonar evidence jobs before
source report assembly. They receive only exact target source and optional GitHub
Environment secrets (`SNYK_TOKEN`, `SONAR_TOKEN`, `SONAR_API_TOKEN`); source jobs
and publication jobs do not receive those credentials.

Published reports now expose one canonical current target per repository
project. The selected branch, pull request, or commit remains preserved as
provenance, while bounded `recent_runs` metadata supports launch polling and
superseded-request reporting without creating multiple current reports.
