---
title: Scanner maintenance
description: Independent scanner adapters and validated dependency updates.
---

# Adding scanners and keeping them current

Each scanner is an independent producer. Adding a channel does not require a new
dashboard page, a fixed scanner enum, or changes to the other scanner adapters.
The existing finding and observation contract remains the dashboard interface.

## Add a channel

1. Copy `config/code-analysis/scanner-extension.example.json` into a new entry in
   `scanner_extensions` in `config/code-analysis/service.json`. Use a unique
   `ext-...` channel and scanner name. Commit the entry with its trusted adapter.
2. Implement the adapter under `scripts/code_analysis/adapters/`. The JSON and
   SARIF examples demonstrate the result contract. Accept `--request`, `--output`,
   and, for source scanners, `--source`. Pin installation dependencies.
3. Source adapters run on an exact checkout without vendor or publishing secrets.
   Vendor adapters run separately and must verify the export'"'"'s actual revision.
   They must not execute code from the source repository.
4. Emit a result with source repository, source SHA, status, reason, and findings.
   Each finding has rule ID, explanation, severity, file, and line; include native
   IDs and tool/ruleset versions where supplied by the scanner. Never invent them.
5. Run `python -m scripts.code_analysis.generate_source_workflow`, the extension
   tests, and workflow policy checks. Commit the config, adapter, and generated
   workflows together. Validate a real branch and an applicable PR before claiming
   the channel is operational.

Each extension gets its own job, timeout, artifact, and private working directory.
An adapter crash, timeout, missing result, malformed result, or wrong revision is
reported for that channel. Healthy sibling evidence remains publishable. A rerun
cannot borrow the adapter'"'"'s old output. Vendor checks unavailable through a plan
or credential stay unavailable; they are not silently deferred.

There is no application-maintained fixed list of extension slots. This is not
unlimited compute or storage: GitHub workflow/runner limits, vendor quotas, the
50 MB per-envelope bound, and the 900,000,000-byte current-report budget per project still
apply. Large inventories may need batched workflows or sharded adapter output;
those are capacity changes, not extra UI implementations.

## Automatic maintenance

`13-scanner-updates.yml` reconciles dependencies daily and can be run manually.
It uses self-hosted Renovate on Actions; no hosted Renovate account is required.
It groups the available scanner changes into one update PR, keeps exact pins,
ignores unstable releases, and waits three days after a release. Failed checks leave current pins
and current reports in place. A failure to check for updates is an Actions failure,
not evidence that the scanners are current.

Coverage includes scanner Actions, `.ci` Python requirements, authoritative workflow
templates, inline pinned Python scanner packages, service-owned JavaScript tools,
Snyk CLI, Gitleaks images, and Scorecard and TruffleHog releases. Scorecard and
TruffleHog updates fetch their official release checksum and retain verification at
installation. Generated workflows, portable action constants, and generator action
constants are synchronized in the same PR. Future scanner pins must be added to an
existing dependency pattern or a new Renovate manager plus compatibility test.
SaaS-owned engines update at the provider. Source-owned ESLint/TypeScript
versions follow the selected repository'"'"'s lockfile; the service does not rewrite
upstream dependencies to force a newer compiler.

`14-scanner-compatibility.yml` runs service/extension regression tests, workflow
checks, and native-output canaries with read-only permissions and no scanner or
publication secrets. Stable major, minor, patch, digest, and pin updates can
auto-merge only after that required check and every other branch protection passes.
The grouped PR makes the exact scanner stack the unit that is tested and promoted.
Add a scanner's real compatibility test before registering its pin for automatic merge.
Passing tests reduces upgrade risk; it cannot guarantee that arbitrary future
scanner versions or source projects will never break.

### One-time updater access

