# Dashboard viewer authorization

This deployment requires GitHub sign-in and current collaborator membership in
combustrrr/code-analysis-dashboard. Add users through GitHub repository Settings,
Collaborators; they must accept the invitation before access is granted. Removing
a collaborator revokes future application access without editing a username list
or redeploying. Public repository read access does not qualify.

DASHBOARD_ACCESS is set to collaborators. The Worker identifies the signed-in
GitHub user and uses its repository-scoped App installation token to check exact
collaborator membership on every protected request. Missing App access or GitHub
API failures deny access. The repository owner qualifies through the same check.
Responses use private, no-store caching. The App is installed only on the execution
host; dashboard users do not install it on their own repositories.

The execution host is fixed to `combustrrr/code-analysis-dashboard` (repository ID
`1360051890`). Its versioned `.github/code-analysis/projects.json` registry must contain
exactly these three public project identities: `ARYDESTROYER/Kavach-AgenticSOC`
(`1267340546`, observer), `combustrrr/code-analysis-dashboard` (`1360051890`, connected
self-analysis), and `combustrrr/Agentic-Kibana` (`1278177697`, observer). The Worker
validates IDs, names, relationships, branches, and native-feedback policy and fails
closed on mismatch. Native feedback is disabled for self-analysis and observer targets
alike; all configured targets remain read-only analysis sources.

Current collaborators with `pull` access can list, select, inspect, and explicitly
launch analysis for configured projects. Configuration changes require `admin` and are
made through the trusted versioned registry. Project selection
does not create workflow runs. Application and report routes accept the fixed execution
repository plus a configured project ID, never a user-selected source repository.
The authenticated `/api/projects` route returns the registry and caller capabilities;
there is no anonymous project-list or arbitrary repository-discovery endpoint.

The OAuth authorization request intentionally omits a `scope` parameter. The user
token supplies identity and GitHub `pull`/`admin` permission checks. The central
App token reads the trusted registry and workflow readiness, checks collaborator
membership, and serves reports. Launches use the user's token and are refused without
current execution-host collaborator access. Do not infer broader access from successful sign-in,
and do not add scopes without reviewing the authorization boundary.

Sign-in uses a same-tab GitHub redirect. OAuth state and PKCE remain validated by the
Worker. An authorized callback returns a two-minute exchange code to the fixed
dashboard origin. A SQLite-backed Durable Object binds that code to a client verifier
and transactionally consumes it once; the UI scrubs the code from the URL before
redemption. The GitHub grant remains sealed in the Worker. The browser stores only the
opaque application handle in `sessionStorage`, so refresh restores the same tab through
`GET /api/bootstrap` while a fresh tab requires GitHub sign-in. The bootstrap response
uses `auth-bootstrap-v1` and atomically returns the verified identity, capabilities, and
trusted project registry. Explicit logout calls `POST /api/auth/logout`, deletes the
Durable Object session first, and then attempts GitHub grant revocation.

Pages bounds callback redemption and same-tab bootstrap restoration to 12 seconds.
If either request stalls, the transition panel becomes a persistent recoverable error
with a retry action instead of leaving the user on "Returning you to Projects"
indefinitely. The opaque session handle is retained for this retry unless the Worker
authoritatively returns a sign-out action.

Successful collaborator and capability verification is cached in that session record
for at most 60 seconds for protected reads. Bootstrap, periodic access checks, and every
mutation verify GitHub live. A confirmed collaborator `404` or identity mismatch deletes
the session. Rate limits, GitHub permission ambiguity, timeouts, and provider failures
fail closed after the cache expires but retain the handle for a bounded retry; they are
not translated into access revocation.

Only an authoritative `/api/session` or `/api/bootstrap` response with `session_invalid` or
`viewer_not_authorized` clears the in-memory session. The UI confirms the session after
another protected endpoint returns either code, so one stale or transient endpoint
response cannot revoke the OAuth grant or create a sign-in loop. A GitHub API, App installation, report asset, rate-limit, or Worker
availability error remains an operation-specific error and must not be translated into
"access revoked." A transient periodic `/api/session` failure leaves an already verified
session active and is retried later; initial verification still fails closed. The Pages
entry keeps scripts same-origin, forbids inline script attributes, and permits API
connections only to the configured Worker. Inline styles remain allowed because the
current React components use bounded style attributes for charts and layout.

`DASHBOARD_ACCESS` and `REPORT_ACCESS` are independent. The current deployment uses
`DASHBOARD_ACCESS=collaborators` and `REPORT_ACCESS=collaborators`. Report API access
defaults to collaborator-only and remains protected if dashboard sign-in is later
disabled. Anonymous report delivery requires the explicit `REPORT_ACCESS=public`
configuration and a separate release decision; do not change that value as a side
effect of changing the dashboard sign-in gate. The configured Durable Object binding
and SQLite migration must be deployed before enabling this sign-in flow.

This is application access control, not a complete confidentiality guarantee. The
public GitHub repository and its Actions artifacts remain publicly accessible through
GitHub; scanner evidence in public artifacts is not protected by the dashboard gate.
GitHub Pages serves the generic static sign-in shell, which contains no live findings.
Private artifact hosting remains a separate prerequisite to claiming Trust Lab-only
confidentiality.

Current acceptance: owner login is confirmed. Production-mode browser tests cover login,
logout, and revoked access; anonymous project-integration access is denied. A second
collaborator live test is deferred by the owner. See
[production readiness](PRODUCTION_READINESS.md) for acceptance evidence.
