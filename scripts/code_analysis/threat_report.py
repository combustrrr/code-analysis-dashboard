"""Deterministic developer guidance for immutable analysis reports."""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "config/code-analysis/threat-guidance.json"
CATEGORIES = {"security", "dependency", "infrastructure", "quality", "reliability", "advisory", "unknown"}
SEVERITIES = {"CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO", "UNKNOWN"}
MAX_FINDINGS = 50_000
MAX_STRING = 4_000
MAX_REMEDIATION = 8
MAX_REFERENCES = 8
MAX_OUTPUT_BYTES = 20_000_000
SUCCESS_STATUSES = {"COMPLETED", "COMPLETED_OPTIONAL", "CONFIGURED_COMPLETE", "POLICY_FINDINGS"}


def normalize_channel(channel: dict[str, Any]) -> dict[str, Any]:
    """Create the client-facing status while retaining the raw evidence contract."""
    raw = str(channel.get("status") or "UNKNOWN")
    count = channel.get("findings")
    meaningful_count = count if isinstance(count, int) and count >= 0 else None
    if raw in SUCCESS_STATUSES:
        normalized = "COMPLETED_WITH_FINDINGS" if meaningful_count and meaningful_count > 0 else "COMPLETED_NO_FINDINGS"
    elif raw in {"OPERATIONAL_FAILURE", "INVALID_EVIDENCE", "FAILED"}:
        normalized = "FAILED"
        meaningful_count = None
    elif raw in {"NOT_AVAILABLE", "UNAVAILABLE", "SETUP_REQUIRED", "PERMISSION_DENIED", "PERMISSION_BLOCKED", "VENDOR_UNAVAILABLE", "VENDOR_PERMISSION_REQUIRED"}:
        normalized = "UNAVAILABLE"
        meaningful_count = None
    elif raw in {"NOT_APPLICABLE", "DEFERRED"}:
        normalized = "NOT_ASSESSED"
        meaningful_count = None
    elif raw in {"PARTIAL", "CONFIGURED_PARTIAL"}:
        normalized = "PARTIAL"
    else:
        normalized = "FAILED"
        meaningful_count = None
    return {
        "channel": _text(channel.get("channel") or channel.get("name"), 300),
        "name": _text(channel.get("name") or channel.get("channel"), 300),
        "raw_status": raw,
        "normalized_status": normalized,
        "reason": _text(channel.get("reason")),
        "finding_count": meaningful_count,
        "workflow": _text(channel.get("workflow"), 300) or None,
        "workflow_run_id": channel.get("workflow_run_id") or channel.get("run_id"),
        "attempt": channel.get("attempt") or channel.get("run_attempt"),
        "evidence_artifact": channel.get("status_artifact") or channel.get("artifact_files"),
        "source_sha": channel.get("source_sha") or channel.get("commit_sha"),
    }


def load_catalog(path: Path = CATALOG_PATH) -> dict[str, Any]:
    catalog = json.loads(path.read_text(encoding="utf-8"))
    if catalog.get("schema_version") != "threat-guidance-v1" or not isinstance(catalog.get("catalog_version"), str):
        raise ValueError("invalid threat guidance catalog schema")
    if set(catalog.get("categories", [])) != CATEGORIES or set(catalog.get("severities", [])) != SEVERITIES:
        raise ValueError("threat guidance taxonomy does not match the report contract")
    rules = catalog.get("rules")
    if not isinstance(rules, dict) or "default-unknown" not in rules:
        raise ValueError("threat guidance catalog has no fallback")
    for key, entry in rules.items():
        if not isinstance(key, str) or not isinstance(entry, dict):
            raise ValueError("invalid threat guidance rule")
        if entry.get("category") not in CATEGORIES or not isinstance(entry.get("title"), str):
            raise ValueError("invalid threat guidance category/title")
        if not isinstance(entry.get("summary"), str) or not isinstance(entry.get("impact"), str):
            raise ValueError("invalid threat guidance explanation")
        steps = entry.get("remediation_steps")
        refs = entry.get("references", [])
        if not isinstance(steps, list) or not 0 < len(steps) <= MAX_REMEDIATION or any(not isinstance(s, str) or not s.strip() for s in steps):
            raise ValueError("invalid threat guidance remediation steps")
        if not isinstance(refs, list) or len(refs) > MAX_REFERENCES or any(not isinstance(r, str) or not r.startswith("https://") for r in refs):
            raise ValueError("invalid threat guidance references")
    return catalog


