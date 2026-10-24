import json
import unittest
from scripts.code_analysis.promote_tooling import FILES,replacement,relevant
class PromotionTests(unittest.TestCase):
    def test_changes_only_exact_immutable_pins(self):
        files={FILES[0]:json.dumps({'tooling_sha':'a'*40,'projects':[{'id':'1'}]})}
        result=replacement(files,'b'*40)
        self.assertEqual(json.loads(result[FILES[0]])['projects'],[{'id':'1'}])
        self.assertTrue(all('a'*40 not in x for x in result.values()))
        with self.assertRaises(ValueError):replacement(files,'main')
    def test_docs_and_pin_only_commits_do_not_loop(self):
        for path in ['Journal.md','.github/code-analysis/projects.json']:
            self.assertFalse(relevant(path))
        for path in ['.ci/requirements.txt','scripts/code_analysis/portable_runner.py','.github/workflows/reusable-source.yml']:
            self.assertTrue(relevant(path))

    def test_sonar_profile_retains_vendor_identity(self):
        from pathlib import Path
        content=Path('sonar-project.properties').read_text()
        self.assertIn('sonar.projectKey=combustrrr_code-analysis-dashboard',content)
        self.assertIn('sonar.organization=combustrrr',content)

    def test_promotion_is_separate_from_credential_free_validation(self):
        from pathlib import Path
        import yaml
        workflow=yaml.safe_load(Path('.github/workflows/15-tooling-rollout.yml').read_text())
        self.assertEqual(workflow['permissions'],{'contents':'read'})
        self.assertNotIn('secrets.',json.dumps(workflow['jobs']['validate']))
        self.assertEqual(workflow['jobs']['promote']['needs'],'validate')
        self.assertIn('scanner_smoke',json.dumps(workflow['jobs']['validate']))
        reconcile=json.dumps(workflow['jobs']['promote'])
        self.assertIn('seq 1 36',reconcile)
        self.assertIn('startswith(\\"tooling-rollout/\\")',reconcile)
        self.assertNotIn('workflow_run',json.dumps(workflow.get(True,workflow.get('on'))))
