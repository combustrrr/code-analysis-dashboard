# Deployment Utilities

Administrative utilities for provisioning or registering service integrations. These
are not Worker runtime code and must never receive scanner or publication credentials.

- `register_github_app.py`: registers the GitHub App used by the Cloudflare Worker.
  Cross-platform: uses `npx` (not `npx.cmd`) and detects OpenSSL via `shutil.which`
  with Windows fallbacks (Git for Windows, Scoop, manual install paths).
- `validate_deployment.py`: validates wrangler.jsonc config, required Worker secrets,
  and optionally checks R2 `temp-runs/` 1-day lifecycle rule (requires boto3 and
  R2 read credentials; prints manual steps if unavailable).
- `test_register_github_app.py`: unit tests for cross-platform command selection
  (`_find_npx`, `_find_openssl`).

## Validation usage

```bash
# Basic config and secrets validation (no credentials needed)
python scripts/deployment/validate_deployment.py

# With R2 lifecycle check (requires boto3 and R2 read credentials)
R2_ACCESS_KEY=<key> R2_SECRET_KEY=<secret> \
python scripts/deployment/validate_deployment.py --check-r2-lifecycle \
  --r2-account-id <account> --r2-bucket-name <bucket>
```

## Test usage

```bash
# Run all deployment tests (configuration and GitHub App command selection)
python -m pytest scripts/deployment -v
```
