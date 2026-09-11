# Acceptance and remaining limitations

The [handoff](../HANDOFF.md) is the current deployment/evidence record. UI/API
rollout is deployed; full scanner acceptance is not claimed.

Verified: product/service separation, current-release storage, exact producer/source
provenance, login/launch/report round trip, correctly scoped connected native SARIF,
observer no-source-write behavior, validated update adoption, combined issue filters,
source details, charts/themes/mobile navigation, connection verification, configuration
preview/confirmation, retry behavior and login/logout/revocation regression coverage.

Still incomplete: Sonar organization non-main-branch entitlement and upstream
repository-security-posture permissions. Inspect actual channel evidence rather than
workflow color. Unknown findings are unavailable, not zero; a valid partial report
remains useful and preserves the failed strict gate as evidence.

Owner login is verified; another accepted collaborator's live login is deferred.
Independent external-owner installation is not live-proven. Broad self-service abuse,
quota and provider entitlement acceptance must be assessed before expanding beyond
the current Kavach-focused scope. Free hosting is not unlimited usage. No automatic
purchases, upstream writes or branch-protection bypasses are authorized.

Dashboard login does not privatize the public GitHub Release assets. Keep scanner
secret redaction and source/script credential isolation intact. See
[access](DASHBOARD-ACCESS.md) and [architecture](SERVICE_ARCHITECTURE.md).
