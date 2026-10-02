"""Durable, operator-reset evaluation dispatch guardrails."""
from __future__ import annotations

import hashlib
import json
from typing import Any


def profile_digest(project: dict[str, Any]) -> str:
    profile = {
        "enabled_scanners": sorted(project.get("enabled_scanners", [])),
        "deferred_channels": project.get("deferred_channels", {}),
        "profile": project.get("profile", {}),
    }
    return hashlib.sha256(json.dumps(profile, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def idempotency_key(source_repository: str, target_sha: str, tooling_sha: str, scanner_profile_digest: str) -> str:
    return f"evaluation-v1:{source_repository}:{target_sha}:{tooling_sha}:{scanner_profile_digest}"


def state_for(state: dict[str, Any], source_repository: str, target_sha: str,
              tooling_sha: str, scanner_digest: str) -> dict[str, Any]:
    """Return the normalized durable lock state without mutating the caller."""
    result = dict(state)
    result.setdefault("evaluation_mode", True)
    result.setdefault("evaluation_target_sha", target_sha)
    result.setdefault("evaluation_dispatches_used", 0)
    result.setdefault("evaluation_paused", False)
    result["evaluation_idempotency_key"] = idempotency_key(source_repository, target_sha, tooling_sha, scanner_digest)
    return result


def can_dispatch(state: dict[str, Any], target_sha: str) -> tuple[bool, str]:
    if state.get("evaluation_paused"):
        return False, "Evaluation is paused by an operator."
    frozen = state.get("evaluation_target_sha")
    if frozen and frozen != target_sha:
        return False, "Evaluation target SHA is frozen; refusing a moving target."
    if int(state.get("evaluation_dispatches_used", 0)) >= 1:
        return False, "Evaluation dispatch budget is exhausted; operator reset required."
    return True, ""


def consume(state: dict[str, Any], request_id: str, key: str) -> dict[str, Any]:
    result = dict(state)
    result.update(evaluation_dispatches_used=1, evaluation_request_id=request_id,
                  evaluation_idempotency_key=key, evaluation_status="dispatching")
    return result
