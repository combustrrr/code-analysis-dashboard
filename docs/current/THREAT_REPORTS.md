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

Reports are generated during publication from the existing normalized canonical
findings. The report layer does not rediscover or deduplicate findings. Guidance is
advisory and does not generate or apply patches.

## Identity and exports

Stored reports are immutable for the analyzed target SHA, report schema version,
guidance catalog version, and generator version. The dashboard supports authenticated
private links, JSON download, Markdown download, and browser print/save-to-PDF.

Reports preserve secret redaction and treat scanner-controlled values as untrusted
text. Incomplete channels remain visible and are not interpreted as zero findings.

The screen is optimized for review and print: severity colors, coverage status tokens,
responsive tables, high-contrast light/dark themes, and print-specific pagination are
provided by the Threat Report view. PDF output is browser print/save-to-PDF from the
report view; controls and navigation are hidden in print media.

## Publication and target boundaries

Native SARIF publication is not a property of every scan. Only the explicitly
scoped reconciliation/native-publication job receives `security-events: write`.
Source-executing and diagnostic jobs are read-only; source-only observer projects
do not upload checks or findings to the source repository. A connected project can
publish supported native findings only to its configured execution repository.

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
