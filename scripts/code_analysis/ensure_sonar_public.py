"""Idempotently make one trusted SonarQube Cloud project public."""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT = re.compile(r"^[A-Za-z0-9_.:-]+$")
SERVER = "https://sonarcloud.io"


def _request(url: str, token: str = "", data: bytes | None = None) -> tuple[int, dict]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            return response.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        return error.code, {}


def ensure(project: str, token: str, output: Path) -> dict:
    if not PROJECT.fullmatch(project):
        raise ValueError("Invalid trusted Sonar project key")
    if not token:
        raise SystemExit("SONAR_TOKEN is required to establish project visibility")
    query = urllib.parse.urlencode({"component": project})
    public_status, public_document = _request(f"{SERVER}/api/components/show?{query}")
    visibility = (public_document.get("component") or {}).get("visibility")
    changed = False
    update_status: int | None = None
    if public_status != 200 or visibility != "public":
        form = urllib.parse.urlencode({"project": project, "visibility": "public"}).encode("ascii")
        update_status, _ = _request(f"{SERVER}/api/projects/update_visibility", token, form)
        if update_status not in {200, 204}:
            raise RuntimeError(f"Sonar project visibility update failed with HTTP {update_status}")
        changed = True
        public_status, public_document = _request(f"{SERVER}/api/components/show?{query}")
        visibility = (public_document.get("component") or {}).get("visibility")
    if public_status != 200 or visibility != "public":
        raise RuntimeError("Sonar project public visibility could not be verified")
    result = {"schema_version": "1", "project_key": project, "visibility": "public",
              "changed": changed, "update_http_status": update_status}
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    args = parser.parse_args()
    ensure(args.project, os.environ.get("SONAR_TOKEN", ""), Path("sonar-visibility.json"))


if __name__ == "__main__":
    main()
