# GitHub Automation

Workflow ownership is grouped by responsibility:

- `01`-`04`: baseline quality, security, dependency, and health checks.
- `05`-`10`: aggregation, canaries, discovery, and reconciliation.
- `11`-`12`: generated source-analysis and diagnostics workflows.
- `13`-`15`: scanner updates, compatibility, and tooling promotion.
- `16`-`24`: optional scanner producers.
- `reusable-*.yml`: immutable workflow implementations referenced by installed wrappers.
- `pages.yml`: static UI build and publication.

Generated workflows must be regenerated from the Python generator. Workflow changes
must preserve source isolation, credential separation, exact provenance, and branch
protection.
