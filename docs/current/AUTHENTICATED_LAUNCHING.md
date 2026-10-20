# GitHub authentication and direct analysis launch

The deployed application has one repository-service mode; discovery workflow 10 no longer exists.
The [Worker](https://code-analysis-launcher.icsarthak9.workers.dev) handles login,
viewer authorization, fixed-host APIs, explicit launch requests and report delivery.
`combustrrr/code-analysis-dashboard` is the only execution host for the three trusted
project-registry entries. Users do not choose or install an execution repository.

Users sign in to **Projects**, the only workspace home. It contains the three fixed
projects, aggregate Preparing/Analyzing/Needs-attention counts, last refresh time, and
each project's current evidence state. Opening Projects or a project remains read-only.
Developers see product-level progress only: Preparing, Analyzing, Ready, or Needs attention.
Coordinator runs, lease state, scanner job
links, and individual channel scheduling remain operational details. The exact selected
revision remains visible throughout.
On a project, **Fast analysis** is the one-click path: one action asks the Worker to resolve the
configured preferred branch, apply trusted default channels, verify current collaborator access,
and start the exact SHA. The retained report stays visible while the request is active.
**Configure analysis** opens a three-step flow that asks for a full commit SHA first and
offers branch or pull-request selection as a fallback. It supports safe defaults, individual
producer groups, or all currently available channels. Selecting vendor channels requires
an explicit usage confirmation before preview and submission. The immutable-SHA review is
the final confirmation boundary. The Worker
checks collaborator access and transactionally persists an immutable `analysis-request-v4` envelope in the SQLite-backed Durable Object with source
and fork identities, original/resolved selection, pinned SHA, optional PR context,
requested channels, tooling/profile digests, actor, and idempotency key. A 202 means
accepted/preparing, never scanner completion. Retries with the same idempotency key return
the existing durable request.

The canonical client routes are `#/projects`, `#/projects/:projectId`,
`#/projects/:projectId/issues`,
`#/projects/:projectId/report`, `#/projects/:projectId/run`, and global
`#/settings?section=<section>&project=<optional-id>`. No retired query-hash, dashboard,
custom-run, Activity, or project-settings route implementation remains. Unsupported
hashes, including legacy `#/activity`, fall through to Projects. Settings owns
General, Projects, Connections & readiness, and Evidence provenance; read-only values
remain informational. The GitHub configuration history link is visible only when current
access includes `can_configure`.

The Durable Object starts accepted project/SHA analyses immediately. Different projects and
revisions may run concurrently; active duplicates merge only missing channels. Selected channel
producers run concurrently and independently fenced claims remain active until their lanes are
terminal. The Worker signals the coordinator after admission or channel expansion. The 15-minute
schedule is recovery-only. Separately, `preferred-branch-analysis.yml` proactively
refreshes all three trusted preferred branches every six hours and requests all configured,
applicable branch channels. `code-analysis-coordinator.yml` claims exact unclaimed channels,
invokes reusable jobs, and serializes publication per project. GitHub Releases are not used for
admission. A missing optional normalized-findings directory does
not fail an otherwise completed scanner lane, while required raw evidence and assembled
reports still fail closed when absent. Each lane
checks out the same immutable SHA. Matching channel evidence is reused automatically.
Same-SHA publication replaces only successfully
validated selected channels; other statuses remain distinct, including `NOT_SELECTED`,
`NOT_APPLICABLE`, `DEFERRED`, and failure. Keep one current source-only report per
configured project and one separately keyed PR overlay (project, PR, head repository/SHA,
base SHA, tooling, profile). Source-only report replacement waits for the first valid
new-SHA channel result; failures preserve the previous report.
Each project has one reviewed source-execution profile: `agentic-soc` channels are labelled
**configured**, while the self-analysis profile is labelled **portable**. Those source
channels fan out together with separately isolated vendor lanes when the user selects all
available channels. Deferred, setup-required, revision-inapplicable, and credential-withheld
channels remain visible but are not counted as selectable or silently submitted.
The coordinator heartbeat renews the fenced lease once per minute and exits when terminal
completion invalidates that lease, so a published Actions run should not remain visibly active
for more than one renewal interval solely because of its heartbeat job.

## Dashboard sign-in and report visibility

GitHub sign-in is a same-tab redirect. The Worker validates OAuth state and PKCE,
checks the immutable user ID and current collaborator membership on every protected
request, then redirects to the configured
dashboard base path with a short-lived exchange code. The UI removes that code from the
URL before redeeming it. `AUTH_EXCHANGES` is a SQLite-backed Durable Object: redemption
is transactionally single-use, bound to a verifier held temporarily in the current
tab's `sessionStorage`, and expires after two minutes. The resulting opaque session is
kept only in UI memory; reloads and new tabs require another sign-in.

Repository mode always requires current collaborator access for dashboard and project-registry APIs.
Current collaborator access is sufficient to browse configured projects and explicitly
launch; repository-admin access is required for configuration changes.
`REPORT_ACCESS` is a
separate control and defaults to `collaborators`; only the explicit value `public`
allows anonymous report API reads. Keep reports private when changing or disabling the
dashboard-wide sign-in gate. Public report access is a separate release decision, not
an implication of changing `DASHBOARD_ACCESS`. Configure the Durable Object binding
and migration in `wrangler.jsonc` before deploying this flow.

This application authorization does not make public GitHub Releases or Actions
artifacts confidential. Scanner outputs in public repository artifacts remain
accessible outside the dashboard until the separate private-artifact workstream is
completed.

## Source-write and artifact boundaries

Native feedback is disabled for all configured projects, including service
self-analysis. No scanner findings, comments, checks, SARIF, commits, or pull requests
are written to an analyzed source repository. Source-executing jobs receive no vendor or
publication credentials. A credentialless job snapshots the pinned source for opt-in
vendor lanes; credential-bearing vendor jobs cannot check out the repository or run
project-controlled setup/test commands. GitHub
Actions artifacts in the public execution repository remain publicly accessible outside
the authenticated dashboard. Dashboard sign-in and report authorization do not make
those artifacts confidential; private artifact handling is a separate workstream.

## Deployment configuration

`analysis-launcher/wrangler.jsonc` is the non-secret deployment configuration.
Production uses `APPLICATION_MODE=repositories`, `DASHBOARD_ACCESS=collaborators`,
`TOOLING_FROM_SERVICE=true` and the service execution repository. New installation
previews read the adopted tooling pin from the service project profile. The fallback
TOOLING_SHA is not the authority when TOOLING_FROM_SERVICE is enabled.

Keep `DASHBOARD_ORIGIN` set to the HTTPS site origin for CORS, and set
`DASHBOARD_BASE_PATH` to the deployed Pages app path, including its trailing slash.
For this repository that is `https://combustrrr.github.io/code-analysis-dashboard/`,
so OAuth success and error redirects return to the app rather than the account root.

The current replacement GitHub App is installed on the service repository only; do not
ask dashboard users to install it on their own repositories.
Its credentials are stored in Cloudflare using the canonical GITHUB_* production
bindings; the Worker uses those bindings in application mode. Never put App keys,
OAuth secrets, session keys or vendor credentials in browser code, logs or docs.
Consult worker.mjs and wrangler.jsonc before changing bindings. App installation or
permission changes require GitHub's approval flow; do not install on upstream.
The sign-in redirect deliberately sends no OAuth `scope` parameter. The user token is
used for identity and GitHub's read/write/admin permission checks. A repository-scoped
central App token reads the trusted project registry and Actions readiness, checks
collaborator membership, and serves reports. Launch admission uses the signed-in user's
server-held token only for read/permission checks and is refused without current
collaborator access. Runtime installation tokens request read-only Actions and contents
access. The App registration itself currently advertises broader Actions, contents, and
workflows write permissions; reduce those registration permissions through the GitHub
App owner settings and accept the installation update before calling the App least-privilege. Treat any scope change
as an authorization-boundary change.


Pages builds with VITE_APPLICATION_MODE=repositories and the matching
VITE_LAUNCH_ENDPOINT. The Worker origin must match the configured dashboard origin.
Only an explicit `vite build --mode fixtures` test build may omit VITE_LAUNCH_ENDPOINT
and use the static `data/index.json` contract. Normal and repository builds fail closed when
the Worker endpoint is missing and exclude the checked-in `public/` report fixtures.
`worker-deploy.yml` validates pull requests and deploys the Worker plus Durable Object
migrations only from trusted `main` using the `production` Environment. Pages remains a
separate deployment in `pages.yml`.

Read [dashboard access](../operations/DASHBOARD-ACCESS.md) before changing authorization.
Project configuration is versioned in the execution-host registry; dashboard APIs do
not accept arbitrary source/execution repositories. Scan requests require current collaborator access.
Current reports are served through the Worker/R2 path and require the
independent `REPORT_ACCESS=collaborators` policy. Public GitHub Releases and Actions
artifacts may still expose scanner outputs; this is not complete Trust Lab-only
confidentiality. Owner login and launch are verified; a second collaborator live login
remains deliberately deferred. See [handoff](../HANDOFF.md).
