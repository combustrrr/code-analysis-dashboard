# Current implementation state

The authoritative [new-chat handoff](../HANDOFF.md) records the verified deployment,
source projects, producer evidence, tests and remaining work as of 2026-09-11.

Deployed: standalone Ant Design application, collaborator login, repository/profile
configuration, direct branch/PR/full-SHA launch, durable bounded queue, current Release
reports, automatic selected-target results, issue filtering/grouping/provenance,
selected-project connection verification, and validated immutable scanner adoption.

Execution/storage: service repository only. Kavach upstream and Agentic-Kibana fork
are read-only sources; service-self is connected. Parking-lot monitoring is removed.
The product retains independent CI/docs/release workflows. Pages has no report data.

Open exceptions: Sonar non-main-branch entitlement and upstream repository-security
posture permissions. A successful advisory workflow is not a complete scanner report.
Another collaborator's live login is deferred; independent external-owner installation
is not live-proven and is outside the current Kavach-focused scope. Do not restore
superseded fork installation or claim every scanner has usable evidence.

Latest UI/API rollout: PR #17, Pages run 34632779427, Worker version
13dc3e20-4d86-4350-9167-4223ed24ad04. Latest verified adopted tooling: PR #16,
7cc92da3ecb6229359e364d163d42a70c305c096. Read live profiles before reusing a pin.
