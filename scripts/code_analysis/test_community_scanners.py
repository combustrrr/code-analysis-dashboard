import io
import json
from pathlib import Path
import unittest

from scripts.code_analysis.community_workflow import scanner_jobs
from scripts.code_analysis.trufflehog_to_sarif import convert
from scripts.code_analysis.monitoring import canonicalize


class CommunityScannerTests(unittest.TestCase):
    def test_jobs_are_source_only_and_credentialless(self):
        jobs = scanner_jobs()
        self.assertEqual(set(jobs), {
            "community-github-actions-security", "community-owasp-js",
            "community-owasp-iac-secrets"})
        rendered = str(jobs)
        self.assertNotIn("${{ secrets.", rendered)
        self.assertNotIn("write", str([job["permissions"] for job in jobs.values()]))

    def test_trufflehog_conversion_redacts_secret_material(self):
        native = ('{"DetectorName":"AWS","Verified":true,"Raw":"do-not-retain",'
                  '"RawV2":"also-secret","SourceMetadata":{"Data":{"Filesystem":'
                  '{"file":".source/deploy/app.yml","line":7}}}}\n')
        sarif = convert(io.StringIO(native))
        serialized = str(sarif)
        self.assertNotIn("do-not-retain", serialized)
        self.assertNotIn("also-secret", serialized)
        result = sarif["runs"][0]["results"][0]
        self.assertEqual(result["ruleId"], "trufflehog/aws")
        self.assertEqual(result["locations"][0]["physicalLocation"]["artifactLocation"]["uri"], "deploy/app.yml")
        self.assertEqual(result["locations"][0]["physicalLocation"]["region"]["startLine"], 7)

    def test_trufflehog_rejects_unsafe_paths(self):
        native = ('{"DetectorName":"X","SourceMetadata":{"Data":{"Filesystem":'
                  '{"file":"../outside","line":1}}}}\n')
        with self.assertRaises(ValueError):
            convert(io.StringIO(native))

    def test_optional_scanner_family_maps_to_product_channel(self):
        manifest = json.loads(Path("config/code-analysis/required-channels.json").read_text())
        catalog = json.loads(Path("config/code-analysis/proposal-tool-catalog.json").read_text())
        current = canonicalize([{
            "source_tool": "TruffleHog", "rule_id": "trufflehog/aws",
            "message": "Potential secret; value withheld.", "severity": "HIGH",
            "file": "deploy/app.yml", "start_line": 7,
        }], "owner/repo", {"commit_sha": "a" * 40, "workflow_run_id": "1"},
            manifest, catalog)
        self.assertEqual(current["observations"][0]["channel"], "owasp-iac-secrets")

        javascript = canonicalize([{
            "source_tool": "nodejsscan", "rule_id": "missing-csp",
            "message": "Missing security control.", "severity": "MEDIUM",
            "file": "src/app.ts", "start_line": 1,
        }], "owner/repo", {"commit_sha": "a" * 40, "workflow_run_id": "1"},
            manifest, catalog)
        self.assertEqual(javascript["observations"][0]["channel"], "owasp-js")

    def test_trufflehog_status_filename_is_not_native_scanner_json(self):
        jobs = scanner_jobs()
        rendered = str(jobs["community-owasp-iac-secrets"])
        self.assertIn("owasp-iac-status.json", rendered)
        self.assertNotIn("trufflehog-status.json", rendered)

    def test_njsscan_findings_are_completed_evidence(self):
        steps = scanner_jobs()["community-owasp-js"]["steps"]
        analyze = next(step for step in steps
                       if step.get("name") == "Analyze exact-revision JavaScript and TypeScript")
        command = analyze["run"]
        self.assertIn('if [ "$scanner_status" -gt 1 ]', command)
        self.assertIn("test -s owasp-js.sarif", command)
        self.assertIn("json.load", command)


if __name__ == "__main__":
    unittest.main()
