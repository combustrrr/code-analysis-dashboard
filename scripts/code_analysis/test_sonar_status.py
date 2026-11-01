import json
import tempfile
import unittest
from pathlib import Path

import yaml

from scripts.code_analysis.finalize_sonar_status import build_status


class SonarStatusTests(unittest.TestCase):
    def test_scanner_exit_three_is_unknown_not_completed_zero(self):
        result = build_status('failure', 'skipped', Path('missing.json'), scanner_exit_code=3)
        self.assertEqual(result['status'], 'OPERATIONAL_FAILURE')
        self.assertEqual(result['scanner_exit_code'], 3)
        self.assertEqual(
            result['reason'],
            'Sonar analysis failed with exit code 3. Successful compute processing and native issue export were not proven. Sonar findings are unknown.',
        )
        self.assertNotIn('native_issue_count', result)

    def test_completion_requires_valid_native_export(self):
        with tempfile.TemporaryDirectory() as directory:
            native = Path(directory) / 'sonar-native-issues.json'
            native.write_text(json.dumps({
                'scanner_family': 'SonarQube Cloud', 'analysis_id': 'analysis-1',
                'native_issue_count': 0, 'issues': [],
            }), encoding='utf-8')
            result = build_status('success', 'success', native)
            self.assertEqual(result['status'], 'CONFIGURED_COMPLETE')
            self.assertEqual(result['native_issue_count'], 0)

            native.write_text('{}', encoding='utf-8')
            self.assertEqual(build_status('success', 'success', native)['status'], 'INVALID_EVIDENCE')

    def test_vendor_workflow_finalizes_after_export(self):
        workflow = yaml.safe_load(Path('.github/workflows/reusable-vendor.yml').read_text(encoding='utf-8'))
        steps = workflow['jobs']['sonar']['steps']
        scan = next(step for step in steps if step.get('name') == 'Run SonarQube analysis')
        export = next(step for step in steps if step.get('name') == 'Export Sonar findings')
        finalize = next(step for step in steps if step.get('name') == 'Finalize truthful Sonar status')
        self.assertEqual(scan['id'], 'sonar_scan')
        self.assertEqual(export['id'], 'sonar_export')
        self.assertIn('steps.sonar_scan.outcome', finalize['env']['SONAR_SCAN_OUTCOME'])
        self.assertIn('steps.sonar_export.outcome', finalize['env']['SONAR_EXPORT_OUTCOME'])
        self.assertNotIn('CONFIGURED_COMPLETE', yaml.safe_dump(steps))


if __name__ == '__main__':
    unittest.main()
