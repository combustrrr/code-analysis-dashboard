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
