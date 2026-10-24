# Documentation governance

Status: **Active**

Owner: maintainers of `combustrrr/code-analysis-dashboard`

This guide defines where documentation belongs, what is authoritative, and how it is
kept useful as the service changes.

## Information architecture

| Directory | Question answered | Content lifecycle |
|---|---|---|
| `docs/current/` | What does the deployed product do now? | Updated with behavior changes |
| `docs/architecture/` | How is the system structured and where are its boundaries? | Updated when responsibilities or data flows change |
| `docs/decisions/` | Why was a consequential technical choice made? | Append-only ADRs; supersede rather than rewrite |
| `docs/operations/` | How do operators deploy, recover, rotate, and validate it? | Tested runbooks |
| `docs/governance/` | What policies and contribution rules apply? | Reviewed with policy changes |
| `docs/roadmap/` | What might be built later? | Proposals only; never evidence of deployment |

`docs/MIGRATION.md` remains the stable deployment-boundary entry point. It summarizes and
links; it must not become the only location of a contract.

## Document types

### Explanation

Architecture documents describe stable responsibilities, interactions, and tradeoffs.
They exclude deployment run IDs and chronological release narration.

### Reference

Current-state and integration documents define schemas, endpoints, statuses, limits,
and supported behavior. Reference text must distinguish deployed behavior from plans.

### Runbook

Operations documents contain prerequisites, safe commands, expected results, rollback,
and verification. A runbook is incomplete if it only describes the happy path.

Runbooks describe repeatable procedures. They do not retain completed run IDs, pull
request numbers, dated validation narratives, or personal activity logs. That evidence
belongs in the relevant change, pull request, release, or workflow record.

### Architecture decision record

An ADR records one consequential decision, its context, considered options, result, and
consequences. Accepted ADRs are historical records. Create a new ADR to supersede one.

## Source-of-truth rules

1. Code and generated workflow audits are authoritative for implementation behavior.
2. `SYSTEM_OVERVIEW.md` is authoritative for stable system boundaries.
3. ADRs are authoritative for why major architecture choices were accepted.
4. `PRODUCTION_READINESS.md` is authoritative for acceptance state and known exceptions.
5. Operations guides are authoritative for supported operator procedures.
6. Roadmap documents cannot be cited as evidence of availability.
7. A document must link to the more authoritative source instead of copying it.

## Required metadata

New architecture, governance, and decision documents include:

- a clear title;
- status (`Proposed`, `Accepted`, `Superseded`, `Deprecated`, or `Authoritative`);
- last-reviewed or decision date;
- owner when operational responsibility matters;
- links to related contracts, tests, or runbooks.

## Change triggers

Update documentation in the same change when any of these occurs:

- an API, schema, route, lifecycle state, or user workflow changes;
- a trust boundary or credential scope changes;
- a storage backend, retention rule, or size limit changes;
- analysis admission, concurrency, recovery, or publication behavior changes;
- a workflow is added, generated, retired, or changes authority;
- an operational prerequisite, rollback, or verification command changes;
- a major architectural decision is accepted or superseded.

## ADR workflow

1. Copy [the ADR template](../decisions/0000-template.md).
2. Use the next four-digit number and a short kebab-case name.
3. Begin as `Proposed` when discussion remains open.
4. Record viable alternatives and real consequences, not a retrospective sales pitch.
5. Change status to `Accepted` only with the implementation or explicit approval.
6. Never edit an accepted decision to imply a different historical choice.
7. To change direction, add a new ADR with `Supersedes: ADR-NNNN` and mark the old ADR
   `Superseded by ADR-NNNN`.

## Review checklist

- Is the document in the correct directory?
- Does it describe current behavior, a decision, a runbook, or a proposal unambiguously?
- Does it avoid secret values and unredacted detected credentials?
- Does it preserve exact repository, SHA, workflow run, attempt, and tooling provenance?
- Are diagrams consistent with the prose and implementation?
- Are commands safe, scoped, and accompanied by expected outcomes?
- Are links relative and valid?
- Is duplicated content replaced with a link to one source of truth?
- If behavior changed, were the relevant tests and operational guide updated?

## Naming conventions

- Use uppercase descriptive names for established reference documents where existing
  links depend on them.
- Use lowercase kebab-case for new ADR filenames after their numeric prefix.
- Prefer one subject per document.
- Avoid filenames such as `notes.md`, `new.md`, `final.md`, or date-only names.

