# Current implementation state

The authoritative [new-chat handoff](../HANDOFF.md) records the verified deployment,
source projects, producer evidence, tests and remaining work as of 2026-10-02.

Deployed: standalone Ant Design application, collaborator login, repository/profile
configuration, direct branch/PR/full-SHA launch, durable bounded queue, current R2
reports, explicit selected-target results, issue filtering/grouping/provenance,
selected-project connection verification, Threat Report JSON/Markdown/PDF exports,
and validated immutable scanner adoption. Dashboard refresh is read-only; launches
require an explicit user action.

Execution/storage: service repository only. Kavach upstream and Agentic-Kibana fork
are read-only sources; service-self is connected. Scanner execution remains in Actions.
Current report manifests/assets use Cloudflare R2, while `temp-runs/` is lifecycle-
managed ephemeral storage. Parking-lot monitoring is removed. Pages has no report data.

Open exceptions: Sonar non-main-branch entitlement and upstream repository-security
posture permissions. A successful advisory workflow is not a complete scanner report.
Another collaborator's live login is deferred; independent external-owner installation
is not live-proven and is outside the current Kavach-focused scope. Do not restore
superseded fork installation or claim every scanner has usable evidence.

Latest documented main rollout: commit `056eee4`; Worker version
`182cde64-8a94-4bca-b1a2-a92854ca8fca` contains the request-idempotency fix. Pages
deployments are triggered from main. Read the live project profile before reusing a
tooling pin; the configured evaluation target is Kavach `Testing` at the frozen SHA
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
GitHub Pages was rebuilt successfully, and the Cloudflare Worker was redeployed as
version `1328c287-6a7a-4670-9846-009883f31528`; its R2 bindings and origin-protected
public configuration endpoint are live.

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
