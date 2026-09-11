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
The UI loads reports only after session verification, polls access while visible,
and clears in-memory reports on sign-out or denial. Refreshing requires sign-in.

This is application access control, not confidential report storage. The public
GitHub repository, its Release assets and Actions artifacts remain publicly
accessible through GitHub. GitHub Pages serves the static login application.
Private findings require a separately reviewed storage-visibility migration.
