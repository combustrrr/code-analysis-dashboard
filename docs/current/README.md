# Current Implementation

Authoritative current-state material for the deployed service.

| Topic | Document |
|---|---|
| Stable system architecture | [System overview](../architecture/SYSTEM_OVERVIEW.md) |
| Architecture decisions | [ADR catalog](../decisions/README.md) |
| Acceptance limitations | [Production readiness](../operations/PRODUCTION_READINESS.md) |
| Application usage | [Monitoring UI](MONITORING_UI.md) |
| Launch flow | [Authenticated launching](AUTHENTICATED_LAUNCHING.md) |
| Threat reports | [Threat reports](THREAT_REPORTS.md) |
| Community health | [Community health configuration](COMMUNITY_HEALTH.md) |

The checked-in project registry targets `ARYDESTROYER/Kavach-AgenticSOC`,
`combustrrr/Agentic-Kibana`, and `combustrrr/code-analysis-dashboard`. Read-only launch and storage boundaries are
documented in [the operations runbook](../operations/READ_ONLY_ANALYSIS.md). Do not
infer support for future roadmap items from implementation documents.

Stable design rules belong in architecture documents or ADRs. Deployment acceptance
and known limitations belong in production readiness; operator procedures belong in runbooks.
