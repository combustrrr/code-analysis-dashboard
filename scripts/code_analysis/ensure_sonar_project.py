"""Ensure a trusted Sonar project exists with public read access before analysis."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


SERVER = "https://sonarcloud.io"


def _request(url: str, token: str = "", data: bytes | None = None) -> tuple[int, dict[str, Any]]:
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            return response.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        return error.code, {}


def ensure(organization: str, project: str, name: str, token: str,
           main_branch: str = "", analysis_mode: str = "ci_exact_revision") -> dict[str, Any]:
    if not token:
        raise SystemExit("SONAR_TOKEN is required to bootstrap a Sonar project")
    if analysis_mode != "ci_exact_revision":
        raise RuntimeError("Trusted Sonar project must use CI exact-revision analysis mode")
    query = urllib.parse.urlencode({"component": project})
    status, document = _request(f"{SERVER}/api/components/show?{query}")
    visibility = (document.get("component") or {}).get("visibility")
    created = False
    if status == 404:
        form = urllib.parse.urlencode({
            "organization": organization,
            "project": project,
            "name": name,
            "visibility": "public",
        }).encode("utf-8")
        create_status, _ = _request(f"{SERVER}/api/projects/create", token, form)
        if create_status not in {200, 201}:
            raise RuntimeError(f"Sonar public project creation failed with HTTP {create_status}")
        created = True
        status, document = _request(f"{SERVER}/api/components/show?{query}")
        visibility = (document.get("component") or {}).get("visibility")
    if status != 200 or visibility != "public":
        raise RuntimeError("Trusted Sonar project is not publicly readable")
    configured_main = ""
    if main_branch:
        branch_query = urllib.parse.urlencode({"project": project})
        branch_status, branches = _request(
            f"{SERVER}/api/project_branches/list?{branch_query}", token
        )
        if branch_status != 200:
            raise RuntimeError(f"Sonar main-branch lookup failed with HTTP {branch_status}")
        rows = branches.get("branches") or []
        current = next((row.get("name") for row in rows if row.get("isMain")), "")
        if current != main_branch:
            if any(row.get("name") == main_branch for row in rows):
                raise RuntimeError("Requested Sonar main branch already exists as non-main")
            form = urllib.parse.urlencode({"project": project, "name": main_branch}).encode("utf-8")
            rename_status, _ = _request(f"{SERVER}/api/project_branches/rename", token, form)
            if rename_status not in {200, 204}:
                raise RuntimeError(f"Sonar main-branch rename failed with HTTP {rename_status}")
        configured_main = main_branch
    result = {
        "schema_version": "1",
        "organization": organization,
        "project_key": project,
        "visibility": "public",
        "created": created,
        "main_branch": configured_main,
        "analysis_mode": analysis_mode,
        "automatic_analysis": "not_configured_for_dedicated_ci_project",
    }
    return result


def main() -> None:
    result = ensure(
        os.environ.get("SONAR_ORGANIZATION", ""),
        os.environ.get("SONAR_PROJECT_KEY", ""),
        os.environ.get("SOURCE_REPOSITORY", ""),
        os.environ.get("SONAR_TOKEN", ""),
        os.environ.get("SONAR_MAIN_BRANCH", ""),
        os.environ.get("SONAR_ANALYSIS_MODE", ""),
    )
    Path("sonar-project-bootstrap.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
