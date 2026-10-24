# Architecture decision records

Architecture decision records explain why the system is built this way. They complement
the [system architecture](../architecture/SYSTEM_OVERVIEW.md), which describes the
current structure.

| ADR | Status | Decision |
|---|---|---|
| [ADR-0001](0001-external-analysis-service.md) | Accepted | Operate analysis as an external service |
| [ADR-0002](0002-immutable-source-and-tooling.md) | Accepted | Bind analysis to immutable source and tooling identities |
| [ADR-0003](0003-isolated-scanner-credentials.md) | Accepted | Separate source execution, vendor access, and publication authority |
| [ADR-0004](0004-durable-concurrent-analysis.md) | Accepted | Use durable admission, parallel scanner lanes, and fenced publication |
| [ADR-0005](0005-r2-current-report-storage.md) | Accepted | Store current report assets in Cloudflare R2 |
| [ADR-0006](0006-github-oauth-and-server-sessions.md) | Accepted | Use GitHub OAuth with opaque server-side sessions |

Use [ADR-0000](0000-template.md) as the template for new decisions. Follow the process
in [documentation governance](../governance/DOCUMENTATION.md).
