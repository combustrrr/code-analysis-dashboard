# Dashboard access and target-selection plan

## Goal and access boundary

Implement the agreed same-tab GitHub sign-in flow and the next workspace step for selecting one of the currently configured analysis targets:

- The generic landing/sign-in shell may remain public; it must contain no live findings or confidential report data.
- Dashboard data and reports require a verified GitHub identity that is a current collaborator of `combustrrr/code-analysis-dashboard`. The repository collaborator list is the Trust Lab allowlist and must be maintained accordingly; users must accept invitations.
- Viewer access does not grant execution-repository write or configuration rights. Keep those checks separate.
- Keep the gate configurable for a later release, but do not let removing dashboard sign-in make report endpoints public. Report visibility must have its own explicit authorization control.
- A separate private-artifact workstream remains a prerequisite to claiming complete Trust Lab-only confidentiality: scanner outputs uploaded as Actions artifacts in the public code repository remain publicly accessible. This plan does not move those artifacts.
- For this phase, keep the three existing public targets only. General private-repository support and arbitrary user-selected repositories are deferred.

## Agreed sign-in behavior

1. Replace the current popup with a full-page redirect initiated by the user's click. Preserve the intended route, hash, and pending workspace intent in same-tab `sessionStorage`; do not accept arbitrary redirect destinations.
2. Retain GitHub OAuth state/CSRF validation and PKCE at the Worker. Continue omitting OAuth `scope` in repository mode. The Worker must validate collaborator membership with its GitHub App installation token and fail closed on denial or membership-check errors.
3. For an authorized user, return to the fixed configured dashboard origin with a brief-lived, single-use exchange code—not a bearer token. Bind it to a client-generated verifier held temporarily in `sessionStorage`; scrub the fragment with `history.replaceState` before redeeming the code. Use a transactional Cloudflare Durable Object (or equivalent atomic store), not KV, for single-use consumption; current KV does not guarantee atomic compare-and-delete. Give the code a short TTL (target: two minutes), reject replay/expiry, and return `Cache-Control: no-store`.
4. Redeem the code through a Worker API request, then keep the resulting opaque session token only in React memory. Clear the temporary verifier after redemption. Do not put a bearer token in a URL, local storage, or session storage. Reloads and new tabs require sign-in again.
5. Verify the session with `/api/session` before loading workspace/report data. Retain per-request Worker authorization and visible-tab access rechecks; on expiry/revocation clear the in-memory session and report cache. Restore the preserved route only after verification succeeds.
6. Decouple report authorization from the dashboard sign-in toggle. Private reports must remain protected if viewer sign-in is later disabled; public report access requires a separate explicit configuration/release decision.

## Fixed execution host and target selection

1. Treat `combustrrr/code-analysis-dashboard` as the fixed execution, storage, and publishing repository. Do not ask users to select an execution host or list arbitrary repositories in this phase. Use the Worker deployment configuration as the source of truth for the host; expose its public repository identity through `/api/public/config` if the UI needs it, rather than maintaining a second editable UI value.
2. Load the target list from the authenticated project registry on that host, not from a hard-coded frontend list or the signed-in user's repository inventory. The current configured targets are:
   - `ARYDESTROYER/Kavach-AgenticSOC` (`1267340546`): read-only source; preferred branch `Testing`; respect its configured evaluation/frozen-SHA controls.
   - `combustrrr/Agentic-Kibana` (`1278177697`): read-only source; preferred branch `Testing`.
   - `combustrrr/code-analysis-dashboard` (`1360051890`): connected self-analysis; preferred branch `main`; only this self-analysis relationship may publish native findings back to itself.
3. Show the configured targets with their source repository and relationship (read-only source vs connected self-analysis). Selecting one opens its current project/report overview. Selection is read-only: it must not dispatch a workflow or select another target as a fallback. Branch/PR/SHA choice and launch remain a later, explicit user action.
4. Keep routes keyed by the fixed execution repository and configured project ID; do not put a source repository name or credential in the route. Restore a requested project only after sign-in and project-registry verification. If there is no current report, show that state without silently substituting another project.
5. Distinguish loading/authorization/configuration errors from an empty configured project list. If a configured target disappears or its repository ID no longer matches, show an unavailable/error state and require an explicit choice; never silently remap a project.

## GitHub permissions and shared scanner stack

