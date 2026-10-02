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
