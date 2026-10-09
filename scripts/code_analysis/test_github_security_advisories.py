"""Tests for GitHub Security Advisories adapter."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

from scripts.code_analysis.adapters.github_security_advisories import main as adapter_main


class GitHubSecurityAdvisoriesAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def _run_adapter(self, request_json, mock_gh_output=None, mock_gh_returncode=0):
        """Run the adapter with a request and optional mocked gh output."""
        request_file = self.root / "request.json"
        output_file = self.root / "output.json"
        request_file.write_text(json.dumps(request_json))

        with patch("subprocess.run") as mock_run:
            if mock_gh_output is not None:
                mock_run.return_value = Mock(
                    returncode=mock_gh_returncode,
                    stdout=json.dumps(mock_gh_output),
                    stderr="",
                )
            else:
                mock_run.return_value = Mock(returncode=1, stdout="", stderr="auth failed")

            import subprocess
            import sys
            # Simulate command line args
            old_argv = sys.argv
            sys.argv = ["github_security_advisories.py", "--request", str(request_file), "--output", str(output_file)]
            try:
                adapter_main()
            finally:
                sys.argv = old_argv

        return json.loads(output_file.read_text())

    def test_adapter_fetches_and_maps_advisories(self):
        """Test that adapter fetches GHSA advisories and maps to findings."""
        request = {
            "target": {
                "source_repository": "owner/repo",
                "head_sha": "a" * 40,
            }
        }
        mock_advisories = [
            {
                "ghsa_id": "GHSA-1234-5678-90ab",
                "summary": "XSS in example package",
                "description": "Cross-site scripting vulnerability",
                "severity": "high",
            },
            {
                "ghsa_id": "GHSA-abcd-efgh-ijkl",
                "summary": "SQL injection in user input",
                "description": "",
                "severity": "critical",
            },
        ]
        result = self._run_adapter(request, mock_gh_output=mock_advisories)

        self.assertEqual(result["source_repository"], "owner/repo")
        self.assertEqual(result["source_sha"], "a" * 40)
        self.assertEqual(result["status"], "COMPLETED")
        self.assertEqual(len(result["findings"]), 2)
        self.assertEqual(result["findings"][0]["rule_id"], "GHSA-1234-5678-90ab")
        self.assertEqual(result["findings"][0]["severity"], "HIGH")
        self.assertEqual(result["findings"][1]["severity"], "CRITICAL")

    def test_adapter_no_advisories(self):
        """Test adapter when no advisories are found."""
        request = {
            "target": {
                "source_repository": "owner/repo",
                "head_sha": "a" * 40,
            }
        }
        result = self._run_adapter(request, mock_gh_output=[])

        self.assertEqual(result["status"], "COMPLETED_OPTIONAL")
        self.assertEqual(result["findings"], [])

    def test_adapter_gh_api_failure(self):
        """Test adapter when gh api fails (e.g., no auth, rate limit)."""
        request = {
            "target": {
                "source_repository": "owner/repo",
                "head_sha": "a" * 40,
            }
        }
        result = self._run_adapter(request, mock_gh_output=None, mock_gh_returncode=1)

        self.assertEqual(result["status"], "OPERATIONAL_FAILURE")
        self.assertIn("Failed to fetch security advisories", result["reason"])
        self.assertEqual(result["findings"], [])

    def test_adapter_malformed_gh_response(self):
        """Test adapter handles malformed gh api response."""
        request = {
            "target": {
                "source_repository": "owner/repo",
                "head_sha": "a" * 40,
            }
        }
        # Invalid JSON from gh
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = Mock(returncode=0, stdout="not json", stderr="")
            request_file = self.root / "request.json"
            output_file = self.root / "output.json"
            request_file.write_text(json.dumps(request))

            import sys
            old_argv = sys.argv
            sys.argv = ["github_security_advisories.py", "--request", str(request_file), "--output", str(output_file)]
            try:
                adapter_main()
            finally:
                sys.argv = old_argv

            result = json.loads(output_file.read_text())
            self.assertEqual(result["status"], "OPERATIONAL_FAILURE")

    def test_adapter_identity_verification(self):
        """Test that adapter output includes correct source_repository and source_sha."""
        sha = "b" * 40
        request = {
            "target": {
                "source_repository": "different/owner",
                "head_sha": sha,
            }
        }
        result = self._run_adapter(request, mock_gh_output=[{"ghsa_id": "GHSA-test", "summary": "Test", "severity": "medium"}])

        self.assertEqual(result["source_repository"], "different/owner")
        self.assertEqual(result["source_sha"], sha)


    def test_adapter_missing_ghsa_id_falls_back(self):
        """Advisory without ghsa_id or id falls back to GHSA-UNKNOWN."""
        request = {"target": {"source_repository": "owner/repo", "head_sha": "a" * 40}}
        result = self._run_adapter(request, mock_gh_output=[{"summary": "XSS", "severity": "high"}])
        self.assertEqual(result["status"], "COMPLETED")
        self.assertEqual(result["findings"][0]["rule_id"], "GHSA-UNKNOWN")
        self.assertEqual(result["findings"][0]["native_result_id"], "GHSA-UNKNOWN")

    def test_adapter_unknown_severity_defaults_to_medium(self):
        """Unknown or empty severity defaults to MEDIUM."""
        request = {"target": {"source_repository": "owner/repo", "head_sha": "a" * 40}}
        result = self._run_adapter(request, mock_gh_output=[
            {"ghsa_id": "GHSA-1", "summary": "A", "severity": "weird"},
            {"ghsa_id": "GHSA-2", "summary": "B", "severity": ""},
        ])
        self.assertEqual(result["findings"][0]["severity"], "MEDIUM")
        self.assertEqual(result["findings"][1]["severity"], "MEDIUM")

    def test_adapter_missing_summary_and_description_fallback(self):
        """Missing summary and description fall back to a neutral placeholder."""
        request = {"target": {"source_repository": "owner/repo", "head_sha": "a" * 40}}
        result = self._run_adapter(request, mock_gh_output=[{"ghsa_id": "GHSA-3", "severity": "low"}])
        self.assertEqual(result["findings"][0]["message"], "GitHub Security Advisory")

    def test_adapter_stderr_sanitization(self):
        """Stderr containing credentials is not echoed into the RuntimeError message."""
        from scripts.code_analysis.adapters import github_security_advisories as ghsa
        raw = (
            "Some context line\n"
            "Authorization: Bearer ghp_secret_token_value\n"
            "X-Token: abc123def456\n"
            "gh: error: The request could not be fulfilled\n"
        )
        sanitized = ghsa._sanitize_stderr(raw)
        self.assertNotIn("ghp_secret_token_value", sanitized)
        self.assertNotIn("abc123def456", sanitized)
        self.assertNotIn("Authorization", sanitized)
        self.assertIn("gh: error: The request could not be fulfilled", sanitized)
        # Long stderr is truncated
        long_raw = "x" * 500
        self.assertTrue(ghsa._sanitize_stderr(long_raw).endswith("..."))


if __name__ == "__main__":
    unittest.main()
