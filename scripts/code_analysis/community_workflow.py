"""Credentialless source-scanner jobs shared by every trusted project profile."""

from scripts.code_analysis.generate_source_workflow import CHECKOUT, PYTHON, UPLOAD


def scanner_jobs():
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
        "runs-on": "ubuntu-latest",
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
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 25,
        "permissions": {"contents": "read"},
        "steps": common + [
            {"name": "Install pinned njsscan", "run": "python -m pip install njsscan==1.0.1"},
            {"name": "Analyze exact-revision JavaScript and TypeScript", "run":
             "njsscan --sarif --output owasp-js.sarif .source"},
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
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 25,
        "permissions": {"contents": "read"},
        "steps": common + [
            {"name": "Install verified TruffleHog 3.99.3", "run":
             "curl --fail --location --retry 3 https://github.com/trufflesecurity/trufflehog/releases/download/v3.99.3/trufflehog_3.99.3_linux_amd64.tar.gz -o trufflehog.tar.gz\n"
             "echo '029b182e0ed35fd5b02cd1eadc2a94bd457ab14ad22a9380b6e5d9652261d28d  trufflehog.tar.gz' | sha256sum --check\n"
             "tar -xzf trufflehog.tar.gz trufflehog"},
            {"name": "Analyze exact revision without retaining secret values", "run":
             "set -o pipefail\n./trufflehog filesystem .source --json --no-update 2>/dev/null | "
             "python -I scripts/code_analysis/trufflehog_to_sarif.py --output owasp-iac-secrets.sarif"},
            {"name": "Record completed redacted TruffleHog evidence", "run":
             "printf '%s\\n' '{\"scanner_family\":\"TruffleHog\",\"status\":\"COMPLETED\",\"reason\":\"Redacted SARIF retained for the exact revision.\",\"scanner_version\":\"3.99.3\"}' > owasp-iac-status.json"},
            {"uses": UPLOAD, "if": "always()", "with": {
                "name": "owasp-iac-secrets", "path": "owasp-iac-secrets.sarif\nowasp-iac-status.json",
                "if-no-files-found": "error", "retention-days": 7}},
        ],
    }
    return jobs
