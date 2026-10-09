#!/usr/bin/env python3
"""Deployment validation checks for R2 temp-runs lifecycle and other config.

Run without credentials where feasible; exit non-zero on validation failure.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


def _parse_jsonc(text: str) -> dict:
    """Parse JSONC (JSON with comments) by stripping line comments."""
    # Remove line comments (// ...) but not URLs (https://)
    lines = []
    for line in text.splitlines():
        # Find // not inside a string
        in_string = False
        escape = False
        comment_pos = -1
        for i, ch in enumerate(line):
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"' and not escape:
                in_string = not in_string
                continue
            if not in_string and ch == "/" and i + 1 < len(line) and line[i + 1] == "/":
                comment_pos = i
                break
        if comment_pos >= 0:
            line = line[:comment_pos]
        lines.append(line)
    return json.loads("\n".join(lines))


BASE_REQUIRED_SECRETS = {"GITHUB_CLIENT_SECRET", "SESSION_KEY", "WORKER_API_TOKEN"}
REPOSITORY_REQUIRED_SECRETS = {
    "NEXT_GITHUB_CLIENT_SECRET",
    "NEXT_GITHUB_APP_PRIVATE_KEY",
    "NEXT_GITHUB_WEBHOOK_SECRET",
}
REPOSITORY_REQUIRED_VARS = {"NEXT_GITHUB_CLIENT_ID", "NEXT_GITHUB_APP_ID", "NEXT_GITHUB_APP_SLUG"}
LEGACY_REQUIRED_VARS = {"GITHUB_OAUTH_SCOPES"}


def required_worker_secrets(config: dict) -> set[str]:
    """Return secrets required by the selected Worker application mode."""
    required = set(BASE_REQUIRED_SECRETS)
    if config.get("vars", {}).get("APPLICATION_MODE") == "repositories":
        required.update(REPOSITORY_REQUIRED_SECRETS)
    return required


def missing_worker_configuration(config: dict) -> set[str]:
    """Return missing repository-mode vars and declared secrets."""
    vars_ = config.get("vars", {})
    missing = (
        {name for name in REPOSITORY_REQUIRED_VARS if not vars_.get(name)}
        if vars_.get("APPLICATION_MODE") == "repositories"
        else {name for name in LEGACY_REQUIRED_VARS if vars_.get(name) != "public_repo"}
    )
    declared = set(config.get("secrets", {}).get("required", []))
    missing.update(required_worker_secrets(config) - declared)
    return missing

def check_wrangler_config() -> bool:
    """Validate wrangler.jsonc has expected R2 binding and vars."""
    config_path = Path(__file__).resolve().parents[2] / "analysis-launcher/wrangler.jsonc"
    if not config_path.exists():
        print(f"ERROR: {config_path} not found", file=sys.stderr)
        return False
    try:
        text = config_path.read_text(encoding="utf-8")
        config = _parse_jsonc(text)
    except Exception as e:
        print(f"ERROR: Failed to parse wrangler.jsonc: {e}", file=sys.stderr)
        return False

    # Check R2 bucket binding
    r2_buckets = config.get("r2_buckets", [])
    if not any(b.get("binding") == "ANALYSIS_REPORTS" for b in r2_buckets):
        print("ERROR: Missing ANALYSIS_REPORTS R2 bucket binding", file=sys.stderr)
        return False

    # Check temp-runs lifecycle vars
    vars_ = config.get("vars", {})
    missing_configuration = missing_worker_configuration(config)
    if missing_configuration:
        print(f"ERROR: Missing Worker configuration: {sorted(missing_configuration)}", file=sys.stderr)
        return False
    max_asset = vars_.get("MAX_ASSET_BYTES")
    max_manifest = vars_.get("MAX_MANIFEST_COMPRESSED_BYTES")
    if not max_asset or not max_manifest:
        print("ERROR: Missing MAX_ASSET_BYTES or MAX_MANIFEST_COMPRESSED_BYTES vars", file=sys.stderr)
        return False

    try:
        asset_bytes = int(max_asset)
        manifest_bytes = int(max_manifest)
    except ValueError:
        print("ERROR: MAX_ASSET_BYTES and MAX_MANIFEST_COMPRESSED_BYTES must be integers", file=sys.stderr)
        return False

    if asset_bytes > 100 * 1024 * 1024:
        print(f"WARNING: MAX_ASSET_BYTES ({asset_bytes}) exceeds 100 MB default", file=sys.stderr)
    if manifest_bytes > 900 * 1024 * 1024:
        print(f"WARNING: MAX_MANIFEST_COMPRESSED_BYTES ({manifest_bytes}) exceeds 900 MB default", file=sys.stderr)

    print("OK: wrangler.jsonc validation passed")
    return True


def check_r2_lifecycle_rule(account_id: str | None, bucket_name: str | None, access_key: str | None, secret_key: str | None) -> bool:
    """Check R2 bucket has a 1-day lifecycle rule for temp-runs/ prefix.

    Requires R2 credentials with ListBucketLifecycle permission.
    If credentials not provided, prints manual verification steps and returns True.
    """
    if not all([account_id, bucket_name, access_key, secret_key]):
        print("INFO: R2 credentials not provided; skipping automated lifecycle check.")
        print("      Manual verification: Cloudflare Dashboard -> R2 -> code-analysis-reports -> Settings -> Lifecycle rules")
        print("      Ensure a rule exists: Delete objects older than 1 day under prefix 'temp-runs/'")
        return True

    # Use AWS CLI compatible API via boto3 if available, else skip
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("INFO: boto3 not installed; skipping automated lifecycle check.")
        print("      Install with: pip install boto3")
        print("      Manual verification: Cloudflare Dashboard -> R2 -> code-analysis-reports -> Settings -> Lifecycle rules")
        print("      Ensure a rule exists: Delete objects older than 1 day under prefix 'temp-runs/'")
        return True

    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
        response = s3.get_bucket_lifecycle_configuration(Bucket=bucket_name)
        rules = response.get("Rules", [])
        found = False
        for rule in rules:
            if rule.get("Status") != "Enabled":
                continue
            filt = rule.get("Filter", {})
            prefix = filt.get("Prefix", "")
            expiration = rule.get("Expiration", {})
            days = expiration.get("Days")
            if prefix == "temp-runs/" and days == 1:
                found = True
                break
        if found:
            print("OK: R2 lifecycle rule for temp-runs/ (1 day) is configured")
            return True
        else:
            print("ERROR: R2 lifecycle rule for temp-runs/ (1 day) NOT found", file=sys.stderr)
            print("       Add rule: Delete objects older than 1 day under prefix 'temp-runs/'", file=sys.stderr)
            return False
    except Exception as e:
        print(f"ERROR: Failed to check R2 lifecycle: {e}", file=sys.stderr)
        return False


def check_worker_secrets_declared() -> bool:
    """Verify wrangler.jsonc declares all required secrets."""
    config_path = Path(__file__).resolve().parents[2] / "analysis-launcher/wrangler.jsonc"
    try:
        text = config_path.read_text(encoding="utf-8")
        config = _parse_jsonc(text)
    except Exception as e:
        print(f"ERROR: Failed to parse wrangler.jsonc: {e}", file=sys.stderr)
        return False

    missing = required_worker_secrets(config) - set(config.get("secrets", {}).get("required", []))
    if missing:
        print(f"ERROR: Missing required secrets in wrangler.jsonc: {missing}", file=sys.stderr)
        return False
    print("OK: Required Worker secrets declared")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-r2-lifecycle", action="store_true", help="Check R2 temp-runs lifecycle rule")
    parser.add_argument("--r2-account-id", help="R2 account ID (for lifecycle check)")
    parser.add_argument("--r2-bucket-name", help="R2 bucket name (for lifecycle check)")
    args = parser.parse_args()

    all_ok = True
    all_ok &= check_wrangler_config()
    all_ok &= check_worker_secrets_declared()

    if args.check_r2_lifecycle:
        all_ok &= check_r2_lifecycle_rule(
            args.r2_account_id or os.environ.get("R2_ACCOUNT_ID"),
            args.r2_bucket_name or os.environ.get("R2_BUCKET_NAME"),
            os.environ.get("R2_ACCESS_KEY"),
            os.environ.get("R2_SECRET_KEY"),
        )

    if not all_ok:
        print("VALIDATION FAILED", file=sys.stderr)
        return 1
    print("ALL VALIDATIONS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
