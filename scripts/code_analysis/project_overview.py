"""Build the bounded, publication-time project overview document."""
from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import PurePosixPath


def _count_entries(values, *, limit: int | None = None):
    rows = [{"label": str(label), "count": count}
            for label, count in Counter(values).most_common() if label]
    return rows[:limit] if limit else rows


def _directory(path: str) -> str:
    if not path:
        return "Unlocated"
    parent = str(PurePosixPath(path).parent)
    return "(root)" if parent == "." else parent


def build_project_overview(report: dict, findings: list[dict]) -> dict:
    """Derive a compact overview exclusively from normalized public evidence."""
    completed_statuses = {
        "COMPLETED", "COMPLETED_OPTIONAL", "CONFIGURED_COMPLETE", "POLICY_FINDINGS",
    }
    channels = [row for row in report.get("channels", []) if isinstance(row, dict)]
    incomplete = [str(row.get("name") or row.get("channel") or "Unknown scanner")
                  for row in channels if row.get("status") not in completed_statuses]
    severity = [str(row.get("severity") or "UNKNOWN") for row in findings]
    categories = [str(row.get("category") or "Uncategorized") for row in findings]
    scanners = [str(value) for row in findings for value in set(row.get("scanners") or [])]
    rules = [str(value) for row in findings
             for value in (row.get("rules") or ["Rule unavailable"])]
    directories = [_directory(str(row.get("file") or "")) for row in findings]
    overlap = ["3+ scanners" if len(set(row.get("scanners") or [])) >= 3
               else f"{max(1, len(set(row.get('scanners') or [])))} scanner"
               for row in findings]
    located = sum(bool(row.get("file") and row.get("line")) for row in findings)

    severity_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    priority = sorted(findings, key=lambda row: (
        severity_rank.get(str(row.get("severity") or "UNKNOWN").upper(), 9),
        str(row.get("file") or ""), int(row.get("line") or 0), str(row.get("id") or ""),
    ))[:8]
    priority_findings = [{key: row.get(key) for key in (
        "id", "severity", "category", "message", "file", "line", "scanners", "rules",
    )} for row in priority]

    clusters: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in findings:
        directory = _directory(str(row.get("file") or ""))
        for rule in row.get("rules") or ["Rule unavailable"]:
            clusters[(str(rule), directory)].append(row)
    investigation_clusters = []
    for (rule, directory), rows in sorted(clusters.items(), key=lambda item: (-len(item[1]), item[0])):
        if len(rows) < 2:
            continue
        investigation_clusters.append({
            "rule": rule,
            "directory": directory,
            "finding_count": len(rows),
            "file_count": len({str(row.get("file") or "") for row in rows}),
            "finding_ids": [str(row.get("id") or "") for row in rows[:20]],
        })
        if len(investigation_clusters) == 8:
            break

    return {
        "schema_version": "project-overview-v1",
        "analyzed_sha": report.get("analyzed_sha"),
        "generated_at": report.get("report_generation_timestamp") or report.get("generated_at"),
        "findings": {
            "total": len(findings),
            "observations": int(report.get("observation_count") or 0),
            "critical": severity.count("CRITICAL"),
            "high": severity.count("HIGH"),
            "located": located,
        },
        "coverage": {
            "completed": sum(row.get("status") in completed_statuses for row in channels),
            "total": len(channels),
            "publication_gate_satisfied": bool(report.get("publication_gate", {}).get("satisfied")),
            "incomplete_channels": incomplete,
        },
        "distributions": {
            "severity": _count_entries(severity),
            "category": _count_entries(categories, limit=12),
            "scanner": _count_entries(scanners, limit=12),
            "rule": _count_entries(rules, limit=12),
            "directory": _count_entries(directories, limit=12),
            "scanner_overlap": _count_entries(overlap),
        },
        "priority_findings": priority_findings,
        "investigation_clusters": investigation_clusters,
    }
