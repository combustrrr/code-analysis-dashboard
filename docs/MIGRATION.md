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


### Authenticated application delivery, 2026-09-10

The owner authorized new App credential staging and confirmed installation of
code-analysis-dashboard on the service repository only. Replacement credentials
are stored in Cloudflare under NEXT_GITHUB_* names; existing credentials remain
available for rollback. Repository application mode is now active in the Worker.
Public project/manifest reads return HTTP 200; unauthenticated configuration reads
return 401. Public report tokens are limited to one repository and read-only
contents, with bounded metadata caching.

Pages now builds only the application on UI/workflow changes or manual dispatch.
No report data is bundled, and no report publication or cleanup runs in Pages.
Current reports remain in per-project Releases and load through the Worker.
Default project is upstream Testing; the source picker exposes all configured
projects, and old fork-host links resolve to the service's migrated projects.
Production build measured 1,075,537 bytes without a data directory. Browser preview
loaded real upstream reports, switched to service-self findings, and exposed the
new sign-in flow. Real authenticated launch acceptance remains pending UI rollout.

### Authenticated launch accepted, 2026-09-10

The owner signed in with the new App and submitted service main through the
wizard. Request d425a274-16c8-4bec-91c9-2854b37f3b71 persisted while two slots were
occupied, then producer 34440758894 attempt 1 analyzed exact source commit
8c44cde0d2ae15d37056c9e16b1734708145a90c. Reconciliation 34440932058 succeeded.
The deployed browser and public report API returned that exact producer and SHA;
all 32 supported native SARIF partitions completed processing. Browser execution
reported no JavaScript errors. Login, launch, bounded queue and report delivery
are verified. Earlier credential-approval and authenticated-launch pending notes
above are historical and superseded by this evidence.

The report remains valid partial: the portable profile does not yet execute all
language/runtime/vendor adapters. Readiness setup_required entries are actual
configuration/adapter gaps, not failed dependency installation. This launch proof
does not accept all-scanner readiness or unrestricted arbitrary-repository support.
