#!/usr/bin/env python3
"""Convert TruffleHog JSON lines to redacted SARIF without retaining secrets."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def convert(lines) -> dict:
    results = []
    rules = set()
    for line in lines:
        try:
            row = json.loads(line)
        except (json.JSONDecodeError, TypeError):
            raise ValueError("TruffleHog returned malformed JSON evidence")
        detector = str(row.get("DetectorName") or "potential-secret")
        metadata = row.get("SourceMetadata", {}).get("Data", {})
        filesystem = metadata.get("Filesystem", {}) if isinstance(metadata, dict) else {}
        path = str(filesystem.get("file") or "").replace("\\", "/").removeprefix(".source/")
        line_number = filesystem.get("line") or 1
        if not path or path.startswith("/") or ".." in Path(path).parts or type(line_number) is not int:
            raise ValueError("TruffleHog result has an unsafe source location")
        rule_id = "trufflehog/" + detector.lower().replace(" ", "-")
        rules.add((rule_id, detector))
        results.append({
            "ruleId": rule_id,
            "level": "error" if row.get("Verified") else "warning",
            "message": {"text": "Potential secret detected; value withheld from analysis evidence."},
            "locations": [{"physicalLocation": {
                "artifactLocation": {"uri": path},
                "region": {"startLine": max(1, line_number)},
            }}],
        })
    return {
        "version": "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "runs": [{
            "tool": {"driver": {"name": "TruffleHog", "rules": [
                {"id": rule_id, "name": name, "shortDescription": {"text": "Potential secret"}}
                for rule_id, name in sorted(rules)
            ]}},
            "results": results,
        }],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(convert(sys.stdin), sort_keys=True), encoding="utf-8")


if __name__ == "__main__":
    main()