Set `SCANNER_UPDATE_TOKEN` in the analysis host, scoped to that repository only.
Use a fine-grained token with Contents, Pull requests, Workflows, Issues, and Commit
statuses read/write; metadata, checks, and Administration read access. The default
branch must require the `Scanner compatibility` check. The updater verifies this
protection before doing any work, and Renovate waits for all checks to pass.
The token belongs only to the trusted updater job, never scanner execution or the
browser. The workflow explicitly fails with setup guidance while this is absent.
The default `GITHUB_TOKEN` cannot provide the required workflow-editing access.

Official references:
[Renovate GitHub permissions](https://docs.renovatebot.com/modules/platform/github/),
[custom dependency managers](https://docs.renovatebot.com/modules/manager/regex/),
[automatic merge checks](https://docs.renovatebot.com/key-concepts/automerge/).

To recover a bad upgrade, revert its maintenance PR in the analysis host and request
a fresh scan. The new tooling revision preserves attribution; never relabel a
previous report as though it came from the reverted scanner version.

Portable scanner pins in portable_workflow.py and repository project commands are now included. Regeneration includes both reusable source workflows (11-source-analysis.yml, 12-scanner-diagnostics.yml). SCANNER_UPDATE_TOKEN was configured and verified on 2026-09-11: updater run 34627221312 succeeded and opened update PRs #10 and #11. Required Scanner compatibility branch protection is configured. Merged dependency changes must also be promoted through a tested immutable tooling revision before existing installations execute them.

## Generated source workflows

`11-source-analysis.yml` and `12-scanner-diagnostics.yml` are generated by
`python -m scripts.code_analysis.generate_source_workflow`. Do not edit these files
by hand; they are regenerated from the non-runnable scanner recipes under
`config/code-analysis/workflow-templates/` and the extension registry. The generator
header in each file identifies the source script.

The generator also produces reusable workflows `reusable-source.yml` and
`reusable-source-full.yml` used by portable profile execution.

## Adoption of validated tooling

15-tooling-rollout.yml validates trusted main with scanner tests and canaries, then proposes an exact tooling-pin PR. A main tooling change or daily reconciliation merges only matching managed files after exact-head Scanner compatibility and remaining branch protections pass. Stale rollout branches are compared with current main and refreshed before their checks are trusted. No default-branch force updates are used. The publisher uses the maintenance token separately from scanner validation. Main advancing during validation postpones promotion. New connections read the adopted revision from the service profile rather than requiring a Worker redeploy. Existing external execution repositories keep their own reviewed pins; this instance currently hosts all three projects itself.

Latest adoption proof: run 40098798215 validated the scanner stack and PR #92
promoted it automatically; the active verified pin is
7c1fee8832abe75999f3c1a2fd6f97c832ec479e. Updater run 40098811583 then
extracted 183 managed dependencies and created the grouped update PR #93. Consult the
[handoff](../HANDOFF.md) and live profile for current evidence. Registration must be
wired into the selected execution profile and reusable producer, not only a legacy
catalog entry. Missing adapters remain setup_required; UI rendering is generic.
## Generated workflow parity

`11-source-analysis.yml` and `12-scanner-diagnostics.yml` are generated by
`python -m scripts.code_analysis.generate_source_workflow`; do not edit them by
hand. The generator output must remain byte-for-byte equal to the checked-in
files, enforced by `test_portability.py` and `test_scanner_access.py`.

The built-in credentialless community jobs live in
`scripts/code_analysis/community_workflow.py`. Their versions are pinned alongside
their evidence-conversion code. They must remain source-only, carry no secret
references, and upload a scanner-family status document even when the valid native
report contains zero findings. Regenerate workflow 11 and both reusable source
workflows after changing these jobs. Workflow 12 remains vendor-diagnostics-only.

The reusable workflows are generated separately by
`python -m scripts.code_analysis.generate_reusable_workflows`:
`reusable-source.yml` (portable) and `reusable-source-full.yml` (full profile).
Regenerate both sets after changing scanner workflows, profiles, or extensions,
inspect the complete diff, and run the relevant parity checks before claiming a
workflow change is live.