- Keep one Trust Lab-managed GitHub App installed on the fixed execution repository. Developer GitHub sign-in establishes identity; users do not install an App per target. The three sources are public, so this phase does not add per-source App installations or private-source checkout.
- Align API permissions with the agreed roles: current collaborators with read access can list/select configured targets and view reports; write access is required to launch analysis; repository admin is required for setup/configuration changes. Refactor the current repository permission check so read endpoints do not inherit the launch write requirement. Keep launch and setup checks enforced by the Worker, not just disabled in the UI.
- Keep the scanner stack centrally managed by Trust Lab. Store vendor credentials only as service/execution-repository secrets; keep per-target scanner profiles in the trusted project registry. Do not request or store vendor credentials in the browser or as per-user connections.
- Show per-project workflow/profile readiness through the existing Connections/readiness surface. This is not proof that vendor secrets or entitlements work. Allow analysis with incomplete channels; keep missing, deferred, failed, or unavailable evidence explicit and preserve healthy sibling results. Do not report missing evidence as a clean scan.
- A missing central App installation or invalid service configuration is an actionable service-configuration error, not a prompt for each developer to install an App. A missing/invalid scanner credential is reflected by readiness/evidence and report coverage, not by exposing the secret or blocking target selection.

## Outcome and error handling

- **Authorized:** complete the one-time exchange, verify the session, then restore the exact requested workspace destination.
- **Not an accepted collaborator:** return a sanitized status to the dashboard and show that the account is not authorized yet, with instructions to ask a maintainer for an invite, accept it, and retry. Do not issue an exchange code or expose raw GitHub/API errors.
- **GitHub cancellation:** return a safe cancellation message with a retry action.
- **State mismatch, invalid/expired/replayed exchange code, OAuth/network failure, or session verification failure:** fail closed, show a safe retryable error, and load no private data. Distinguish infrastructure failures from collaborator denial so a GitHub outage is not presented as an invitation problem.
- All callback return locations are fixed to the configured dashboard origin; do not create an open redirect.

## Implementation boundaries

- UI: `analysis-ui/src/useLaunchAuth.ts`, `analysis-ui/src/DashboardAccess.tsx`, `analysis-ui/src/LandingPage.tsx`, `analysis-ui/src/Repositories.tsx`, `analysis-ui/src/main.tsx`, `analysis-ui/src/Integration.tsx`, and report-session integration as needed. Replace the misleading “repository you administer” copy and remove the generic execution-repository picker/install prompt from this bounded flow.
- Worker: `analysis-launcher/worker.mjs`, `analysis-launcher/application.mjs`, the new one-time exchange Durable Object/binding, and `analysis-launcher/wrangler.jsonc`.
- Tests: `analysis-launcher/worker.test.mjs`, `analysis-launcher/application.test.mjs`, `analysis-ui/tests/dashboard-access.spec.ts`, and relevant `analysis-ui/tests/dashboard.spec.ts` coverage.
- Update `docs/current/AUTHENTICATED_LAUNCHING.md`, `docs/operations/DASHBOARD-ACCESS.md`, `docs/operations/REPOSITORY_APPLICATION.md`, and `docs/operations/READ_ONLY_ANALYSIS.md` to state the implemented flow, target roles, separate permissions, centralized integrations, independent report-visibility control, and remaining public-artifact limitation. Keep secrets and raw GitHub errors out of docs/logs.
- Do not modify scanner workflow artifacts as part of this plan. Workflow privacy is the separate prerequisite noted above; if that work later touches generated workflows 11/12, regenerate them with `generate_source_workflow.py` rather than editing generated files.

## Validation and rollout

- Worker tests: OAuth state and PKCE validation; fixed return origin; no-scope authorization request; approved/denied collaborator outcomes; sanitized cancellation/failure redirects; exchange-code binding, atomic one-time redemption, expiry and replay rejection; private report authorization when dashboard sign-in is disabled; fail-closed behavior when GitHub or the exchange store is unavailable.
- UI/browser tests: same-tab redirect and route/workspace restoration; successful redemption and `/api/session` verification; invitation guidance for a non-collaborator; cancellation/retry and exchange/session failures; report cache clearing on sign-out/revocation; no report fetch before verification; no bearer token in URLs or browser storage; reload/new-tab reauthentication.
- Target-selection tests: the authenticated registry yields exactly the three configured project IDs and relationship labels; selecting a project opens its overview without a launch request; read-only collaborators can list/select/view; read-only users cannot launch, writers can launch, and only admins can configure; no configured project or a registry error is handled distinctly; project identity mismatch fails closed; no private or arbitrary repository is added to this phase.
- Integration tests: the shared App is treated as a service prerequisite rather than per-user setup; readiness can show incomplete scanner channels without blocking target selection or misrepresenting a partial report as clean.
- Run launcher/application tests, relevant dashboard browser tests, and the UI production build. Confirm anonymous requests cannot read current R2 reports or protected dashboard APIs.
- Deploy only after tests pass and the Durable Object binding is configured. Do not describe the service as fully Trust Lab-confidential until the separate public Actions-artifact exposure is closed.

## Explicitly out of scope

- Moving scanner evidence out of public GitHub Actions artifacts or creating a private workflow-host repository.
- Changing the public visibility of the dashboard source/code repository or hiding the generic landing/sign-in shell.
- General private-repository support, arbitrary execution-host selection, or per-user GitHub App/vendor-account connections.
- Upstream/source-repository changes, scan behavior, report schema, or PDF export work.
