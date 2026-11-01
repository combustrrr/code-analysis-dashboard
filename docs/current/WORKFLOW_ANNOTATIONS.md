# Workflow annotation evidence

Status: **implemented contract**

The trusted publisher collects GitHub Actions annotations only after it has
validated the producer workflow run and attempt. The browser cannot provide or
override that identity. Collection is read-only and does not create checks,
comments, SARIF uploads, commits, or pull-request changes.

## Evidence contract

`workflow-annotation-evidence-v1` binds every retained observation to the
execution/source repositories, immutable source and tooling SHAs, workflow, run,
attempt, job, check, optional step, and reviewed scanner-profile digest. GitHub's
check-run annotation API does not expose step identity, so each affected record
retains `step: null` plus `step_provenance.status: unavailable` and the explicit
reason `github_check_run_annotations_do_not_expose_step_identity`.

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
Basic Authorization values, labelled Cloudflare R2/S3-compatible credential
environment values, signed query parameters, raw details, and over-limit content
are withheld. These R2 variables may use AWS-prefixed names because the interface
is S3-compatible; this does not add an AWS service dependency.

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
are advisory. Validation fixtures are excluded only when workflow, job, check,
and action identities exactly match a reviewed rule in trusted tooling. Words
such as `canary` or `negative test` in provider-controlled annotation, job, or
check text never change policy. Every retained record includes the policy rule
and basis, so a fixture exclusion is reviewable rather than inferred from text.
This reviewed provenance, not colour alone, determines whether an observation
contributes to Needs attention.

Correlation uses the exact report source SHA and exact normalized rule, scanner,
path, and line range. Scanner aliases are an explicit reviewed registry; there
is no substring fallback. Unknown identities remain unmatched observations and
cannot suppress a canonical finding.

Issues filters annotations by source, workflow, job, level, file, and correlated
scanner. Details show run/attempt, job, step availability, policy basis, and
correlation. Deprecation and outdated-runtime annotations are retained as
`WORKFLOW_UPDATE` issues with an explicit workflow-update action rather than
being hidden by a successful run.
Links are built from configured repository identity and validated IDs/SHAs, pass
the UI GitHub URL allowlist, and open with `noopener noreferrer`.

Coverage retains the collector's `evidence_state` separately from the broader
channel status. The UI therefore renders complete, measured zero, partial,
truncated, permission denied, rate limited, unavailable, invalid, operational
failure, and unknown states distinctly instead of collapsing them.

