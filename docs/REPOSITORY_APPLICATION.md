# Repository application and current instance

Current implementation is deployed. See [handoff](HANDOFF.md) for evidence and
[architecture](code-analysis/SERVICE_ARCHITECTURE.md) for execution/storage contracts.
The present instance is restricted to accepted service-repository collaborators and
three configured projects. It is not accepted as unrestricted public self-service.

Repositories lists accessible public execution repositories. Scan users may inspect
configured projects; repository administrators may review installation or configuration
previews and confirm exact managed file commits. App access is checked again for
mutations. Protected branches are not bypassed. Source changes invalidate previews;
configuration errors preserve a retry path. The shared implementation stays here;
wrappers and trusted profiles reference immutable tooling.

Repository IDs identify execution/source projects. Source-only observer projects do
not write to the source; connected projects can publish correctly attributed native
checks and supported SARIF. The current service App is installed only here. Do not
reinstall analysis workflows in the Agentic SOC product fork or upstream.

The Worker provides repository listing, project inspection/readiness/integration,
reviewed setup/configuration, target validation, launch, activity and report access.
Source execution is isolated from write/vendor tokens. Owner launch and report
round-trip are proven; another source layout was tested read-only, not through an
independent owner's App installation. Parking monitoring has since been removed.

GitHub Release assets are the only durable queue/report store. Cloudflare supplies
authentication and API delivery; no D1/R2/VM/database was provisioned. Free services
may be used within their limits; do not enable paid subscriptions automatically.
See current vendor dashboards for quotas before changing infrastructure.
