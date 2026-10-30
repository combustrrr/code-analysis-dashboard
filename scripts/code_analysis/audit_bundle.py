"""Create the collaborator-visible, sanitized audit bundle."""
from __future__ import annotations

import hashlib
import io
import json
import zipfile

WITHHELD = "Potential secret detected; value withheld from the audit bundle."


def _json(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def _safe_finding(row: dict) -> dict:
    scanners = [str(value) for value in row.get("scanners", [])]
    rules = [str(value) for value in row.get("rules", [])]
    secret = any(value.lower() == "gitleaks" for value in scanners) or any("secret" in value.lower() for value in rules)
    return {key: value for key, value in {
        "id": str(row.get("id") or ""), "severity": str(row.get("severity") or "UNKNOWN"),
        "category": str(row.get("category") or "Uncategorized"),
        "message": WITHHELD if secret else str(row.get("message") or ""),
        "file": str(row.get("file") or ""), "line": int(row.get("line") or 0),
        "scanners": scanners, "rules": rules,
    }.items()}


def build_audit_bundle(report: dict, findings: list[dict], overview: dict) -> tuple[str, bytes, dict]:
    """Return a deterministic ZIP without source, logs, provider payloads, or secrets."""
    safe_findings = [_safe_finding(row) for row in findings]
    sarif = {"version": "2.1.0", "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
            "runs": [{"tool": {"driver": {"name": "Code Analysis Dashboard"}}, "results": [{
                "ruleId": row["rules"][0] if row["rules"] else "unclassified",
                "level": {"CRITICAL": "error", "HIGH": "error", "MEDIUM": "warning", "LOW": "note"}.get(row["severity"], "note"),
                "message": {"text": row["message"]},
                **({"locations": [{"physicalLocation": {"artifactLocation": {"uri": row["file"]},
                    "region": {"startLine": row["line"]}}}]} if row["file"] and row["line"] > 0 else {}),
            } for row in safe_findings]}]}
    coverage = {"schema_version": "audit-coverage-v1", "channels": report.get("channels", []),
                "publication_gate": report.get("publication_gate", {}), "status": report.get("status")}
    provenance = {key: report.get(key) for key in ("analyzed_sha", "generated_at", "report_generation_timestamp",
                  "tooling_sha", "producer_runs", "requested_channels", "execution_channels", "reused_channels")}
    markdown = ["# Security evidence audit bundle", "", f"Revision: `{report.get('analyzed_sha', 'Unavailable')}`", "",
                f"Findings: {len(safe_findings)}", f"Coverage: {overview.get('coverage', {}).get('completed', 0)} of {overview.get('coverage', {}).get('total', 0)} channels complete.", "",
                "This bundle contains normalized, sanitized evidence. Raw logs, source copies, provider responses, credentials, and detected secret values are excluded."]
    files = {"normalized.sarif": _json(sarif), "report.json": _json(report),
             "coverage.json": _json(coverage), "provenance.json": _json(provenance),
             "threat-report.md": "\n".join(markdown).encode()}
    manifest = {"schema_version": "audit-bundle-v1", "analyzed_sha": report.get("analyzed_sha"),
                "documents": {name: {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)} for name, data in files.items()}}
    files["bundle-manifest.json"] = _json(manifest)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            archive.writestr(info, files[name])
    data = output.getvalue(); digest = hashlib.sha256(data).hexdigest()
    return f"audit-{digest}.zip", data, {"schema_version": "audit-bundle-v1", "sha256": digest, "bytes": len(data)}
