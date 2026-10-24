# Operations

Runbooks and maintenance procedures for the deployed service.

| Topic | Document |
|---|---|
| Free-tier limits and diagnostics | [Free services](FREE_SERVICES.md) |
| Dashboard access | [Dashboard access](DASHBOARD-ACCESS.md) |
| Repository setup and launch | [Repository application](REPOSITORY_APPLICATION.md) |
| Scanner maintenance | [Scanner maintenance](SCANNER-MAINTENANCE.md) |
| Secret management and rotation | [Secret management](SECRET-MANAGEMENT.md) |
| Portable profiles | [Portable profiles](PORTABLE_PROFILES.md) |
| Read-only analysis workflow | [Read-only analysis](READ_ONLY_ANALYSIS.md) |
| Deployment migration history | [Migration](../MIGRATION.md) |
| Known limitations | [Limitations](LIMITATIONS.md) |

Never log credentials, source secrets, raw findings, or session contents. Preserve
exact source SHA, target, workflow run, attempt, and tooling provenance.

Every new runbook must state prerequisites, exact scope, safe actions or commands,
expected results, failure handling, rollback, and post-change verification. Architectural
rationale belongs in an [ADR](../decisions/README.md), not inside a procedure.
