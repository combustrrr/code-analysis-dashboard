# Scanner coverage contract

Fast analysis selects every scanner that is enabled, supported by the trusted
project profile, and applicable to the selected target. Context-specific lanes
remain explicit: CodeRabbit requires an open pull request, while repository
secret-protection posture requires a separately provisioned read-only security
credential and is never granted to a source-executing job.

The `ext-github-security-advisories` lane inventories published repository
security advisories through GitHub's public, read-only REST endpoint. It uses no
credential, checks out only trusted dashboard tooling, and is enabled for all
registered public projects. API or rate-limit failures remain visible as
operational failure evidence rather than being converted to a successful scan.
Extension provenance is bound to the checked-out trusted tooling revision, not
to the caller workflow commit that may contain a later promotion-only change.
