"""Validate a claimed external queue envelope and emit an immutable scanner target."""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

from scripts.code_analysis.hosted import target

EXECUTION_REPOSITORY_ID = 1360051890
PROJECTS = {
    "1267340546": ("ARYDESTROYER/Kavach-AgenticSOC", 1267340546),
    "1278177697": ("combustrrr/Agentic-Kibana", 1278177697),
    "1360051890": ("combustrrr/code-analysis-dashboard", 1360051890),
}


def scanner_target(claim: dict) -> dict:
    intent = claim.get("intent")
    if not isinstance(intent, dict) or intent.get("schema_version") != "analysis-request-v4":
        raise ValueError("invalid queue envelope")
    required = ("request_id", "project_id", "source_repository", "source_repository_id",
                "source_sha", "tooling_sha", "profile_digest", "profile_mode")
    if any(not intent.get(key) for key in required):
        raise ValueError("incomplete queue envelope")
    expected = PROJECTS.get(str(intent["project_id"]))
    if (intent.get("execution_repository_id") != EXECUTION_REPOSITORY_ID
            or expected != (intent["source_repository"], intent["source_repository_id"])
            or not isinstance(intent.get("actor_id"), int)
            or not re.fullmatch(r"[0-9a-f-]{36}", intent.get("idempotency_key", ""))
            or not re.fullmatch(r"[0-9a-f]{40}", intent["source_sha"])
            or not re.fullmatch(r"[0-9a-f]{40}", intent["tooling_sha"])
            or not re.fullmatch(r"[0-9a-f]{64}", intent["profile_digest"])
            or intent["profile_mode"] not in {"portable", "agentic-soc"}
            or not isinstance(intent.get("requested_channels"), list)
            or not intent["requested_channels"]):
        raise ValueError("queue envelope identity is not trusted")
    resolved = intent.get("resolved_selection") or {}
    selection = intent.get("selection") or {}
    context = intent.get("pr_context") or {}
    if resolved.get("kind") != "commit" or resolved.get("ref") != intent["source_sha"] or intent.get("target_sha") != intent["source_sha"]:
        raise ValueError("queue envelope is not pinned to a commit")
    if resolved.get("repository_id") != (context.get("head_repository_id") or intent["source_repository_id"]):
        raise ValueError("resolved repository identity mismatch")
    kind = selection.get("kind")
    branch = context.get("head_branch") or selection.get("ref") or intent["target_sha"]
    row = target(intent["source_repository"], branch, intent["source_sha"],
                 pr=context.get("number") if kind == "pr" else None,
                 source_repository=resolved.get("repository"),
                 base_sha=context.get("base_sha") if kind == "pr" else None,
                 base_branch=context.get("base_branch") if kind == "pr" else None,
                 kind=kind)
    row.update(project_id=intent["project_id"], tooling_sha=intent["tooling_sha"],
               profile_digest=intent["profile_digest"], profile_mode=intent["profile_mode"],
               requested_channels=intent.get("requested_channels", []),
               execution_channels=intent.get("requested_channels", []),
               dispatch_id=expected_dispatch_id(intent["request_id"], intent.get("requested_channels", [])),
               queue_intent=intent)
    return row


def expected_dispatch_id(request_id: str, channels: list[str]) -> str:
    import hashlib
    return request_id[:8] + "-" + hashlib.sha256((request_id + ":" + ",".join(channels)).encode()).hexdigest()[:16]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("claim", type=Path)
    args = parser.parse_args()
    claim = json.loads(args.claim.read_text(encoding="utf-8"))
    row = scanner_target(claim)
    execution_sha = os.environ.get("GITHUB_SHA", "").lower()
    if not re.fullmatch(r"[0-9a-f]{40}", execution_sha):
        raise ValueError("coordinator execution revision is unavailable")
    row["execution_sha"] = execution_sha
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as stream:
            stream.write("request_id=" + claim["request_id"] + "\n")
            stream.write("project_id=" + str(claim["intent"]["project_id"]) + "\n")
            stream.write("tooling_sha=" + claim["intent"]["tooling_sha"] + "\n")
            stream.write("profile_mode=" + claim["intent"]["profile_mode"] + "\n")
            stream.write("generation=" + str(claim["generation"]) + "\n")
            stream.write("lease_token=" + claim["lease_token"] + "\n")
            stream.write("target=" + json.dumps(row, separators=(",", ":")) + "\n")
    else:
        print(json.dumps(row, separators=(",", ":")))


if __name__ == "__main__":
    main()
