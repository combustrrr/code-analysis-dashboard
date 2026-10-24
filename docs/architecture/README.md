# Architecture

Start with [System architecture](SYSTEM_OVERVIEW.md). It is the authoritative map of
runtime components, trust boundaries, request flow, concurrency, storage, and failure
behavior.

## Architecture documents

| Scope | Document | Role |
|---|---|---|
| Whole system | [System overview](SYSTEM_OVERVIEW.md) | Authoritative architecture entry point |
| Workflow topology | [Workflow architecture](WORKFLOWS.md) | Active workflows, authority, concurrency, and generation |
| Repository structure | [Repository layout](repository-layout.md) | Code ownership and dependency direction |
| Data classification | [Data handling inventory](DATA_HANDLING_INVENTORY.md) | Data, credentials, artifacts, and retention boundaries |
| External systems | [Integrations](INTEGRATIONS.md) | Scanner, GitHub, and repository integration catalog |
| Source ownership | [Upstream boundary](UPSTREAM_SYNC_BOUNDARY.md) | Inspection versus authorized upstream changes |
| Storage migration | [R2 migration RFC](R2_ARTIFACT_MIGRATION_RFC.md) | Migration design and compatibility constraints |
| Scanner model | [OWASP SAST architecture](OWASP_SAST_ARCHITECTURE.md) | SAST-specific blueprint |

For architectural reasoning, see the [ADR catalog](../decisions/README.md). For deployment
acceptance and known limitations, see [Production readiness](../operations/PRODUCTION_READINESS.md).
