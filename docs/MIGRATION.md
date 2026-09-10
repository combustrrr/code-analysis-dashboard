# Extraction from the product repository

The service now lives entirely in combustrrr/code-analysis-dashboard: discovery,
scanner workflows and adapters, repository profiles, canaries, maintenance,
Cloudflare launcher, UI, and publication. Agentic-Kibana retains its product CI,
release, and documentation workflows and links to this external service.

The three approved vendor credentials were transferred encrypted for the destination
repository. Snyk completed on the new host. The temporary transfer workflow and
remote ciphertext artifact were removed. Existing Sonar entitlement limits remain;
SECURITY_POSTURE_TOKEN and SCANNER_UPDATE_TOKEN still need provisioning.

The existing Cloudflare Worker now dispatches to this repository, preserving its
URL and secrets. The owner confirmed adding this repository to the GitHub App
installation on 2026-09-09. A signed-in browser launch has not independently been
verified since that access change.

Discovery and Pages publication have succeeded here. Current report assets and
original producer references are preserved while fresh exact-source scans run.
Scanner compatibility is required on main. A Ruff configuration dependency on the
product checkout was extracted into scanner-owned configuration; workflow policy
now rejects missing trusted tooling paths.

The old fork is not retained as a thin runner. Upstream source remains read-only.

## 2026-09-10: external service, no product runner

The temporary repository-owned fork integration is being removed at the owner's
request. The service repository owns execution and Release storage for every
configured project in this instance. Product fork and upstream are read-only
observer sources; the service itself is the connected project used for native
GitHub security verification. This supersedes the fork-runner rollout notes.


### Verified extraction and native security, 2026-09-10

PR #2 merged at aa58a41e2077f66b943c832d3d61ef2c0001a010 and Pages deployment
34437071390 succeeded. The fork removal commit is 2410a3dd; its product CI
34436866944 passed. Only ci.yml, docs.yml and release.yml remain in the fork.
Scanner-only vendor secrets and six service-owned current/state Releases were
removed from the fork after destination verification. Historical Actions runs and
checks retain their original GitHub attribution.

Migrated 26 targets in three collections, totaling 60,060,125 compressed bytes.
Original producer evidence remains unchanged. New service-host reconciliation
34437108601 and self-analysis 34437129625 succeeded. Publication 34437268755
confirmed all 32 native security partitions complete for service commit aa58a41e.
Only available Gitleaks/Trivy channels were uploaded; missing Bandit/OSV setup in
the portable profile remains explicit and does not clear their alerts.

The new repository-local scheduler owns hourly scanning. The legacy discovery
workflow remains manually callable for the existing login path but no longer has
an hourly trigger. Legacy Pages data refresh remains until authenticated public
report delivery cutover is verified. New GitHub App credential provisioning and
browser login-to-new-pipeline verification remain pending specific approval;
this extraction does not claim that cutover has been completed.
