# Workflow annotation evidence

Status: **implemented contract**

The trusted publisher collects GitHub Actions annotations only after it has
validated the producer workflow run and attempt. The browser cannot provide or
override that identity. Collection is read-only and does not create checks,
comments, SARIF uploads, commits, or pull-request changes.

## Evidence contract

`workflow-annotation-evidence-v1` binds every retained observation to the
execution/source repositories, immutable source and tooling SHAs, workflow, run,
attempt, job, check, optional step, and reviewed scanner-profile digest.

The inventory covers check-run annotations. Workflow commands, problem matchers,
and action-generated annotations are collected through their check-run
representation. Non-empty job summaries are retained as sanitized, unlocated
advisory observations. Collection uses at most 10 API pages, 100 records per
page, 1,000 annotations, and bounded response/message sizes. A limit produces a
`truncated` result rather than an invented zero.

## Safety and failure behavior

Only relative repository paths are accepted. Absolute, traversal,
runner-temporary, control-character, and drive-qualified paths become unlocated
workflow observations. Messages are plain text. Credential-shaped values,
signed query parameters, raw details, and over-limit content are withheld.

The channel distinguishes `measured_zero`, `complete`, `partial`, `truncated`,
`permission_denied`, `rate_limited`, `unavailable`, `invalid`, and
`operational_failure`. An incomplete annotation read makes only the workflow
annotation channel incomplete; healthy scanner siblings remain published.

## Reconciliation and review policy

An annotation corroborates a native finding only when source SHA, normalized
path, exact line range, exact rule title, and scanner/action identity all match.
It remains supporting provenance without increasing the canonical total. Similar
text alone never establishes a shared root cause.

Unmatched warnings and failures are actionable workflow observations. Notices
are advisory. Jobs, checks, or titles carrying deterministic `canary` or
`negative test` provenance are labelled `validation_fixture` and remain visible
without promotion to a production defect. This reviewed policy, not colour
alone, determines whether an observation contributes to Needs attention.

Issues filters annotations by source, workflow, job, level, file, and correlated
scanner. Details show run/attempt, job, step availability, policy, and correlation.
Links are built from configured repository identity and validated IDs/SHAs, pass
the UI GitHub URL allowlist, and open with `noopener noreferrer`.

