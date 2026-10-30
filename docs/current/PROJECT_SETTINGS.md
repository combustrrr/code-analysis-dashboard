# Project settings control center

Settings is a read-only operational view over the trusted Git registry, GitHub workflow
readiness, private R2 report metadata, and publication provenance. Its Overview is also
the single authenticated customization center for theme, information density, motion,
default issue grouping, and sign-out. These preferences remain browser-local; registry
and service configuration changes continue through reviewed Git changes.

Authenticated `GET /api/project-settings?project_id=<trusted-id>` returns
`project-settings-v1`. A manual check adds `refresh=1`. The Worker validates the project
against the trusted registry before creating GitHub or report-reader paths, reads the
current manifest once, and sanitizes provider diagnostics. Missing manifests are reported
as `not_published`; provider failures never become healthy or empty evidence.

The isolate keeps at most 32 sanitized provider aggregates. Values are fresh for 60
seconds and may be served stale while revalidation runs until 120 seconds. Authenticated
responses remain `private, no-store`; session handles and user identity are not cached.
The Durable Object limits settings aggregation to 30 requests per session per rolling
minute. `/api/project-integration` and `/api/project-readiness` temporarily project the
same aggregate and advertise their 31 January 2027 sunset.

The Pages client caches by session handle and project ID, purges every settings entry on
authentication loss, and removes detailed cached diagnostics after a hidden tab reaches
the 30-minute session idle boundary. Canonical routes are `#/settings/overview`,
`#/settings/projects`, `#/settings/integrations`, and `#/settings/provenance`.
