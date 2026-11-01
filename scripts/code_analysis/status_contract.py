"""Authoritative channel completion semantics shared from the versioned contract."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "config/code-analysis/channel-status-contract.json"


def _load() -> dict[str, Any]:
    value = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if value.get("schema_version") != "channel-status-contract-v1":
        raise ValueError("channel status contract is missing or unsupported")
    statuses = value.get("statuses")
    fallback = value.get("unknown_status")
    required = {
        "category", "label", "complete", "reusable", "replacement_eligible",
        "report_incomplete", "not_run",
    }
    if not isinstance(statuses, dict) or not statuses or not isinstance(fallback, dict):
        raise ValueError("channel status contract has no status taxonomy")
    for name, row in [*statuses.items(), ("unknown_status", fallback)]:
        if not isinstance(name, str) or not name or not isinstance(row, dict) or set(row) != required:
            raise ValueError("channel status contract row is invalid")
        if row["complete"] != row["reusable"] or row["complete"] != row["replacement_eligible"]:
            raise ValueError("only complete channel evidence may be reused or replace evidence")
        if row["complete"] and (row["report_incomplete"] or row["not_run"]):
            raise ValueError("complete channel evidence has contradictory semantics")
        if row["not_run"] and row["report_incomplete"]:
            raise ValueError("not-run channel evidence cannot be an execution failure")
    return value


CONTRACT = _load()
STATUS_ROWS: dict[str, dict[str, Any]] = CONTRACT["statuses"]
UNKNOWN_STATUS: dict[str, Any] = CONTRACT["unknown_status"]
COMPLETE_STATUSES = frozenset(name for name, row in STATUS_ROWS.items() if row["complete"])
REUSABLE_STATUSES = frozenset(name for name, row in STATUS_ROWS.items() if row["reusable"])
REPLACEMENT_ELIGIBLE_STATUSES = frozenset(
    name for name, row in STATUS_ROWS.items() if row["replacement_eligible"]
)
NOT_RUN_STATUSES = frozenset(name for name, row in STATUS_ROWS.items() if row["not_run"])


def normalize(status: object) -> str:
    return str(status or "UNKNOWN").strip().upper()


def semantics(status: object) -> dict[str, Any]:
    return STATUS_ROWS.get(normalize(status), UNKNOWN_STATUS)


def is_complete(status: object) -> bool:
    return bool(semantics(status)["complete"])


def is_reusable(status: object) -> bool:
    return bool(semantics(status)["reusable"])


def is_replacement_eligible(status: object) -> bool:
    return bool(semantics(status)["replacement_eligible"])


def is_report_incomplete(status: object) -> bool:
    return bool(semantics(status)["report_incomplete"])


def is_not_run(status: object) -> bool:
    return bool(semantics(status)["not_run"])
