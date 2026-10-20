# Threat Reports

The dashboard publishes a deterministic Threat Report for each newly collected
analysis. Threat Report is a security-oriented view that also includes dependency,
infrastructure, quality, reliability, advisory, and unknown findings.

## Contents

- Finding severity and category
- Scanner message, file, and source line
- Catalog-backed explanation, potential impact, and remediation steps
- Scanner/AI evidence provenance and catalog/fallback guidance provenance
- Coverage, incomplete-channel warnings, report identity, and limitations
- Analysis request identity and report-generation timestamp

Reports are generated during publication from the existing normalized canonical
findings. The report layer does not rediscover or deduplicate findings. Guidance is
advisory and does not generate or apply patches.

Completed producer runs are collected only when the exact run/attempt handoff
artifact is present and usable. Missing or expired handoffs are reported with the
expected artifact identity and re-queued through the bounded recovery path instead
of remaining indefinitely in collection.

## Identity and exports

Stored reports are immutable for the analyzed target SHA, report schema version,
guidance catalog version, and generator version. The dashboard supports authenticated
private links, JSON download, Markdown download, and generated PDF download.

Reports preserve secret redaction and treat scanner-controlled values as untrusted
text. Incomplete channels remain visible and are not interpreted as zero findings.

The screen is optimized for review and export: severity colors, coverage status tokens,
responsive tables, and high-contrast light/dark themes are provided by the Threat Report
view. PDF output is generated locally from the already fetched, authenticated report JSON;
it does not call a PDF service or refetch evidence. Complete export always contains every
retained finding. Filtered export freezes the active query, severity, category, and guidance
filters at click time and is unavailable until at least one filter is active.

PDF files identify the exact source SHA, analysis, report, tooling, catalog, generator,
coverage state, limitations, and a distinct export timestamp. Source locations link to the
exact GitHub SHA when the repository identity is valid. Large exports are deterministically
split between findings and delivered only after every volume succeeds as a single ZIP;
failed exports never offer a partial package. JSON and Markdown remain available as the
lossless fallbacks for reports above the documented browser-safe PDF volume limit.

## Publication and target boundaries

Native SARIF publication is disabled for every configured target. Source-executing and
diagnostic jobs are read-only, reconciliation has no checks or security-events write
authority, and connected self-analysis follows the same no-source-feedback rule as the
observer projects.

Reports are current-only: the Worker serves the current manifest and current
assets, subject to identity and freshness checks. Superseded, stale, undated, or
unpublished targets are not reconstructed and are not represented as zero findings.
Targets must be a repository branch, open pull request, or full 40-character commit
SHA; local working trees and uncommitted changes are unsupported.

## Evaluation Guardrails

The configured Kavach evaluation accepts only the `Testing` branch, freezes its
resolved commit SHA before dispatch, and uses a deterministic idempotency key that
includes the source repository, target SHA, tooling SHA, and scanner profile digest.
The durable evaluation state records `evaluation_target_sha`,
`evaluation_dispatches_used`, `evaluation_paused`, and the persisted request ID.
The one-dispatch budget remains consumed after completion, failure, timeout, or an
uncertain dispatch; an operator must reset it explicitly. Normal non-evaluation
projects retain the general two-slot reconciliation policy.

Refreshing or reopening the dashboard is read-only. Only an explicit Run analysis
action can consume this budget. If a deterministic request asset already exists in the
analysis request release, the Worker returns it as queued instead of uploading a
duplicate. A reset clears only the evaluation lock; it does not delete report evidence.

Older reports may receive a bounded `legacy-runtime` fallback. It is explicitly marked
non-immutable and must not be treated as equivalent to a publication-time report. If
the Worker limits are exceeded, rerun the analysis.
