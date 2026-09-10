# Repository-owned application implementation

The application now includes repository/project contracts, reviewed installation
previews and atomic installation, portable and existing full-profile reusable
producers, repository-local reconciliation, sharded current Release assets, native
feedback boundaries, signed webhook dispatch, public report delivery, and an Ant
Design connection/launch interface.

This is an implementation under integration verification, not an accepted public
self-service release. Live application mode remains unchanged until the rollout
checks succeed. Upstream ARYDESTROYER/Kavach-AgenticSOC remains strictly read-only.

## Activation prerequisites

- Release and pin the shared workflows; install the wrappers and profiles only in
  authorized execution repositories. Verify native and observer projects separately.
- GitHub App must be public and have reviewed contents/workflows write permissions
  for confirmed installation, Actions write for dispatch, and the relevant repository
  access. Repository workflows use scoped GITHUB_TOKEN permissions for publication.
- Worker webhook operation needs GITHUB_APP_ID, a PKCS8 GITHUB_APP_PRIVATE_KEY,
  and GITHUB_WEBHOOK_SECRET. Existing OAuth secrets remain separate.
- APPLICATION_MODE=repositories and TOOLING_SHA activate the new API only after
  integration verification. Build VITE_APPLICATION_MODE=repositories and
  VITE_LAUNCH_ENDPOINT with the matching Worker origin for the new UI.

## Remaining acceptance work

- Live wrapper installation and report round trips on the fork and another profile.
- Complete all scanner evidence available under repository-owned vendor credentials.
- Extend native security adapters beyond the initial bounded scanner subset and
  verify successful asynchronous SARIF processing and recovery.
- Finish configuration editing, readiness detail, automatic maintenance propagation,
  missing-artifact retry and uncertain-dispatch recovery acceptance coverage.
- Exercise all GitHub throttling, browser, large-dataset, and report-delivery cases;
  validate public self-service abuse controls and caching before activation.
- Migrate existing reports and retire old schedules only after replacement proofs.

Product docs CI was repaired by preserving the final fork-only analysis document in
this service's historical docs and removing it from the product docs tree. Fork CI
run 34380231777 completed successfully.

## Free Cloudflare services (2026-09-09 decision)

The owner permits Cloudflare services when they remain free. Keep the existing
Worker for authentication and application APIs and GitHub Release assets for
current reports. A public GitHub repository does not change Cloudflare quotas.
Do not enable paid plans or usage-billed subscriptions automatically.

Workers Free currently permits 100,000 requests per day. D1 Free includes five
million rows read and 100,000 rows written per day, with 5 GB total storage;
queries fail when daily limits are exhausted. D1 is an allowed option for small
application metadata if it simplifies the implementation, but no database has
been provisioned and the current GitHub request queue remains authoritative.
Avoid introducing a second request queue during migration.

R2 includes a free allowance but charges for overages, so it is not enabled.
Keep authentication responses uncached; cache only validated public data with
bounded freshness. Verify caching on the actual deployment hostname before
counting it toward API usage reduction. Scanner execution stays in Actions.

References: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## Acceptance evidence, 2026-09-10

Fork and read-only upstream current reports are published in the fork's own Releases.
Producer runs 34387983498 and 34387962071 retain exact source and attempt identity.
Both are partial: Sonar branch entitlement and security-posture permissions remain
named blockers. Fork tests returned exit 1 alongside usable coverage. No upstream
native check or SARIF write occurred. Fork native check 102593359503 was created.
The initial native SARIF limit is repaired with 16 stable partitions and explicit
processing receipts; live processing confirmation is still required.

Administrators can preview and confirm edits to preferred branch, scanner
selection/deferrals and report budget. Trusted execution commands remain reviewed
in the repository profile; the editor does not change source identity. Readiness
shows configuration and missing adapters without claiming successful evidence.
Missing or expired producer artifacts queue at most two replacement scans.

A third project uses the standalone application source with the portable profile
on the fork runner to verify another repository layout. Its live evidence remains
pending. Legacy reports/schedules remain active until delivery cutover passes;
new public App credential setup remains separately blocked on approval.

## External-service boundary (2026-09-10, authoritative)

The owner superseded the temporary fork-runner installation. All scanner execution,
scheduling, repository profiles and current report storage belong in
combustrrr/code-analysis-dashboard. Both combustrrr/Agentic-Kibana and
ARYDESTROYER/Kavach-AgenticSOC are read-only observer sources. Neither receives
analysis workflows, configuration, checks, SARIF uploads or vendor-token operations.
Agentic-Kibana retains only its independent product CI, docs and release workflows.

Public repository onboarding remains reusable for other authorized execution hosts,
but this instance explicitly rejects installation on the two protected product
repository IDs, including after a rename. Native GitHub security verification uses
the service repository's own connected source project.

Migration copies immutable report shards before replacing destination manifests.
Original source SHAs, observation data and producer workflow links remain unchanged.
Scheduling state is rediscovered on the new host; old run IDs are never interpreted
as executions from the new repository. Source assets are retained until verified
copies exist. Historical GitHub checks retain their original attribution.
