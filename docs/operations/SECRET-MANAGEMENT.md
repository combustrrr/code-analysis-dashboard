---
title: Secret management and rotation
description: SESSION_KEY entropy requirements and secret rotation procedures.
---

# Secret management and rotation

## SESSION_KEY entropy requirements

`SESSION_KEY` is a Worker secret used to encrypt and authenticate session cookies. It must meet
the following entropy requirements:

- **Minimum 256 bits (32 bytes) of entropy** — generated via a cryptographically secure
  random source (e.g., `openssl rand -base64 32` or `secrets.token_urlsafe(32)`).
- **Base64 or base64url encoded** — the Worker decodes the secret into the raw key
  bytes; store the encoded string as the secret value in Cloudflare.
- **Unique per environment** — never reuse the same SESSION_KEY across production,
  staging, or development Workers.

Example generation:

```bash
# OpenSSL (cross-platform)
openssl rand -base64 32

# Python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

The key is used with AES-GCM to encrypt and authenticate session cookies. Rotation invalidates all active
sessions; plan rotations during low-traffic windows.

## Secret rotation procedures

### Worker secrets (Cloudflare)

1. Generate a new value meeting the entropy requirements above.
2. In the Cloudflare dashboard: Workers & Pages → code-analysis-launcher → Settings → Variables & Secrets.
3. Update the secret (e.g., `SESSION_KEY`, `GITHUB_CLIENT_SECRET`, `WORKER_API_TOKEN`).
4. Deploy the Worker (no code change required for secret-only updates).
5. Verify the deployment in the Cloudflare dashboard or with 
px wrangler deployments list`.

### GitHub App secrets

1. In GitHub: Settings → Developer settings → GitHub Apps → <app> → Generate a new client secret.
2. Run `python scripts/deployment/register_github_app.py --worker-origin <url> --dashboard-url <url> [--application]` to store the new secret via wrangler and update the client ID in `wrangler.jsonc`.
3. The script never prints the client secret; it passes it directly to wrangler stdin.
4. Rotate the corresponding `NEXT_GITHUB_WEBHOOK_SECRET` if the App is the application variant.

### R2 and KV credentials

- R2 access keys (`R2_ACCESS_KEY`, `R2_SECRET_KEY`) are scoped to the analysis bucket.
- Rotate via Cloudflare R2 → Manage API tokens → Create new token → revoke old.
- Update the GitHub repository secrets (`R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`) used by workflows.
- No Worker redeploy is required; workflows read secrets at runtime.

### Scanner and vendor tokens

- `SNYK_TOKEN`, `SONAR_API_TOKEN`, `SCANNER_UPDATE_TOKEN` — rotate at the provider,
  then update the GitHub repository secret.
- `SCANNER_UPDATE_TOKEN` requires Contents, Pull requests, Workflows, Issues, and
  Commit statuses read/write; metadata, checks, and Administration read access.

## No-secret logging policy

- Never log secret values, raw tokens, or OAuth callback parameters.
- The Worker emits sanitized custom events: category/method, status, elapsed_ms, and
  a generated request ID. OAuth events are explicitly excluded.
- `register_github_app.py` passes secrets via stdin to wrangler; no secret appears
  in process arguments or logs.
- Workflow steps use `env:` with `${{ secrets.* }}`; avoid `echo` or `print` of secrets.

## Rotation schedule

| Secret | Rotation cadence | Trigger |
|--------|------------------|---------|
| SESSION_KEY | 90 days or on compromise suspicion | Scheduled or incident |
| GITHUB_CLIENT_SECRET | 180 days or on compromise suspicion | Scheduled or incident |
| WEBHOOK_SECRET | 180 days or on compromise suspicion | Scheduled or incident |
| R2_ACCESS_KEY / R2_SECRET_KEY | 90 days | Scheduled |
| SNYK_TOKEN / SONAR_API_TOKEN | Per provider policy | Provider notification |
| SCANNER_UPDATE_TOKEN | 180 days or on personnel change | Scheduled or offboarding |
| WORKER_API_TOKEN | 180 days | Scheduled |

Document each rotation in the deployment changelog with date, operator, and reason
(without recording the secret value).
