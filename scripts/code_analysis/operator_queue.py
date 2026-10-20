"""Build trusted preferred-branch queue intents for an operator workflow."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import urllib.request
import uuid

VENDOR_CHANNELS = {"snyk", "sonarqube-cloud", "coderabbit-ai-advisory"}


def stable_digest(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()


def github(path: str) -> dict:
    request = urllib.request.Request(
        "https://api.github.com/" + path,
        headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"], "Accept": "application/vnd.github+json", "User-Agent": "code-analysis-operator"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def preferred_intents(document: dict, execution_sha: str) -> list[dict]:
    intents = []
    selected = os.environ.get("PROJECT_ID", "").strip()
    for project in document["projects"]:
        if selected and str(project["id"]) != selected:
            continue
        source = project["source_repository"]
        branch = project["preferred_branch"]
        repository = github(f"repos/{source['full_name']}")
        branch_row = github(f"repos/{source['full_name']}/branches/{branch}")
        if repository["id"] != source["id"] or repository["private"]:
            raise ValueError("configured source identity or visibility changed")
        target_sha = branch_row["commit"]["sha"].lower()
        request_id = str(uuid.uuid4())
        channels = sorted(channel for channel in project["enabled_scanners"] if channel not in VENDOR_CHANNELS and channel not in project.get("deferred_channels", {}))
        profile_digest = stable_digest(project["profile"])
        intent = {
            "schema_version": "analysis-request-v3", "request_id": request_id,
            "execution_repository_id": document["execution_repository"]["id"], "project_id": str(project["id"]),
            "source_repository": source["full_name"], "source_repository_id": source["id"],
            "selection": {"kind": "branch", "ref": branch},
            "resolved_selection": {"repository": source["full_name"], "repository_id": source["id"], "kind": "commit", "ref": target_sha},
            "source_sha": target_sha, "target_sha": target_sha, "pr_context": None, "requested_channels": channels,
            "tooling_sha": document["tooling_sha"], "profile_digest": profile_digest,
            "profile_mode": "portable" if project["profile"].get("mode") == "portable" else "agentic-soc",
            "analysis_key": {"project_id": str(project["id"]), "source_repository_id": source["id"], "target_sha": target_sha, "tooling_sha": document["tooling_sha"], "profile_digest": profile_digest},
            "actor_id": 0, "idempotency_key": request_id, "run_again": True,
            "preview_id": str(uuid.uuid4()), "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z"),
            "requested_execution_sha": execution_sha,
        }
        intents.append(intent)
    if selected and not intents:
        raise ValueError("requested project is not configured")
    return intents


def main() -> None:
    document = json.loads(Path(".github/code-analysis/projects.json").read_text(encoding="utf-8-sig"))
    execution_sha = os.environ["GITHUB_SHA"].lower()
    output = Path(os.environ["RUNNER_TEMP"]) / "preferred-intents.json"
    output.write_text(json.dumps(preferred_intents(document, execution_sha), separators=(",", ":")), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
