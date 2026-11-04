import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.code_analysis.operator_queue import preferred_intents


class OperatorQueueTests(unittest.TestCase):
    def test_preferred_branch_batch_is_explicit_and_serialized(self):
        workflow = Path('.github/workflows/preferred-branch-analysis.yml').read_text(encoding='utf-8')
        self.assertIn('workflow_dispatch:', workflow)
        self.assertNotIn('schedule:', workflow)
        self.assertNotIn('cron:', workflow)
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

    def test_production_preferred_batch_submits_one_uniform_catalog(self):
        document = json.loads(Path('.github/code-analysis/projects.json').read_text(encoding='utf-8'))
        repositories = {
            project['source_repository']['full_name']: project['source_repository']['id']
            for project in document['projects']
        }

        def github(path):
            parts = path.split('/')
            full_name = '/'.join(parts[1:3])
            if len(parts) == 3:
                return {'id': repositories[full_name], 'private': False}
            return {'commit': {'sha': 'b' * 40}}

        with patch.dict(os.environ, {'PROJECT_ID': ''}), patch(
                'scripts.code_analysis.operator_queue.github', side_effect=github):
            intents = preferred_intents(document, 'c' * 40)

        requested = [set(intent['requested_channels']) for intent in intents]
        expected = set(document['projects'][0]['enabled_scanners']) - {'coderabbit-ai-advisory'}
        self.assertEqual(len(requested), len(document['projects']))
        self.assertTrue(all(channels == expected for channels in requested))


if __name__ == "__main__":
    unittest.main()
