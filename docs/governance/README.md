# Governance

Policies that define how the service and its documentation are changed safely.

| Topic | Document |
|---|---|
| Documentation ownership, lifecycle, and ADR process | [Documentation governance](DOCUMENTATION.md) |
| Architecture decisions | [ADR catalog](../decisions/README.md) |
| Repository onboarding boundaries | [Repository application](../operations/REPOSITORY_APPLICATION.md) |
| Production acceptance | [Production readiness](../operations/PRODUCTION_READINESS.md) |
| Source ownership boundary | [Upstream synchronization](../architecture/UPSTREAM_SYNC_BOUNDARY.md) |
| Credentials and rotation | [Secret management](../operations/SECRET-MANAGEMENT.md) |

Configured product repositories are read-only in the current service. Branch protection
is never bypassed. Independent external-owner onboarding is not live-proven until its
identity, permission, scanner, publication, and recovery acceptance gates pass.
