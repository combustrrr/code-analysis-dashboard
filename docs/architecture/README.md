# Architecture

Architecture, storage, data-handling, and integration contracts.

| Topic | Document |
|---|---|
| Service boundaries and data flow | [Service architecture](SERVICE_ARCHITECTURE.md) |
| Data handling and retention | [Data handling inventory](DATA_HANDLING_INVENTORY.md) |
| Integrations | [Integrations](INTEGRATIONS.md) |
| R2 artifact migration | [R2 migration RFC](R2_ARTIFACT_MIGRATION_RFC.md) |
| OWASP SAST blueprint | [OWASP architecture](OWASP_SAST_ARCHITECTURE.md) |
| Workflow catalog | [Workflows](WORKFLOWS.md) |

The deployed path uses GitHub Actions for scanner execution, Cloudflare Workers for
authentication/API delivery, and Cloudflare R2 for current reports and temporary
producer artifacts.
| Upstream synchronization | [Inspection boundary](UPSTREAM_SYNC_BOUNDARY.md) |
| Upstream synchronization | [Inspection boundary](UPSTREAM_SYNC_BOUNDARY.md) |
