"""Credentialless source-scanner jobs shared by every trusted project profile."""

import json
import re
from pathlib import Path

from scripts.code_analysis.generate_source_workflow import CHECKOUT, PYTHON, UPLOAD


def trufflehog_pin():
    pin = json.loads((Path(__file__).resolve().parents[2] / ".ci/trufflehog.json").read_text(encoding="utf-8"))
    version = pin.get("version", "")
    checksum = pin.get("sha256", "")
    if pin.get("checksum_version") != version or not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Invalid TruffleHog version metadata")
    if not re.fullmatch(r"[0-9a-f]{64}", checksum):
        raise ValueError("Invalid TruffleHog checksum")
    return version, checksum


def scanner_jobs():
    trufflehog_version, trufflehog_sha256 = trufflehog_pin()
    common = [
        {"uses": CHECKOUT, "with": {"ref": "${{ inputs.tooling_sha }}", "persist-credentials": False}},
        {"uses": PYTHON, "with": {"python-version": "3.11"}},
        {"uses": CHECKOUT, "with": {
            "repository": "${{ fromJSON(inputs.target).source_repository }}",
            "ref": "${{ fromJSON(inputs.target).head_sha }}",
            "path": ".source",
            "persist-credentials": False,
        }},
    ]
    jobs = {}

    jobs["community-github-actions-security"] = {
        "name": "GitHub Actions security (zizmor)",
        "needs": ["identity"],
        "if": "${{ contains(fromJSON(needs.identity.outputs.jobs), 'github-actions-security') }}",
        "runs-on": "ubuntu-24.04",
        "timeout-minutes": 20,
        "permissions": {"contents": "read"},
        "steps": common + [
            {"name": "Install pinned zizmor", "run": "python -m pip install zizmor==1.31.1"},
            {"name": "Analyze exact-revision workflow definitions", "run":
             "zizmor --format sarif .source/.github/workflows > github-actions-security.sarif"},
            {"name": "Record completed zizmor evidence", "run":
             "printf '%s\\n' '{\"scanner_family\":\"zizmor\",\"status\":\"COMPLETED\",\"reason\":\"Native SARIF retained for the exact revision.\",\"scanner_version\":\"1.31.1\"}' > zizmor-status.json"},
            {"uses": UPLOAD, "if": "always()", "with": {
                "name": "github-actions-security", "path": "github-actions-security.sarif\nzizmor-status.json",
                "if-no-files-found": "error", "retention-days": 7}},
        ],
    }

    jobs["community-owasp-js"] = {
        "name": "OWASP JavaScript security (njsscan)",
        "needs": ["identity"],
        "if": "${{ contains(fromJSON(needs.identity.outputs.jobs), 'owasp-js') }}",
        "runs-on": "ubuntu-24.04",
        "timeout-minutes": 25,
        "permissions": {"contents": "read"},
        "steps": common + [
            {"name": "Install pinned njsscan", "run": "python -m pip install njsscan==1.0.1"},
            {"name": "Analyze exact-revision JavaScript and TypeScript", "run":
             "set +e\n"
             "njsscan --sarif --output owasp-js.sarif .source\n"
             "scanner_status=$?\n"
             "set -e\n"
             "if [ \"$scanner_status\" -gt 1 ]; then exit \"$scanner_status\"; fi\n"
             "test -s owasp-js.sarif\n"
             "python -c \"import json; document=json.load(open('owasp-js.sarif', encoding='utf-8')); assert isinstance(document.get('runs'), list)\""},
            {"name": "Record completed njsscan evidence", "run":
             "printf '%s\\n' '{\"scanner_family\":\"njsscan\",\"status\":\"COMPLETED\",\"reason\":\"Native SARIF retained for the exact revision.\",\"scanner_version\":\"1.0.1\"}' > njsscan-status.json"},
            {"uses": UPLOAD, "if": "always()", "with": {
                "name": "owasp-js", "path": "owasp-js.sarif\nnjsscan-status.json",
                "if-no-files-found": "error", "retention-days": 7}},
        ],
    }

    jobs["community-owasp-iac-secrets"] = {
        "name": "OWASP IaC secrets (TruffleHog)",
        "needs": ["identity"],
        "if": "${{ contains(fromJSON(needs.identity.outputs.jobs), 'owasp-iac-secrets') }}",
        "runs-on": "ubuntu-24.04",
        "timeout-minutes": 25,
        "permissions": {"contents": "read"},
        "steps": common + [
            {"name": f"Install verified TruffleHog {trufflehog_version}", "run":
             f"curl --fail --location --retry 3 https://github.com/trufflesecurity/trufflehog/releases/download/v{trufflehog_version}/trufflehog_{trufflehog_version}_linux_amd64.tar.gz -o trufflehog.tar.gz\n"
             f"echo '{trufflehog_sha256}  trufflehog.tar.gz' | sha256sum --check\n"
             "tar -xzf trufflehog.tar.gz trufflehog"},
            {"name": "Analyze exact revision without retaining secret values", "run":
             "set -o pipefail\n./trufflehog filesystem .source --json --no-update 2>/dev/null | "
             "python -I scripts/code_analysis/trufflehog_to_sarif.py --output owasp-iac-secrets.sarif"},
            {"name": "Record completed redacted TruffleHog evidence", "run":
             f"printf '%s\\n' '{{\"scanner_family\":\"TruffleHog\",\"status\":\"COMPLETED\",\"reason\":\"Redacted SARIF retained for the exact revision.\",\"scanner_version\":\"{trufflehog_version}\"}}' > owasp-iac-status.json"},
            {"uses": UPLOAD, "if": "always()", "with": {
                "name": "owasp-iac-secrets", "path": "owasp-iac-secrets.sarif\nowasp-iac-status.json",
                "if-no-files-found": "error", "retention-days": 7}},
        ],
    }
    return jobs
