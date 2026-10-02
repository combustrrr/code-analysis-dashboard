# Current implementation state

The authoritative [new-chat handoff](../HANDOFF.md) records the verified deployment,
source projects, producer evidence, tests and remaining work as of 2026-10-02.

Deployed: standalone Ant Design application, collaborator login, repository/profile
configuration, direct branch/PR/full-SHA launch, durable bounded queue, current R2
reports, automatic selected-target results, issue filtering/grouping/provenance,
selected-project connection verification, and validated immutable scanner adoption.

Execution/storage: service repository only. Kavach upstream and Agentic-Kibana fork
are read-only sources; service-self is connected. Scanner execution remains in Actions.
Current report manifests/assets use Cloudflare R2, while `temp-runs/` is lifecycle-
managed ephemeral storage. Parking-lot monitoring is removed. Pages has no report data.

Open exceptions: Sonar non-main-branch entitlement and upstream repository-security
posture permissions. A successful advisory workflow is not a complete scanner report.
Another collaborator's live login is deferred; independent external-owner installation
is not live-proven and is outside the current Kavach-focused scope. Do not restore
superseded fork installation or claim every scanner has usable evidence.

Latest UI/API rollout: PR #26, merge `733e50f45c3276f50eb69999a19619899d7105db`,
Pages run `36995340061`, Worker version
`ed309518-d081-4887-a673-a0b9a2cc9eb8`. Latest verified adopted tooling: PR #16,
7cc92da3ecb6229359e364d163d42a70c305c096. Read live profiles before reusing a pin.
