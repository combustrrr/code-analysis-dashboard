import unittest

from scripts.code_analysis.project_overview import build_project_overview


class ProjectOverviewTests(unittest.TestCase):
    def test_builds_bounded_overview_from_normalized_evidence(self):
        report = {'analyzed_sha': 'a' * 40, 'generated_at': '2026-10-30T00:00:00Z',
                  'observation_count': 3, 'publication_gate': {'satisfied': False},
                  'channels': [{'channel': 'semgrep', 'name': 'Semgrep', 'status': 'COMPLETED'},
                               {'channel': 'codeql', 'name': 'CodeQL', 'status': 'FAILED'}]}
        findings = [{'id': 'f1', 'severity': 'HIGH', 'category': 'security', 'message': 'text',
                     'file': 'src/auth/a.py', 'line': 4, 'scanners': ['Semgrep', 'CodeQL'], 'rules': ['R1']},
                    {'id': 'f2', 'severity': 'LOW', 'category': 'quality', 'message': 'text',
                     'file': 'src/auth/b.py', 'line': 8, 'scanners': ['Semgrep'], 'rules': ['R1']}]
        value = build_project_overview(report, findings)
        self.assertEqual(value['schema_version'], 'project-overview-v1')
        self.assertEqual(value['findings']['located'], 2)
        self.assertEqual(value['coverage']['incomplete_channels'], ['CodeQL'])
        self.assertEqual(value['investigation_clusters'][0]['finding_count'], 2)
        self.assertEqual(value['distributions']['scanner_overlap'][0]['count'], 1)


if __name__ == '__main__':
    unittest.main()
