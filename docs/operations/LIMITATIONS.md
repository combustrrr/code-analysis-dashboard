# Limitations

Known remaining limitations of the code-analysis workflow.

## GHSA advisories lack file/line precision

GHSA advisories are surfaced at the repository level only. They do not include
file paths or line numbers, so triage requires manual investigation of the
affected dependency versions.

## Legacy report fallback has CPU/size limits

When the current scanner cannot produce a report, the system falls back to a
legacy report. That fallback is bounded by CPU time and report size; large or
long-running analyses may be truncated or skipped.

## Evaluation mode uses frozen SHA

Evaluation runs operate against a frozen source SHA. They do not pick up new
commits, so results can drift from the live repository state over time.

## R2 temp-runs lifecycle depends on bucket configuration

Temporary runs stored in R2 are intended to be purged automatically by the
one-day lifecycle rule on the `temp-runs/` prefix. Operators must verify that
rule is configured and investigate any stale objects if the lifecycle check
fails; cleanup is not normally a manual per-run task.

## Scanner coverage depends on configured secrets

Scanner coverage is limited to the secrets configured for the run. If a
required credential is missing or expired, the corresponding scan is skipped
or incomplete.

## Dashboard requires GitHub App + Cloudflare Workers setup

The dashboard is not self-contained. It requires a configured GitHub App for
repository access and a deployed Cloudflare Workers backend before it can
serve results.

## Webhook replay protection is bounded

Supported signed GitHub deliveries require the `ANALYSIS_STATE` KV binding. The
Worker validates the delivery ID, writes a replay marker before dispatch, and
keeps that marker for 24 hours. A repeated delivery returns `202` without a
second dispatch. KV has no atomic compare-and-set, so this is not a strict
concurrent exclusion guarantee. If the marker or dispatch state is unavailable,
the webhook fails closed; hourly reconciliation remains the recovery path for a
missed dispatch. The default webhook body limit is 1,000,000 bytes and may be
overridden with `MAX_WEBHOOK_BYTES`.

## Working-tree targets are unsupported

The launcher accepts repository branches, open pull requests, and full commit SHAs.
It cannot analyze a local working tree, uncommitted changes, or a local filesystem
path because those inputs do not provide immutable source and target provenance.

## Current manifests fail closed

The public report API serves a current manifest only when its identity is valid
and its publication time is verifiable from `checked_at` or the latest history
entry. The default freshness budget is 24 hours (`MAX_REPORT_AGE_MS`); stale or
undated manifests return `410` with `expired: true`. The same freshness check
gates report assets and threat-report fallback reads. Rerun reconciliation or
analysis to publish a fresh manifest; do not treat an unavailable report as an
empty result.

## External URLs are intentionally narrow

The UI renders report and producer links only when they are absolute HTTPS URLs
whose host is `github.com` or `www.github.com`, with no username, password, or
explicit port. Other schemes and hosts are omitted rather than displayed as
links. This protects the dashboard boundary but does not verify that a retained
GitHub URL is reachable or that the referenced run remains accessible.

## Live integration and free-tier limits

The repository/application integration is not a proof of independent external-
owner onboarding. It depends on the configured GitHub App, repository permissions,
Actions availability, Cloudflare Worker/R2/KV bindings, and provider entitlements.
Scanner channels can therefore remain unavailable or partial even when request
routing and workflow readiness checks succeed. Keep missing credentials,
permissions, quotas, and vendor-plan restrictions explicit in reports.

Free or public-provider plans are shared quotas, not reserved capacity. Worker
requests/logs, GitHub Actions/API limits, R2/KV storage and lifecycle rules, and
scanner/vendor free-tier limits can affect availability and completeness. No
provider credit, paid upgrade, external installation, or live result is implied
unless separately recorded in the current handoff with exact evidence.
