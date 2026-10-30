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
Native feedback is disabled for observer and connected self-analysis targets alike. The
later configured-source policy supersedes the earlier sign-in rollout's connected-only
feedback allowance: no findings, checks, SARIF, comments, commits, or pull requests are
written to any analyzed source. The execution repository is also the Actions and Release
queue host for every target.

## Access roles

- A current service-repository collaborator with `pull` access can list, select, inspect,
  and explicitly launch analysis for configured targets.
- Target selection and report refreshes are read-only and never submit a request.
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

## Project register contract

`GET /api/projects` returns `project-register-v1` and the same registry is embedded in
`auth-bootstrap-v1`. Each entry carries full published and preferred-branch SHAs, a
seven-character display revision, a `MATCHED`, `BEHIND_HEAD`, `UNKNOWN_REVISION`, or
`UNVERIFIABLE` comparison, typed branch/evidence/activity diagnostics, and route-neutral
actions. Action precedence is active progress, unavailable-provider retry, stale-report
analysis plus prior evidence, current evidence review, then first analysis. The Worker
uses SHA equality only; it does not issue GitHub compare requests or claim commit-behind
counts.

The register performs one bounded Durable Object recent-queue read and concurrently
settles branch-head and lightweight private-R2-manifest reads. A failed provider marks
only the affected diagnostics as temporarily unavailable and preserves healthy sibling
projects. No findings, report bodies, scanner logs, or commit messages are returned by
this endpoint. Legacy capability fields remain during the compatibility period; removal
requires all deployed Pages assets to decode `project-register-v1` and production
telemetry to show no legacy consumers.

New launch admissions are transactionally limited in the existing Durable Object to
three per authenticated GitHub user in a rolling minute. Idempotency is checked first,
so retrying the same key returns its original request without consuming quota. A limited
request receives HTTP 429, `Retry-After`, and `launch_rate_limited`. Existing duplicate
project/SHA admission controls and queue fencing remain authoritative.

## Execution and storage

Source execution is isolated in GitHub Actions jobs against immutable source SHAs.
Portable source-executing jobs receive no vendor or publication credentials. Opt-in
vendor scanners consume a short-lived source snapshot produced by a separate
credentialless checkout job; credentialed vendor jobs cannot check out the repository
or run project-controlled setup/test commands. Trusted validation and publishing run
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
