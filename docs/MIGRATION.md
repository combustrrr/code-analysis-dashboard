# Extraction from the product repository

This branch assembles the complete service in its own project. It does not delete
report assets or retire a working scanner host before its replacement is verified.

## Ready

Dashboard, Cloudflare launcher, discovery, scanner workflows and adapters, publisher,
repository profiles, canaries, maintenance automation, and standalone instructions.

## Confirmed full separation

The user selected complete removal of analysis code from the Agentic-Kibana fork.
This repository owns discovery, scanners, UI, launcher, and report publication.
Service and Worker configuration now identify this repository as the analysis host.
The product repository retains only a documentation link to this external service.

The user explicitly approved encrypted transfer of SONAR_TOKEN, SONAR_API_TOKEN,
and SNYK_TOKEN. These three secrets are now configured in this repository. Values
were encrypted for its public key before transport; no plaintext values were
logged or stored in artifacts. Existing Sonar entitlement limitations remain.
The launcher App installation may need access to this repository before
authenticated dispatch works. SCANNER_UPDATE_TOKEN remains unconfigured.

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

The old fork is not retained as a thin runner.
