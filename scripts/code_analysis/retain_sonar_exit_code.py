#!/usr/bin/env python3
"""Retain the Sonar scanner's native exit code from its current check annotation."""

from __future__ import annotations

import json
import os
import re
import time
import urllib.request


EXIT_CODE = re.compile(r"sonar-scanner.+failed with exit code (\d+)", re.IGNORECASE)
REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def exit_code(annotations: list[dict]) -> int | None:
    for annotation in annotations:
        match = EXIT_CODE.search(str(annotation.get("message", "")))
        if match:
            return int(match.group(1))
    return None


def request(path: str) -> object:
    api_request = urllib.request.Request(
        "https://api.github.com/" + path,
        headers={"Accept": "application/vnd.github+json", "User-Agent": "code-analysis-dashboard",
                 "X-GitHub-Api-Version": "2022-11-28"},
    )
    with urllib.request.urlopen(api_request, timeout=30) as response:
        return json.load(response)


def main() -> None:
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    if not REPOSITORY.fullmatch(repository) or not run_id.isdigit():
        return
    for attempt in range(6):
        jobs = request(f"repos/{repository}/actions/runs/{run_id}/jobs?per_page=100")
        sonar_jobs = [job for job in jobs.get("jobs", [])
                      if str(job.get("name", "")).endswith("Isolated SonarQube evidence")]
        if sonar_jobs:
            annotations = request(f"repos/{repository}/check-runs/{int(sonar_jobs[-1]['id'])}/annotations?per_page=100")
            code = exit_code(annotations if isinstance(annotations, list) else [])
            if code is not None:
                print(code)
                return
        if attempt < 5:
            time.sleep(2)


if __name__ == "__main__":
    main()
