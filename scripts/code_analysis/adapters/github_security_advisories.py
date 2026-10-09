"""GitHub Security Advisories adapter: fetch published repository security advisories (GHSA).

Read-only adapter that queries the GitHub API for published security advisories
for the selected repository. Does not run any analysis on external repositories.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

_MAX_STDERR_CHARS = 200
_SECRET_MARKERS = ("authorization", "token", "bearer", "secret", "api_key", "apikey")


def _sanitize_stderr(raw: str) -> str:
    """Return a redacted, truncated version of stderr for error messages.

    Strips lines that look like they carry credentials and caps length so no
    long stack traces or raw authorization headers are propagated.
    """
    if not raw:
        return ""
    safe_lines = []
    for line in raw.splitlines():
        lowered = line.lower()
        if any(marker in lowered for marker in _SECRET_MARKERS):
            continue
        safe_lines.append(line)
    sanitized = "\n".join(safe_lines).strip()
    if len(sanitized) > _MAX_STDERR_CHARS:
        sanitized = sanitized[:_MAX_STDERR_CHARS] + "..."
    return sanitized


def _fallback_rule_id(adv: dict) -> str:
    """Return a usable rule id, falling back when ghsa_id and id are absent."""
    return adv.get("ghsa_id") or adv.get("id") or "GHSA-UNKNOWN"


def _fallback_summary(adv: dict) -> str:
    """Return a summary, falling back to description or a neutral placeholder."""
    return adv.get("summary") or adv.get("description") or "GitHub Security Advisory"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--request", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()

    request = json.loads(a.request.read_text())
    target = request["target"]
    source_repository = target["source_repository"]
    source_sha = target["head_sha"]

    owner, repo = source_repository.split("/", 1)

    try:
        # Fetch published security advisories for the repository
        # Uses gh CLI which authenticates with GITHUB_TOKEN from the workflow environment
        result = subprocess.run(
            ["gh", "api", f"repos/{owner}/{repo}/security-advisories", "--paginate"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            # No token or API unavailable - report gracefully
            raise RuntimeError(f"gh api failed: {_sanitize_stderr(result.stderr)}")

        advisories = json.loads(result.stdout) if result.stdout.strip() else []

        findings = []
        for adv in advisories:
            # Map GHSA advisory to a finding
            ghsa_id = _fallback_rule_id(adv)
            summary = _fallback_summary(adv)
            description = adv.get("description", "")
            severity = adv.get("severity", "").upper()
            if severity not in {"CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"}:
                severity = "MEDIUM"

            # GHSA advisories dont have specific file/line info - use repo root
            findings.append({
                "rule_id": ghsa_id,
                "message": summary,
                "severity": severity,
                "file": "",
                "start_line": 0,
                "native_result_id": ghsa_id,
            })

        status = "COMPLETED" if findings else "COMPLETED_OPTIONAL"
        reason = f"Fetched {len(advisories)} published security advisory(s)" if advisories else "No published security advisories found"

    except Exception as e:
        status = "OPERATIONAL_FAILURE"
        reason = f"Failed to fetch security advisories: {e}"
        findings = []

    # Write adapter result (extension_runner wraps this in channel-evidence envelope)
    a.output.write_text(json.dumps({
        "source_repository": source_repository,
        "source_sha": source_sha,
        "status": status,
        "reason": reason,
        "findings": findings,
    }))


if __name__ == "__main__":
    main()

