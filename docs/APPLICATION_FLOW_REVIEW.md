# Application flow review — 2026-09-09

## Verified implementation

The Worker signs users in, verifies write access to the configured analysis host,
validates branch/PR/full commit SHA against one configured source, and dispatches
discovery. Discovery resolves exact source identity and queues at most two analyses.
Isolated Actions jobs generate scanner evidence. Publication validates producer
identity and source revision, retains valid partial reports, updates current Release
assets, and deploys Pages. Publication does not rerun scanners.

Latest reviewed exact-source runs 34377060732 and 34377064511 completed with workflow
success. This does not prove every vendor channel completed. The fork CI failure
in run 34375684092 is Help Center & docs plus its dependent CI passed gate.

## Gaps

- Worker and service configuration support one source repository, not an onboarded
  collection. Access currently requires write permission on the central analysis host.
- configure_instance.py still requires three different repositories, conflicting
  with the deployed combined scanner/publisher host.
- No implemented source-repository feedback path in the exact-source workflow:
  native security uploads and PR/commit checks must use that source's actual SHA.
- Push/PR webhook onboarding is absent; hourly discovery and manual dispatch are
  the current entry points.
- Portable profiles/extensions exist, but language-specific jobs and vendor
  projects require applicability and setup. Any repository does not mean every
  scanner applies to every language.
- Discovery retains run-title nonce recovery when dispatch run IDs are unavailable;
  this is a fallback to document and validate, not an exact-ID-only implementation.

## Recommended application flow (proposed, not deployed)

Connect GitHub App -> select authorized repositories -> configure/review detected
profile and applicable scanners -> choose branch, PR, or immutable commit -> queue
one exact-source analysis -> validate results -> update both the dashboard and
source-repository GitHub checks/security findings.

Keep one application and shared scanner implementation in this repository. Keep
Cloudflare for authentication, repository authorization, webhooks, and launch/status
APIs; GitHub Actions executes scanners. Add a small source-repository workflow when
visible Actions runs there are required; use version-pinned shared tooling. Product
CI remains independent. Manual requests and automatic events must share identity,
idempotency, concurrency, and publication rules.

Start with owner-managed repository configurations and current report storage.
If onboarding later needs shared mutable installation/configuration/job state,
introduce a small durable metadata store explicitly; do not require a historical
findings database. Preserve one current report per active branch/PR and bounded
manual selections. Private repositories need authenticated report delivery before
onboarding, because the existing Pages reports are public.

Acceptance should use two genuinely different repository profiles and verify push,
PR head/base changes, commit selection, permissions, incomplete evidence, and native
GitHub feedback. Repair fork docs CI and feedback before declaring cutover complete.
