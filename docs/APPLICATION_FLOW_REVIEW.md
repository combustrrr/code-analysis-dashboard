# Application flow review: deployed baseline 2026-09-11

The earlier single-source/fork-host proposal is superseded. The deployed flow is:
collaborator GitHub sign-in -> source project and branch/PR/full SHA selection ->
authorized request -> service Actions queue -> isolated scanners -> validated current
Release report -> selected-target dashboard output. Pages builds only UI changes.

PR #17 repaired the obsolete Connections endpoint, expanded issue filters and verified
repository configuration/recovery. Required compatibility, service, API and browser
checks passed. See [handoff](HANDOFF.md) for exact deployment IDs and limitations.

This does not prove all vendor channels are complete or that an independent owner has
installed the service. Sonar branch access and upstream posture permission remain
named exceptions. Another collaborator live login is deferred. The current scope is
Kavach upstream, the read-only product fork and connected service-self only.