def _text(value: Any, limit: int = MAX_STRING) -> str:
    return str(value or "")[:limit]


def _category(finding: dict[str, Any], *, advisory: bool = False) -> str:
    if advisory:
        return "advisory"
    value = str(finding.get("category") or "").lower()
    aliases = {"dependencies": "dependency", "code": "quality"}
    return aliases.get(value, value) if value in CATEGORIES or value in aliases else "unknown"


def _severity(value: Any) -> str:
    normalized = str(value or "").upper()
    return normalized if normalized in SEVERITIES else "UNKNOWN"


def _sources(finding: dict[str, Any], observations: list[dict[str, Any]]) -> list[str]:
    sources = set()
    if str(finding.get("evidence_source", "")).upper() == "AI_ADVISORY":
        sources.add("ai_advisory")
    if str(finding.get("evidence_source", "")).upper() != "AI_ADVISORY":
        sources.add("scanner")
    if not sources:
        sources.add("scanner")
    return sorted(sources)


def _match(finding: dict[str, Any], category: str, catalog: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    rules = catalog["rules"]
    rule_id = _text(finding.get("rule_id") or finding.get("concept"), 300)
    concept = _text(finding.get("concept") or rule_id, 300)
    for key, label in ((rule_id, "exact_rule"), (f"{concept}:{category}", "concept_category"), (concept, "concept"), (f"default-{category}", "category_fallback"), ("default-unknown", "global_fallback")):
        if key in rules:
            return label, rules[key]
    raise ValueError("threat guidance catalog fallback is missing")


def _identity_digest(target_sha: str, schema: str, catalog_version: str, generator: str) -> str:
    payload = json.dumps([target_sha, schema, catalog_version, generator], separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def enrich(snapshot: dict[str, Any], identity: dict[str, Any], report: dict[str, Any], *, catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    catalog = catalog or load_catalog()
    findings = [*snapshot.get("canonical_findings", []), *snapshot.get("ai_advisories", [])]
    if len(findings) > MAX_FINDINGS:
        raise ValueError("threat report finding limit exceeded")
    observations = {row["observation_id"]: row for row in snapshot.get("observations", [])}
    schema = "threat-report-v1"
    generator = f"threat-report-v1:{report.get('tooling_sha') or 'unknown'}"
    enriched = []
    matched = Counter()
    for finding in findings:
        advisory = finding in snapshot.get("ai_advisories", []) or finding.get("evidence_source") == "AI_ADVISORY"
        category = _category(finding, advisory=advisory)
        match, guidance = _match(finding, category, catalog)
        matched["fallback" if match.endswith("fallback") else "catalog"] += 1
        message = _text(finding.get("message") or finding.get("description"))
        row = {
            "finding_id": _text(finding.get("stable_id"), 200),
            "category": category,
            "severity": _severity(finding.get("severity")),
            "evidence_sources": _sources(finding, list(observations.values())),
            "guidance_source": "fallback" if match.endswith("fallback") else "catalog",
            "guidance_match": match,
            "title": _text(guidance["title"]),
            "explanation": _text(guidance["summary"]),
            "impact": _text(guidance["impact"]),
            "remediation_steps": [_text(x) for x in guidance["remediation_steps"][:MAX_REMEDIATION]],
            "references": sorted({_text(x, 500) for x in guidance.get("references", [])})[:MAX_REFERENCES],
            "message": message,
            "file": _text(finding.get("file"), 1_000),
            "line": int(finding.get("start_line") or 0),
            "rule": _text(finding.get("concept") or finding.get("rule_id"), 300),
            "scanners": sorted({_text(x, 200) for x in finding.get("supporting_scanner_families", [])}),
            "observation_ids": sorted({_text(x, 300) for x in finding.get("observation_ids", [])}),
            "evidence_provenance": [{
                "observation_id": _text(observation.get("observation_id"), 300),
                "scanner": _text(observation.get("scanner_family") or observation.get("source_tool"), 200),
                "workflow_run_id": observation.get("workflow_run_id") or observation.get("run_id"),
                "attempt": observation.get("attempt") or observation.get("run_attempt"),
                "source_sha": observation.get("commit_sha") or observation.get("source_sha"),
                "artifact": observation.get("artifact") or observation.get("artifact_path"),
            } for observation in (observations.get(observation_id) for observation_id in finding.get("observation_ids", [])) if observation],
            "uncertainty_notice": category not in {"dependency", "security"} or advisory,
        }
        enriched.append(row)
    ranks = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4, "UNKNOWN": 5}
    enriched.sort(key=lambda row: (ranks[row["severity"]], row["category"], row["file"], row["line"], row["rule"], row["finding_id"]))
    channel_matrix = [normalize_channel(channel) for channel in snapshot.get("analysis_channels", report.get("channels", []))]
    counts = Counter(row["normalized_status"] for row in channel_matrix)
    incomplete = list(report.get("incomplete_channels", []))
    coverage = {
        "status": "partial" if incomplete else "complete",
        "expected_channels": [str(c.get("channel")) for c in report.get("channels", [])],
        "available_channels": [str(c.get("channel")) for c in report.get("channels", []) if c.get("status") in {"COMPLETED", "COMPLETED_OPTIONAL", "CONFIGURED_COMPLETE", "POLICY_FINDINGS"}],
        "incomplete_channels": incomplete,
    }
    report_id = _identity_digest(report["analyzed_sha"], schema, catalog["catalog_version"], generator)
    result = {
        "schema_version": schema,
        "report_id": report_id,
        "immutable": True,
        "target": report.get("target", identity),
        "source_repository": (report.get("target") or identity).get("source_repository") or (report.get("target") or identity).get("repository"),
        "ref": (report.get("target") or identity).get("branch") or (report.get("target") or identity).get("ref"),
        "pr": (report.get("target") or identity).get("pr"),
        "target_sha": report["analyzed_sha"],
        "analysis_timestamp": report["generated_at"],
        "analysis_id": report.get("analysis_id") or (report.get("target") or identity).get("id"),
        "report_generation_timestamp": report.get("report_generation_timestamp") or report["generated_at"],
        "tooling_sha": report.get("tooling_sha"),
        "generated_at": report["generated_at"],
        "guidance_catalog_version": catalog["catalog_version"],
        "generator_version": generator,
        "publication_status": report.get("status"),
        "coverage": {
            **coverage,
            "positioning_statement": "This report contains all findings produced by the enabled and successfully completed analysis channels for the exact analyzed commit.",
            "channel_matrix": channel_matrix,
            "summary": {
                "completed_with_findings": counts["COMPLETED_WITH_FINDINGS"],
                "completed_no_findings": counts["COMPLETED_NO_FINDINGS"],
                "failed": counts["FAILED"],
                "unavailable": counts["UNAVAILABLE"],
                "not_assessed": counts["NOT_ASSESSED"],
                "partial": counts["PARTIAL"],
            },
        },
        "status": report.get("status"),
        "limitations": [
            "Findings are scanner evidence and may require developer validation.",
            "Static analysis does not prove exploitability or runtime impact.",
            "Current Kavach coverage may be limited by Sonar branch entitlement, repository posture permissions, vendor failures, and unavailable credentials.",
            "DAST and mobile coverage are not verified by this release.",
        ] + (["One or more analysis channels are incomplete or unavailable."] if incomplete else []),
        "metrics": {"findings_total": len(enriched), "findings_by_category": dict(Counter(r["category"] for r in enriched)), "findings_by_severity": dict(Counter(r["severity"] for r in enriched)), "advisories_total": sum("ai_advisory" in r["evidence_sources"] for r in enriched), "guidance_matched": matched["catalog"], "guidance_fallback": matched["fallback"]},
        "findings": enriched,
        "scanner_evidence": [
            {"finding_id": row.get("stable_id"), "scanner": row.get("supporting_scanner_families", []),
             "observation_ids": row.get("observation_ids", []), "message": _text(row.get("message") or row.get("description"))}
            for row in findings
        ],
    }
    serialized = json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(serialized) > MAX_OUTPUT_BYTES:
        raise ValueError("threat report output limit exceeded")
    return result


def _md(value: Any) -> str:
    return str(value or "").replace("\\", "\\\\").replace("`", "\\`").replace("<", "&lt;").replace(">", "&gt;").replace("|", "\\|")


def markdown(report: dict[str, Any]) -> str:
    summary = report["coverage"].get("summary", {})
    lines = ["# Threat Report", "", report["coverage"].get("positioning_statement", ""), "", "## What Was Analyzed", "", f"- Source repository: `{_md(report.get('source_repository'))}`", f"- Ref/PR: `{_md(report.get('ref') or report.get('pr') or 'exact commit')}`", f"- Exact SHA: `{_md(report['target_sha'])}`", f"- Analysis timestamp: `{_md(report.get('analysis_timestamp') or report.get('generated_at'))}`", "- Mode: `read-only`", f"- Tooling SHA: `{_md(report.get('tooling_sha'))}`", "", f"- Report ID: `{_md(report['report_id'])}`", f"- Status: **{_md(report.get('status'))}**", f"- Guidance catalog: `{_md(report['guidance_catalog_version'])}`", "", "## Coverage", "", *[f"- {label.replace('_', ' ').title()}: {summary.get(label, 0)}" for label in ("completed_with_findings", "completed_no_findings", "failed", "unavailable", "not_assessed", "partial")], f"- Findings: {report['metrics']['findings_total']}", f"- Guidance matched: {report['metrics']['guidance_matched']}", f"- Guidance fallback: {report['metrics']['guidance_fallback']}", f"- Incomplete channels: {', '.join(_md(x) for x in report['coverage']['incomplete_channels']) or 'None'}", "", "## Channel Matrix", "", "| Channel | Raw status | Report status | Findings | Reason |", "| --- | --- | --- | ---: | --- |", *[f"| {_md(row['name'])} | `{_md(row['raw_status'])}` | **{_md(row['normalized_status'])}** | {row['finding_count'] if row['finding_count'] is not None else 'N/A'} | {_md(row['reason']) or 'None'} |" for row in report["coverage"].get("channel_matrix", [])], "", "## Limitations", "", *[f"- {_md(x)}" for x in report["limitations"]], "", "## Findings", ""]
    for index, finding in enumerate(report["findings"], 1):
        lines.extend([f"### {index}. [{_md(finding['severity'])}] {_md(finding['title'])}", "", f"- Category: **{_md(finding['category'])}**", f"- Location: `{_md(finding['file'])}:{finding['line']}`", f"- Evidence: `{', '.join(finding['evidence_sources'])}`", f"- Guidance: `{_md(finding['guidance_source'])}` ({_md(finding['guidance_match'])})", "", f"**Scanner message:** {_md(finding['message'])}", "", f"**Explanation:** {_md(finding['explanation'])}", "", f"**Potential impact:** {_md(finding['impact'])}", "", "**Remediation:**", *[f"- {_md(step)}" for step in finding["remediation_steps"]], ""])
        if finding["references"]:
            lines.extend(["**References:**", *[f"- <{_md(ref)}>" for ref in finding["references"]], ""])
        if finding["uncertainty_notice"]:
            lines.extend(["> This is guidance for developer review; the retained evidence does not by itself prove a root cause or exploitable defect.", ""])
    return "\n".join(lines) + "\n"
