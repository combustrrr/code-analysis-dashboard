# Project analyst workspace

The authenticated project workspace is a current-report command center. One verified report remains authoritative for each configured project. A newer analysis does not hide or replace that report while scanners are running.

## Routes and cutover

- `#/projects/:projectId` opens Overview.
- `/issues`, `/coverage`, and `/report` are the four evidence destinations with Overview.
- `#/projects/:projectId/progress?request=<requestId>` is contextual and is not a fifth tab.
- Starting analysis from a published report leaves the current route and filters intact and shows a sticky progress banner.
- The dedicated progress route opens a newly verified target after publication. Other routes present an explicit switch action so an analyst is not interrupted during review.
- Opaque target, request, and issue identifiers are bounded and reject controls, traversal segments, slashes, backslashes, null bytes, and encoded traversal. SHA fields are validated separately by the publication boundary.

## Evidence loading

Publication retains `analysis-current-v1` and its content-addressed gzip assets. New publications also contain optional `project-overview.json` with schema `project-overview-v1`.

1. The project shell loads the manifest and `report.json`.
2. Overview loads `project-overview.json`. Older reports fall back to `findings.json`.
3. Issues loads `findings.json` only when opened and builds immutable severity, category, scanner, rule, file, directory, location, overlap, ID, and search indices.
4. Issue detail loads its existing 100-finding detail page and then its separate source document when available.
5. Coverage uses `report.json`; Reports loads export code only after navigation.

Issues mounts 50 table rows per page. Source excerpts are React text children, never HTML. GitHub links continue through the trusted URL helper and open with opener isolation.

## Sanitized audit bundle

Each new publication creates one content-addressed `audit-<sha256>.zip`. It includes sanitized normalized SARIF, report JSON, coverage status, provenance, a bounded Markdown summary, and a manifest of document hashes and schema versions.

It excludes raw scanner logs, provider responses and headers, environment variables, credentials, detected secret values, source copies, code snippets, bucket keys, account identifiers, and Worker metadata. Gitleaks and secret-rule messages are replaced with a fixed value-withheld explanation.

`GET /api/report-export?project_id=<id>&target_id=<manifest-target>&format=audit-zip` requires an authenticated read-capable collaborator. The Worker resolves the trusted project and exact current-manifest target before reading the private R2 key. It supports one valid byte range, `If-None-Match`, ETag, attachment disposition, and direct R2 body streaming. Responses are `private, no-store`.

The Durable Object permits five newly accepted audit downloads per opaque session per rolling minute. A limit returns `429`, `Retry-After`, and `audit_export_rate_limited`.

## Deployment order

Deploy the backward-compatible Cloudflare Worker before publishing Pages. Verify `/api/public/config` and an authenticated bootstrap/report request against the Worker, then push the Pages assets and confirm that their hashed entry chunks load without console errors. New Pages code treats missing overview and audit-bundle references as compatibility states, so it remains safe while older current reports await republication.

## Compatibility and removal

Older manifests without `project-overview-v1` remain reviewable through client derivation. Older targets without `audit_bundle` show the existing report exports and do not advertise an unavailable ZIP. Remove the overview fallback only after every retained current report has been republished with the new document.
