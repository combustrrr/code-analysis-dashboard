# Using the code-analysis application

Open the [dashboard](https://combustrrr.github.io/code-analysis-dashboard/) and sign
in with GitHub. Accepted collaborators of the service repository may view it;
scan and configuration permissions are checked separately. Both themes are supported.

1. Select the source project and branch/PR/manual target. The persistent header
   identifies source and execution repositories, discovered/analyzed SHA, timestamps,
   completeness and producer links. Older visible findings retain their original SHA.
2. Run analysis opens one form, not a wizard. Choose branch, PR or full 40-character
   commit SHA and submit. Readiness is optional to expand. Configuration is not proof
   of successful scanner execution. Follow request, scanner and publication progress;
   the newly published selected target opens automatically.
3. Overview shows severity/scanner distributions, affected directories and cautious
   investigation suggestions. No invented quality score or proven-root-cause claim.
4. Issues combines text, severity, scanner, rule, file, directory, source-location
   and scanner-overlap filters. Selectors are searchable where useful. Clear filters
   resets the selection; overview shortcuts clear unrelated filters. Group by rule,
   scanner, file or directory. Open an issue for explanation, source line highlighting,
   immutable GitHub links and supporting observations. Shared rules/locations mean
   related findings, not proof that one fix resolves the entire group.
5. Scanners shows usable evidence, unavailable/setup-required channels, execution
   failures and deferrals separately from source findings. Unknown counts are not zero.
6. Connections verifies the selected project through the live project-integration
   API, including App access and both workflows. An unavailable check disables its
   launch shortcut. Successful routing does not prove all scanners completed.
7. Repositories loads accessible execution repositories. Scan-only users can inspect
   projects; administrators can preview setup/configuration and explicitly confirm
   exact commits. Editing the source invalidates a prior preview. Errors support retry.

Results refresh from published data, not directly from partially written scanner
outputs. The static UI is not rebuilt for a report. Current assets are retained per
active target, not per historical commit. See [architecture](SERVICE_ARCHITECTURE.md)
and [handoff](../HANDOFF.md) for boundaries and remaining verification.
