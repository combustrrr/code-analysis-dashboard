# Using the code-analysis application

Open the [dashboard](https://combustrrr.github.io/code-analysis-dashboard/) and sign
in with GitHub. Accepted collaborators of the service repository may view it;
scan and configuration permissions are checked separately. Both themes are supported.
The landing page and signed-in shell use a calm evidence palette: Ink and Slate surfaces,
Trust Blue navigation and actions, Evidence Teal completion, and Attention Amber for
incomplete coverage. Light mode uses Paper surfaces without changing status meaning.
Manrope is bundled for interface copy, Sora is used for headings, and IBM Plex Mono is reserved for immutable
identifiers.

1. Projects is the only signed-in home. Its compact summary shows active analyses,
   projects needing attention, and the last refresh; each of the three cards shows
   repository relationship, preferred branch, one of the four public lifecycle states,
   current SHA, evidence age, channel coverage, limitations, and Review evidence plus
   Configure analysis or View progress actions. There is no Activity route or API.
2. Select one of the three configured source projects. The project overview distinguishes
   the current source-only report from an optional separately retained PR overlay and
   shows compact readiness, active work, source/analyzed SHA, and timestamps. Opening a
   project or browsing revisions is read-only.
2. Authorized collaborators use **Fast analysis** for the latest preferred-branch SHA and
   safe defaults, or **Configure analysis** to enter a full 40-character commit SHA first.
   Branch and open-PR selection, including drafts, is available as a fallback.
   Configured analysis then chooses scanner producer groups.
   Portable channels are selected by default; vendor lanes are opt-in. Shared producer
   groups must be selected together. Disabled channels explain whether they are deferred,
   unavailable, not applicable, or require setup. CodeRabbit is available only for an
   open PR.
3. **Review exact revision** resolves the branch/PR/SHA server-side and displays the full
   immutable SHA, fork head and base provenance where applicable, selected channels,
   readiness, matching cached evidence, and the GitHub Actions/vendor usage caveat. No
   work starts until **Confirm and start analysis**. A moved branch or PR invalidates
   the preview; refresh it rather than silently retargeting. **Run again** explicitly
   forces selected channels instead of reusing matching evidence.
4. Follow request, producer, and per-channel progress through **Preparing**, **Analyzing**,
   **Ready**, or **Needs attention**. A 202 means accepted/preparing, never completed.
   Different projects, revisions, and selected scanner lanes may execute concurrently;
   active project/SHA duplicates merge missing channels. `NOT_SELECTED`, `NOT_APPLICABLE`,
   `DEFERRED`, failures, and validated completion are separate states. Same-SHA results
   replace only successfully validated selected-channel evidence; failed attempts do not
   erase the previous valid evidence.
5. The source-only report remains one current report per configured repository. A new SHA
   replaces it only after the first valid channel result; preparing/analyzing work and failures
   preserve the prior report and its SHA. PR review evidence is stored in a separate
   current overlay keyed by project, PR, head repository/SHA, base SHA, tooling, and
   profile; it is never merged into source-only findings. Readers can inspect reports;
   only writers can submit, and no cancel control is provided.
3. Overview places report-derived visual evidence near the top: actionable severity and
   category bars, scanner completion, scanner-overlap composition, and affected-directory bars, followed by
   cautious investigation suggestions. Empty values remain zero or unavailable exactly
   as reported. No invented quality score or proven-root-cause claim.
4. Issues combines text, severity, category, scanner, rule, file, directory, source-location
   and scanner-overlap filters. Selectors are searchable where useful. Clear filters
   resets the selection; overview shortcuts clear unrelated filters. Group by rule,
   scanner, category, file or directory. Filters remain in the project URL. Open an issue for explanation, source line highlighting,
   immutable GitHub links and supporting observations. Shared rules/locations mean
   related findings, not proof that one fix resolves the entire group.
5. Scanners shows usable evidence, unavailable/setup-required channels, execution
   failures and deferrals separately from source findings. Unknown counts are not zero.
6. Connections verifies the selected project through the live project-integration
   API, including App access and both workflows. An unavailable check disables its
   launch shortcut. Successful routing does not prove all scanners completed.
7. Repositories lists only the fixed trusted projects. Authorized collaborators can inspect
   reports, preview revisions, and explicitly submit; administrators alone
   manage the central registry. The connected self-analysis target does not publish native
   findings back to its source repository.

Results refresh from published data, not directly from partially written scanner
outputs. The static UI is not rebuilt for a report. Matching channel evidence is reused
unless the user selects **Run again**. Superseded full-SHA assets are removed only after
the replacement manifest is committed. Scheduled reconciliation recovers accepted
requests but never starts scans from discovered refs. Source-executing jobs receive no
vendor/publication credentials, and no findings, comments, checks, SARIF, commits, or PRs
are written to any source. GitHub Actions artifacts in the public service repository
remain publicly accessible outside the signed-in dashboard. See
[architecture](../architecture/SERVICE_ARCHITECTURE.md) and [handoff](../HANDOFF.md) for
deployment boundaries and verification status.
