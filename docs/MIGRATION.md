# Extraction from the product repository

This branch assembles the complete service in its own project. It does not delete
report assets or retire a working scanner host before its replacement is verified.

## Ready

Dashboard, Cloudflare launcher, discovery, scanner workflows and adapters, publisher,
repository profiles, canaries, maintenance automation, and standalone instructions.

## Pending runner choice

Choose whether this repository also runs analysis, or the fork continues as a thin
runner holding vendor credentials. Live configuration still names the fork.
Do not merge this branch unchanged: discovery needs write access to the configured
analysis repository, and the default GitHub token cannot write across repositories.

For a full move:

1. Securely provision SONAR_TOKEN, SONAR_API_TOKEN, and SNYK_TOKEN here. Existing
   vendor entitlement limits remain. SCANNER_UPDATE_TOKEN is still unconfigured.
2. Add this repository to the existing launcher's GitHub App installation. The
   current CLI token cannot list that App installation.
3. Update service.json and Wrangler to use this repository as the analysis host;
   preserve the Worker secrets, callback URL, and dashboard URL.
4. Initialize discovery here. Preserve current-reports Release assets and their
   original producer references while new reports are generated.
5. Verify branch/PR/commit selection, exact-source scanning, partial publication,
   and authenticated launching. Require Scanner compatibility on the default branch.
6. Disable old analysis schedulers, then remove analysis-owned files from product
   branches and update product documentation. Remove the retired service-only
   required check from the old host while preserving any product checks. Retain
   product CI, release, and docs workflows and shared product dependencies.

For a thin runner, implement immutable reusable workflow references and explicit
service/runner provenance first. Retain secrets in the runner and preserve the
existing exact-source validation when replacing its workflow implementations.
