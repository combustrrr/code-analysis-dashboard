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
