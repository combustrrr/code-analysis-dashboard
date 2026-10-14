# GitHub authentication and direct analysis launch

The deployed application uses repository mode, not legacy discovery workflow 10.
The [Worker](https://code-analysis-launcher.icsarthak9.workers.dev) handles login,
repository authorization, reviewed configuration, dispatch and report delivery.
Actions and Release storage live in `combustrrr/code-analysis-dashboard` for all
three currently configured projects. No separate Worker is needed per source project.

Users sign in, select a source and branch/PR/full 40-character SHA, and press Run
analysis. The Worker checks write access and App installation, records request intent,
and dispatches `code-analysis-reconcile.yml`. Reconciliation queues
`code-analysis-source.yml` with immutable source/tooling identity under the two-slot
limit. The UI follows exact request/run/attempt and opens the published target.
Hourly reconciliation recovers missed work; submission is not scanner completion.
The dashboard never launches automatically on refresh. A launch is explicit, and a
duplicate deterministic request returns the already-persisted queue asset rather than
creating a second dispatch.

## Dashboard sign-in and report visibility

GitHub sign-in is a same-tab redirect. The Worker validates OAuth state and PKCE,
checks the signed-in identity against the configured dashboard policy and (while
reports are private) current collaborator membership, then redirects to the fixed
dashboard origin with a short-lived exchange code. The UI removes that code from the
URL before redeeming it. `AUTH_EXCHANGES` is a SQLite-backed Durable Object: redemption
is transactionally single-use, bound to a verifier held temporarily in the current
tab's `sessionStorage`, and expires after two minutes. The resulting opaque session is
kept only in UI memory; reloads and new tabs require another sign-in.

`DASHBOARD_ACCESS` controls authentication for dashboard APIs. `REPORT_ACCESS` is a
separate control and defaults to `collaborators`; only the explicit value `public`
allows anonymous report API reads. Keep reports private when changing or disabling the
dashboard-wide sign-in gate. Public report access is a separate release decision, not
an implication of changing `DASHBOARD_ACCESS`. Configure the Durable Object binding
and migration in `wrangler.jsonc` before deploying this flow.

This application authorization does not make public GitHub Releases or Actions
artifacts confidential. Scanner outputs in public repository artifacts remain
accessible outside the dashboard until the separate private-artifact workstream is
completed.

## Evaluation mode

The Kavach evaluation is a bounded exception to the normal queue policy: the configured
`Testing` branch is resolved once to an immutable SHA, and the Worker stores a durable
lock in the `ANALYSIS_STATE` KV namespace under
`evaluation:v1:<lowercase-source-repository>`. The lock records the frozen SHA,
tooling/profile idempotency key, request ID, pause state, and dispatch count. A failed,
timed-out, or uncertain dispatch still consumes the one-dispatch budget. Operators reset
the key only after inspecting the associated request/run state; deleting the key is the
explicit reset operation. Dashboard refreshes and report reads do not touch the budget.

## Deployment configuration

`analysis-launcher/wrangler.jsonc` is the non-secret deployment configuration.
Production uses `APPLICATION_MODE=repositories`, `DASHBOARD_ACCESS=collaborators`,
`TOOLING_FROM_SERVICE=true` and the service execution repository. New installation
previews read the adopted tooling pin from the service project profile. The fallback
TOOLING_SHA is not the authority when TOOLING_FROM_SERVICE is enabled.

The current replacement GitHub App is installed on the service repository only.
Its credentials are stored in Cloudflare using the existing NEXT_GITHUB_* migration
bindings; the Worker uses those bindings in application mode. Never put App keys,
OAuth secrets, session keys or vendor credentials in browser code, logs or docs.
Consult worker.mjs and wrangler.jsonc before changing bindings. App installation or
permission changes require GitHub's approval flow; do not install on upstream.
The sign-in redirect deliberately sends no OAuth `scope` parameter. Sign-in therefore
does not request repository scopes. In repository mode, the resulting user token is
used for identity/session establishment while repository inspection, collaborator
authorization, launch, and report reads use the repository-scoped GitHub App
installation token. Treat any scope change as an authorization-boundary change.


Pages builds with VITE_APPLICATION_MODE=repositories and the matching
VITE_LAUNCH_ENDPOINT. The Worker origin must match the configured dashboard origin.
Only an explicit `vite build --mode fixtures` test build may omit VITE_LAUNCH_ENDPOINT
and use the static `data/index.json` contract. Normal and repository builds fail closed when
the Worker endpoint is missing and exclude the checked-in `public/` report fixtures.
Deploy the Worker with `npx --prefix analysis-launcher wrangler deploy --config
analysis-launcher/wrangler.jsonc`; main UI changes trigger pages.yml.

Read [dashboard access](../operations/DASHBOARD-ACCESS.md) before changing authorization.
Repository writes require admin and exact preview confirmation; scan requests require
write access. Current reports are served through the Worker/R2 path and require the
independent `REPORT_ACCESS=collaborators` policy. Public GitHub Releases and Actions
artifacts may still expose scanner outputs; this is not complete Trust Lab-only
confidentiality. Owner login and launch are verified; a second collaborator live login
remains deliberately deferred. See [handoff](../HANDOFF.md).
