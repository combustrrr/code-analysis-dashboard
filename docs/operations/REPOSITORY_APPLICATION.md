# Fixed-host repository application

The repository-mode dashboard uses one fixed execution host:
`combustrrr/code-analysis-dashboard` (repository ID `1360051890`). The Worker exposes
its authenticated `/api/projects` route to read the three configured public targets from
`.github/code-analysis/projects.json` using the centrally installed GitHub App. Target
identities are validated against `analysis-launcher/target-registry.mjs`; an incomplete
or mismatched registry fails closed instead of silently listing a partial catalog.

The configured targets are Kavach-AgenticSOC (`1267340546`, `observer`), this service's
self-analysis project (`1360051890`, `connected`), and Agentic-Kibana (`1278177697`,
`observer`). Preferred branches and project profiles are kept in the versioned registry.
Only the connected self-analysis target may publish native findings back to its source.
The execution repository is also the Actions and Release queue host for every target.

## Access roles

- A current service-repository collaborator with `pull` access can list, select, and
  inspect configured targets and reports.
- `push` access on the fixed execution repository is required to submit an analysis
  request. Target selection and report refreshes are read-only.
- `admin` access is required for configuration changes. Profiles are maintained in the
  trusted, versioned project registry; the dashboard has no arbitrary-repository setup
  or per-user GitHub App installation flow.
- Report visibility is separately controlled by `REPORT_ACCESS`. Its default is
  `collaborators`; disabling dashboard-wide viewer verification never makes private
  report endpoints anonymous.

Worker project and report routes are bound to the execution repository and configured
project IDs. A caller cannot select another execution repository or substitute a
source repository in a URL. The project registry endpoint is authenticated; anonymous
report visibility, if deliberately enabled, does not expose the project list or grant
launch/setup capabilities.

## Execution and storage

Source execution is isolated in GitHub Actions jobs against immutable source SHAs.
Scanner jobs receive no publication credentials. Trusted validation and publishing run
separately and preserve source, execution host, workflow run, attempt, and tooling
provenance. The service App is installed only on the fixed execution host; never install
it on an upstream/source repository as part of dashboard onboarding.

Cloudflare R2 stores current reports and the temporary producer-artifact broker prefix;
temporary objects use a one-day lifecycle. GitHub Releases retain the bounded request
queue and Cloudflare KV stores service state. No database or VM is provisioned. Public
GitHub Actions artifacts remain publicly accessible even when dashboard reports are
protected; private artifact handling is a separate workstream.

## Authorization credentials

The Worker omits the OAuth `scope` query parameter. The signed-in user's token provides
identity and is used for repository permission checks and explicit launch requests. A
repository-scoped central App token reads the fixed-host registry and workflow readiness,
checks collaborator membership, and reads reports. Secrets remain in Cloudflare Worker
bindings and are never sent to the UI, source jobs, public reports, or logs.
