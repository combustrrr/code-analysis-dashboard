# Acceptance and remaining limitations

This document records deployment acceptance and remaining limitations. The UI/API rollout
is deployed; full scanner acceptance is not claimed. Stable boundaries are defined by the
[system architecture](../architecture/SYSTEM_OVERVIEW.md).

## Workflow annotation readiness

Before treating annotation evidence as complete, confirm the publisher has
`actions: read`, the report contains `workflow-annotation-evidence-v1`, and the
run ID and attempt match the admitted request. Permission, rate-limit, partial,
truncated, and unavailable states are limitations, never zero findings. Canary
acceptance must reconcile retained, correlated, excluded, and unavailable rows
with GitHub's visible annotations for the same run and attempt.
Confirm retained annotations redact Basic Authorization and labelled R2/S3-compatible
credential environment values. Because the GitHub check-run annotation API does not
provide step identity, confirm every retained record carries an explicit unavailable
step-provenance reason rather than an unexplained null.

Verified: product/service separation, current-release storage, exact producer/source
provenance, login/launch/report round trip, no-source-write behavior for all three
configured projects, validated update adoption, combined issue filters,
source details, charts/themes/mobile navigation, connection verification, configuration
preview/confirmation, retry behavior and login/logout/revocation regression coverage.

Sonar's OSS plan accepts the project main branch, not arbitrary long-lived branches. The
service-owned Agentic-Kibana and dashboard scanner identities therefore use dedicated CI
projects whose Sonar main branch is set to the configured preferred branch before the
first analysis. Kavach remains on its existing project identity until the upstream layer
is explicitly onboarded; do not delete or rewrite its existing Sonar branch history.

Still incomplete: Kavach Sonar main-branch onboarding and upstream
repository-security-posture permissions. Inspect actual channel evidence rather than
workflow color. Unknown findings are unavailable, not zero; a valid partial report
remains useful and preserves the failed strict gate as evidence.

Owner login is verified; another accepted collaborator's live login is deferred.
Independent external-owner installation is not live-proven. Broad self-service abuse,
quota and provider entitlement acceptance must be assessed before expanding beyond
the current Kavach-focused scope. Triage/suppression, SLA tracking, DAST/mobile
scanning and enforcement-mode blocking remain future work. Free hosting is not
unlimited usage. No automatic purchases, upstream writes or branch-protection
bypasses are authorized.

Dashboard login does not privatize the public GitHub Release assets. Keep scanner
secret redaction and source/script credential isolation intact. See
[access](DASHBOARD-ACCESS.md) and [architecture](../architecture/SYSTEM_OVERVIEW.md).

## Smoke-test scope

The repository deployment checks cover service tests, workflow policy, launcher tests,
UI build/browser coverage, and configuration-level deployment validation. The live
anonymous check confirms that sign-in is visible and that an unauthenticated
project-integration request is denied; it is not a successful authenticated scan.
Playwright runs are serialized with one worker against a clean-checkout,
deterministically generated fixture plus a separately built authenticated-access
suite. They prove the checked-in browser contract is reproducible, but do not
validate concurrent browser workers or by themselves prove the deployed
Pages/Worker pair is healthy.

External deployment verification remains outstanding where it requires credentials or
provider state: an authorized owner must validate the installed GitHub App, Worker
secrets and R2/KV bindings, Pages-to-Worker routing, and a real launch through
publication. The resulting source repository, target revision, workflow run and
attempt must be inspected before claiming external deployment success. Independent
external-owner onboarding remains outside the current live-proven scope.
