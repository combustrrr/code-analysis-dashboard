# Analysis Launcher

Cloudflare Worker boundary for authentication, authorization, repository setup,
analysis launch, request activity, and report delivery.

| Area | Files |
|---|---|
| Worker entrypoint | `worker.mjs` |
| Request/application API | `application.mjs` |
| Report access | `reports.mjs` |
| GitHub App/auth helpers | `github-app.mjs`, `viewer-access.mjs` |
| Diagnostics | `diagnostics.mjs` |
| Deployment contract | `wrangler.jsonc` |
| Tests | `*.test.mjs` |

The Worker owns API delivery and access checks. Scanner execution remains in GitHub
Actions, and source repositories remain read-only. `dist/`, `.wrangler/`, and local
development variables are generated or ignored and must not be committed.

## Operational guards

- **Per-endpoint request body limits** fail closed (`request-limits.mjs`):
  `/api/launch` 2 KiB, application API JSON 64 KiB, KV state writes 25 MiB,
  report manifest JSON 16 MiB, report assets 100 MiB, webhooks 1 MiB.
  Overrides: `MAX_LAUNCH_BYTES`, `MAX_APPLICATION_JSON_BYTES`, `MAX_STATE_BYTES`,
  `MAX_MANIFEST_JSON_BYTES`, `MAX_ASSET_BYTES`, `MAX_MANIFEST_COMPRESSED_BYTES`,
  `MAX_WEBHOOK_BYTES`. A declared `Content-Length` above the cap rejects before
  any bytes are buffered; streamed bodies are counted and cancelled at the cap.
- **Report freshness**: the current manifest must be republished within
  `MAX_REPORT_AGE_MS` (24 h default; reconciliation republishes hourly).
  Stale or undated manifests answer `410` with `expired: true`; rerun
  analysis to publish a fresh report.
- Threat Reports are served only from immutable stored assets. If the published
  asset is absent, the live endpoint fails closed instead of synthesizing legacy content.
- **Installation token hygiene**: cached GitHub App installation tokens are
  invalidated when GitHub answers 401/403, and the rejected call is retried
  once with a freshly minted token before failing closed.
- **Diagnostics**: failures log a fixed-shape `error_code` (never free-form
  upstream text) when `SAFE_API_LOGS=true`, and error responses carry
  `request_id` for correlation with the `X-Request-ID` response header.

- **Webhook replay protection**: supported signed deliveries require `ANALYSIS_STATE`; a 24-hour delivery marker is written before dispatch so replays return 202 without a second dispatch. KV has no atomic compare-and-set, so strict concurrent replay exclusion is not available; this fails closed when state is unavailable, and hourly reconciliation remains the recovery path for dispatch failures.

## GitHub authorization

Repository mode uses the installed GitHub App. The sign-in redirect intentionally
omits an OAuth `scope` parameter: the signed-in user token establishes identity,
while repository inspection, collaborator checks, launches, and report reads use
the installation token. The App registration requires repository permissions for
`actions: write`, `contents: write`, `metadata: read`, and `pull_requests: read`.
It does not require `workflows: write`. App permissions are distinct from OAuth
scopes and are approved when the App is installed on the execution repository.

Legacy mode is separate and requires the explicit Worker variable
`GITHUB_OAUTH_SCOPES=public_repo`. That legacy OAuth grant is limited to the
public-repository API flow; it is not a fallback for repository-mode App access.
Deployment validation rejects a missing or broader legacy scope value.

## Report and target boundaries

- Source execution is read-only and receives no publication credential. SARIF
  publication is limited to the explicitly scoped reconciliation/native-publication
  job with `security-events: write`; generated source and diagnostic jobs cannot
  publish SARIF. Source-only observer projects do not upload checks or findings to
  the source repository, and a connected project publishes only to its configured
  execution repository.
- Reports are current-only. The Worker serves the current manifest and its current
  assets after freshness and identity checks; superseded, stale, undated, or
  unpublished targets are not reconstructed or served as empty results. Rerun
  analysis to publish a fresh report.
- Analysis targets are repository branches, open pull requests, or full 40-character
  commit SHAs. A local working tree, uncommitted changes, or an arbitrary local path
  is not a supported target because it has no immutable repository provenance.
- Threat Report PDF output is the browser's print/save-to-PDF action from the report
  view. It is not a server-generated PDF asset and does not alter scanner evidence.
