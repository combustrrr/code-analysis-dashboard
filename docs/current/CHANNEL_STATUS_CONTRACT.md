# Channel status contract

Status: **Authoritative for scanner completion, reuse, publication, API, and UI semantics**

The versioned machine-readable contract is
[`config/code-analysis/channel-status-contract.json`](../../config/code-analysis/channel-status-contract.json).
Python service code, the Cloudflare Worker API, the React application, and the offline
Issue Wall consume that contract. Unknown future provider states fail closed as
incomplete evidence.

## Completion boundary

Only these states prove retained evidence for the exact source and tooling context:

| Status | Complete | Reusable | May replace same-SHA channel evidence |
|---|---:|---:|---:|
| `COMPLETED` | yes | yes | yes |
| `COMPLETED_OPTIONAL` | yes | yes | yes |
| `CONFIGURED_COMPLETE` | yes | yes | yes |
| `POLICY_FINDINGS` | yes | yes | yes |

Findings do not make `POLICY_FINDINGS` incomplete: the scanner completed and retained
actionable evidence. A zero count is known only for a completed state with a retained
measured result.

SonarQube Cloud may use `CONFIGURED_COMPLETE` only when scanner submission, successful
compute processing, exact-revision verification, and bounded native issue export all
succeed. A failed scan or absent/failed native export keeps findings unknown and
publishes an operational or invalid-evidence reason; submission alone is not completion.

## Non-completion states

- `PARTIAL` and `CONFIGURED_PARTIAL` retain usable evidence but remain incomplete.
- Unavailable, permission, setup, invalid, operational-failure, rate-limit, timeout,
  cancellation, and truncation states remain incomplete and are never reusable.
- `NOT_APPLICABLE`, `DEFERRED`, and `NOT_SELECTED` mean the lane did not run for the
  current request. They are not completion evidence, are not reusable, and cannot
  replace previously completed same-SHA evidence.
- Every not-run state requires a stable reason. A reasonless not-run record makes the
  report incomplete instead of silently disappearing from coverage.
- Every incomplete state requires a user-facing reason. Retained coverage from a failed
  or timed-out test command is `INVALID_EVIDENCE`, keeps the test exit provenance, and
  reports an unknown finding count while healthy sibling scanner results remain visible.
- Any unrecognized status is incomplete, non-reusable, and replacement-ineligible.

## Operational behavior

Admission and caching schedule every selected lane whose matching evidence is not in a
complete state. Same-SHA merging replaces only selected channels with newly completed
evidence and preserves healthy siblings when another selected channel is partial,
unavailable, failed, or not run. Publication requires at least one selected channel to
produce complete evidence; otherwise the prior current report is preserved.

The API and UI count complete, incomplete, and not-run states separately. Not-run states
with reasons may leave the overall report current, but they never increase its completed
count. Operators must inspect each channel's raw status and reason rather than inferring
coverage from the workflow conclusion.

## Verification

Contract tests enumerate every declared status in Python, Worker, and frontend suites.
Repository-service tests cover cache planning, shared producer groups, same-SHA merge,
and healthy-sibling preservation. Unknown-state and missing-reason fixtures prove the
contract fails closed.
