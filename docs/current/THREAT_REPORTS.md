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

## Evaluation Guardrails

The configured Kavach evaluation accepts only the `Testing` branch, freezes its
resolved commit SHA before dispatch, and uses a deterministic idempotency key that
includes the source repository, target SHA, tooling SHA, and scanner profile digest.
The durable evaluation state records `evaluation_target_sha`,
`evaluation_dispatches_used`, `evaluation_paused`, and the persisted request ID.
The one-dispatch budget remains consumed after completion, failure, timeout, or an
uncertain dispatch; an operator must reset it explicitly. Normal non-evaluation
projects retain the general two-slot reconciliation policy.

Older reports may receive a bounded `legacy-runtime` fallback. It is explicitly marked
non-immutable and must not be treated as equivalent to a publication-time report. If
the Worker limits are exceeded, rerun the analysis.
