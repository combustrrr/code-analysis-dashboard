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
Responses use private, no-store caching. View permission does not grant launch or
repository configuration permission: existing write/admin checks still apply.
The OAuth authorization request intentionally omits a `scope` parameter. The OAuth
grant is used for sign-in identity (and legacy source-mode checks); repository-mode
repository reads, collaborator checks, launches, and report access use the installed
GitHub App token scoped to the configured execution repository. Do not infer broader
OAuth access from a successful sign-in, and do not add scopes without reviewing the
credential boundary and authorization flow.

Sign-in uses a same-tab GitHub redirect. OAuth state and PKCE remain validated by the
Worker. An authorized callback returns a two-minute exchange code to the fixed
dashboard origin. A SQLite-backed Durable Object binds that code to a client verifier
and transactionally consumes it once; the UI scrubs the code from the URL before
redemption. The opaque session remains in React memory, never browser storage. The UI
loads reports only after `/api/session` verification, polls access while visible, and
clears in-memory reports on sign-out or denial. Refreshing and opening a new tab
requires sign-in again.

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

Verified baseline: owner login is confirmed. Production-mode browser tests cover
login, logout and revoked access; live anonymous project-integration returns 401.
A second collaborator live test is deferred by the owner. See the
[current handoff](../HANDOFF.md) for deployment evidence.
