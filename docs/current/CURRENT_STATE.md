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
