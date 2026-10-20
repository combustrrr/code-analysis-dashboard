import os
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.code_analysis.operator_queue import preferred_intents


class OperatorQueueTests(unittest.TestCase):
    def test_preferred_branch_refresh_runs_four_times_daily(self):
        workflow = Path('.github/workflows/preferred-branch-analysis.yml').read_text(encoding='utf-8')
        self.assertIn("cron: '17 */6 * * *'", workflow)
        self.assertIn('group: preferred-branch-analysis', workflow)
        self.assertIn('cancel-in-progress: false', workflow)

    def test_public_preferred_analysis_includes_approved_vendor_lanes(self):
        document = {
            "tooling_sha": "a" * 40,
            "execution_repository": {"id": 1},
            "projects": [{
                "id": "7",
                "source_repository": {"id": 9, "full_name": "owner/source"},
                "preferred_branch": "main",
                "profile": {"mode": "portable"},
                "enabled_scanners": ["semgrep", "snyk", "sonarqube-cloud", "coderabbit-ai-advisory"],
                "deferred_channels": {},
            }],
        }

        def github(path):
            if path == "repos/owner/source":
                return {"id": 9, "private": False}
            return {"commit": {"sha": "b" * 40}}

        with patch.dict(os.environ, {"PROJECT_ID": ""}), patch(
                "scripts.code_analysis.operator_queue.github", side_effect=github):
            intent = preferred_intents(document, "c" * 40)[0]

        self.assertEqual(intent["requested_channels"], ["semgrep", "snyk", "sonarqube-cloud"])
        self.assertNotIn("coderabbit-ai-advisory", intent["requested_channels"])


if __name__ == "__main__":
    unittest.main()
