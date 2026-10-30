# Project analyst workspace

The authenticated project workspace is a current-report command center. One verified report remains authoritative for each configured project. A newer analysis does not hide or replace that report while scanners are running.

The visual hierarchy uses a compact management-dashboard grid without changing evidence semantics: the revision ribbon and analysis action form the command strip, tab navigation is a bounded segmented control, and Overview uses a responsive 12-column evidence grid. Severity, coverage, revision freshness, and investigation actions determine card emphasis; decorative business metrics are not introduced. Selected findings replace the list canvas with one full-width review surface so filters and an empty split column do not compete with source evidence.

## Routes and cutover

- `#/projects/:projectId` opens Overview.
- `/issues`, `/coverage`, and `/report` are the four evidence destinations with Overview.
- `#/projects/:projectId/progress?request=<requestId>` is contextual and is not a fifth tab.
- Starting analysis from a published report leaves the current route and filters intact and shows a sticky progress banner.
- The dedicated progress route opens a newly verified target after publication. Other routes present an explicit switch action so an analyst is not interrupted during review.
- Opaque target, request, and issue identifiers are bounded and reject controls, traversal segments, slashes, backslashes, null bytes, and encoded traversal. SHA fields are validated separately by the publication boundary.

## Evidence loading

Publication retains `analysis-current-v1` and its content-addressed gzip assets. New publications also contain optional `project-overview.json` with schema `project-overview-v1`.

1. The project shell loads only the manifest.
2. Overview loads `project-overview.json` and derives its shell metrics from that compact document. It does not request `report.json`. Older reports fall back to `findings.json` plus `report.json` for compatibility.
3. Issues loads `findings-catalog.json` and the first immutable 500-row `findings-pages/<page>.json` document. The analyst explicitly loads the remaining pages before report-wide search and filters become available, preventing an incomplete filter result from being presented as complete. Older reports fall back to `findings.json`.
4. Issue detail loads its existing 100-finding detail page and then its separate source document when available.
5. Coverage loads the compact `coverage.json` channel projection. Older reports fall back to `report.json`. Reports uses the overview metadata and loads export code only after navigation.

`project-overview.json`, `coverage.json`, `findings-catalog.json`, every findings page, every locator bucket, `report.json`, and `findings.json` have independent content-addressed gzip delivery boundaries. Deep-linked findings use one of 16 `finding-locators/<hex>.json` buckets to resolve the existing detail shard without downloading the complete catalog. Existing manifests remain valid, but they retain their original packing until the project is republished.

Overview, Issues, Coverage, Reports, and contextual Progress each have a statically analyzable dynamic-import boundary. The production budget check fails if any tab stops being an independent lazy entry. Reports then loads the threat-report interface only when opened.

PDF generation runs in a dedicated module Web Worker. The worker and jsPDF are absent from the landing, workspace shell, Overview, Issues, and Coverage dependency graphs and are requested only after an analyst starts a PDF export. It reports bounded progress through the existing polite live region, yields after each 20-finding batch, supports cancellation by terminating the worker, and returns only the completed Blob to the UI thread. Navigating away terminates an active export and no partial download is created.

Issues mounts 50 table rows per page on larger screens and 20 evidence cards per page below 700px. Mobile cards replace compressed table columns, while the four workspace destinations use a two-by-two navigation control. Opening a mobile finding uses a full-viewport evidence sheet with an independently scrolling body and contained source-code overflow. Source excerpts are React text children, never HTML. GitHub links continue through the trusted URL helper and open with opener isolation.

The Issues surface follows a read-only evidence-IDE model. The report list is a bounded issue queue with compact filters and scanner-support indicators. Opening a finding hides the queue controls and gives the inspector the full canvas. Source context uses an editor-like frame only to clarify immutable path and line provenance; it remains inert React text, exposes no editing or execution controls, and never introduces syntax parsing or HTML injection.

## Sanitized audit bundle

Each new publication creates one content-addressed `audit-<sha256>.zip`. It includes sanitized normalized SARIF, report JSON, coverage status, provenance, a bounded Markdown summary, and a manifest of document hashes and schema versions.

It excludes raw scanner logs, provider responses and headers, environment variables, credentials, detected secret values, source copies, code snippets, bucket keys, account identifiers, and Worker metadata. Gitleaks and secret-rule messages are replaced with a fixed value-withheld explanation.

`GET /api/report-export?project_id=<id>&target_id=<manifest-target>&format=audit-zip` requires an authenticated read-capable collaborator. The Worker resolves the trusted project and exact current-manifest target before reading the private R2 key. It supports one valid byte range, `If-None-Match`, ETag, attachment disposition, and direct R2 body streaming. Responses are `private, no-store`.

The Durable Object permits five newly accepted audit downloads per opaque session per rolling minute. A limit returns `429`, `Retry-After`, and `audit_export_rate_limited`.

## Deployment order

Deploy the backward-compatible Cloudflare Worker before publishing Pages. Verify `/api/public/config` and an authenticated bootstrap/report request against the Worker, then push the Pages assets and confirm that their hashed entry chunks load without console errors. New Pages code treats missing overview and audit-bundle references as compatibility states, so it remains safe while older current reports await republication.

Issue-detail navigation uses element anchors rather than restoring an absolute window
offset. Opening a desktop finding focuses and reveals the detail canvas below the sticky
header. Closing the detail restores focus to the originating finding when it remains on
the active page, with the Issues heading as the fallback. Mobile retains the drawer and
restores the same finding without moving the document to its top or bottom. Dynamic
Issues content opts out of native scroll anchoring to prevent catalog and polling updates
from moving the analyst's viewport.

## Compatibility and removal

Older manifests without `project-overview-v1` remain reviewable through client derivation. Older targets without `audit_bundle` show the existing report exports and do not advertise an unavailable ZIP. Remove the overview fallback only after every retained current report has been republished with the new document.
