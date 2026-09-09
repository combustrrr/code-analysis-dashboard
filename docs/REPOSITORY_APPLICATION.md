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
