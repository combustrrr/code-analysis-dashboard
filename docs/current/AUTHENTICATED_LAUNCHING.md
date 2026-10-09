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
write access. Current report assets are public on GitHub even though dashboard/API
access requires collaborator login. Owner login and launch are verified; a second
collaborator live login remains deliberately deferred. See [handoff](../HANDOFF.md).
