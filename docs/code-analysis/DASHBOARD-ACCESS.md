# Dashboard viewer authorization

This deployment requires GitHub sign-in. The Cloudflare configuration sets
DASHBOARD_ACCESS to allowlist and DASHBOARD_ALLOWED_USERS to a comma-separated
list of GitHub usernames (currently combustrrr). Matching is case-insensitive;
an empty list denies everyone. Edit the trusted Worker configuration and deploy
to add or remove viewers. No browser-supplied username grants access.

The Worker resolves the authenticated GitHub user on each protected request,
including projects, manifests, report assets and launch/configuration operations.
Responses use private, no-store caching. View permission does not grant launch or
repository configuration permission: existing write/admin checks still apply.
The UI loads reports only after session verification, polls access while visible,
and clears in-memory reports on sign-out or denial. Refreshing requires sign-in.

This is application access control, not confidential report storage. The public
GitHub repository, its Release assets and Actions artifacts remain publicly
accessible through GitHub. GitHub Pages serves the static login application.
Private findings require a separately reviewed storage-visibility migration.
