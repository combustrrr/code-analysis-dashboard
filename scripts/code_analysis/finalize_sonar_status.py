#!/usr/bin/env python3
"""Publish Sonar completion only after scan, compute, and native export are proven."""

from __future__ import annotations

import json
import os
from pathlib import Path


def build_status(scan_outcome: str, export_outcome: str, native_path: Path,
                 scanner_exit_code: int | None = None) -> dict:
    base = {"schema_version": "1", "scanner_family": "SonarQube Cloud"}
    if scan_outcome != "success":
        exit_detail = (f" with exit code {scanner_exit_code}"
                       if scanner_exit_code is not None else " with a non-zero exit code")
        return {**base, "status": "OPERATIONAL_FAILURE", "scanner_exit_code": scanner_exit_code,
                "reason": (f"Sonar analysis failed{exit_detail}. Successful compute processing and native issue "
                           "export were not proven. Sonar findings are unknown.")}
    if export_outcome != "success" or not native_path.is_file():
        return {**base, "status": "OPERATIONAL_FAILURE", "scanner_exit_code": scanner_exit_code,
                "reason": ("Sonar analysis was submitted, but successful compute processing and native issue export "
                           "were not proven. Sonar findings are unknown.")}
    try:
        native = json.loads(native_path.read_text(encoding="utf-8"))
        issues = native["issues"]
        if (native.get("scanner_family") != "SonarQube Cloud" or not isinstance(issues, list)
                or native.get("native_issue_count") != len(issues) or not native.get("analysis_id")):
            raise ValueError("invalid native Sonar export")
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return {**base, "status": "INVALID_EVIDENCE", "scanner_exit_code": scanner_exit_code,
                "reason": ("Sonar compute processing returned, but the retained native issue export is invalid. "
                           "Sonar findings are unknown.")}
    return {**base, "status": "CONFIGURED_COMPLETE", "scanner_exit_code": scanner_exit_code,
            "native_issue_count": len(issues),
            "reason": "Successful compute processing and native issue export were proven for the exact target revision."}


def main() -> None:
    scan_outcome = os.environ.get("SONAR_SCAN_OUTCOME", "")
    export_outcome = os.environ.get("SONAR_EXPORT_OUTCOME", "")
    raw_exit_code = os.environ.get("SONAR_SCANNER_EXIT_CODE", "")
    scanner_exit_code = int(raw_exit_code) if raw_exit_code.isdigit() else None
    native_path = Path("sonar-native-issues.json")
    output_path = Path("sonar-status.json")
    result = build_status(scan_outcome, export_outcome, native_path, scanner_exit_code)
    output_path.write_text(json.dumps(result, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
