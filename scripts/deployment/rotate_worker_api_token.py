#!/usr/bin/env python3
"""Rotate the dual-store Worker API token without printing or passing it in argv.

The Worker temporarily accepts WORKER_API_TOKEN_NEXT. Rotation establishes that
alternate first, updates GitHub, promotes the Cloudflare primary, then removes
the alternate. A failed intermediate phase leaves either the old primary or the
new alternate usable; rerunning safely begins another bounded transition.
"""
from __future__ import annotations

import argparse
import secrets
import shutil
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _command(name: str) -> str:
    value = shutil.which(name) or (shutil.which(name + ".cmd") if name == "npx" else None)
    if not value:
        raise RuntimeError(f"required command is unavailable: {name}")
    return value


def _stdin_secret(command: list[str], value: str, cwd: Path, run=subprocess.run) -> None:
    run(command, cwd=cwd, input=value + "\n", text=True, check=True)


def _probe(worker_origin: str, value: str, opener=urllib.request.urlopen) -> None:
    request = urllib.request.Request(worker_origin.rstrip("/") + "/api/internal/rotation-probe", headers={"Authorization": "Bearer " + value})
    try:
        response = opener(request, timeout=20)
        status = getattr(response, "status", response.getcode())
    except urllib.error.HTTPError as error:
        status = error.code
    if status != 204:
        raise RuntimeError(f"Worker rotation probe failed with HTTP {status}")


def rotate(worker_origin: str, repository: str, *, run=subprocess.run, opener=urllib.request.urlopen, token: str | None = None) -> None:
    value = token or secrets.token_urlsafe(48)
    if len(value) < 43:
        raise ValueError("generated Worker API token lacks required entropy")
    npx, gh = _command("npx"), _command("gh")
    launcher = ROOT / "analysis-launcher"
    wrangler = [npx, "--yes", "wrangler@4.129.1", "secret"]
    _stdin_secret([*wrangler, "put", "WORKER_API_TOKEN_NEXT"], value, launcher, run)
    _probe(worker_origin, value, opener)
    _stdin_secret([gh, "secret", "set", "WORKER_API_TOKEN", "--repo", repository], value, ROOT, run)
    _stdin_secret([*wrangler, "put", "WORKER_API_TOKEN"], value, launcher, run)
    _probe(worker_origin, value, opener)
    run([*wrangler, "delete", "WORKER_API_TOKEN_NEXT"], cwd=launcher, input="y\n", text=True, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker-origin", required=True)
    parser.add_argument("--repository", default="combustrrr/code-analysis-dashboard")
    parser.add_argument("--confirm-production-rotation", action="store_true")
    args = parser.parse_args()
    if not args.confirm_production_rotation:
        parser.error("refusing to rotate without --confirm-production-rotation")
    if not args.worker_origin.startswith("https://"):
        parser.error("worker origin must use HTTPS")
    rotate(args.worker_origin, args.repository)
    print("Worker API token rotation completed; no secret value was logged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
