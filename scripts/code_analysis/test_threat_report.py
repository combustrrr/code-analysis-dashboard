import copy
import json
import unittest

from scripts.code_analysis.threat_report import enrich, load_catalog, markdown, normalize_channel


class ThreatReportTests(unittest.TestCase):
    def setUp(self):
        self.identity = {'id': 'target', 'repository': 'owner/repo', 'source_repository': 'owner/repo', 'kind': 'branch', 'branch': 'main', 'head_sha': 'a' * 40}
        self.snapshot = {
            'canonical_findings': [{
                'stable_id': 'f1', 'concept': 'hardcoded-secret', 'category': 'security', 'severity': 'HIGH',
                'file': 'app.py', 'start_line': 3, 'message': '<script>alert(1)</script>',
                'supporting_scanner_families': ['Gitleaks'], 'evidence_source': 'DETERMINISTIC'
            }, {
                'stable_id': 'f2', 'concept': 'unknown-rule', 'category': 'unclassified', 'severity': 'bad',
                'file': 'README.md', 'start_line': 1, 'message': 'Review | this',
                'supporting_scanner_families': ['Unknown'], 'evidence_source': 'AI_ADVISORY'
            }], 'ai_advisories': [], 'observations': []
        }
        self.report = {'target': self.identity, 'analyzed_sha': 'a' * 40, 'generated_at': '2026-10-02T00:00:00Z',
                       'tooling_sha': 'b' * 40, 'status': 'current', 'incomplete_channels': [],
                       'channels': [{'channel': 'gitleaks', 'status': 'COMPLETED'}]}

    def test_catalog_validates_and_matching_is_deterministic(self):
        catalog = load_catalog()
        first = enrich(self.snapshot, self.identity, self.report, catalog=catalog)
        second = enrich(copy.deepcopy(self.snapshot), self.identity, self.report, catalog=catalog)
        self.assertEqual(json.dumps(first, sort_keys=True), json.dumps(second, sort_keys=True))
        self.assertEqual(first['findings'][0]['guidance_match'], 'exact_rule')
        self.assertEqual(first['findings'][1]['guidance_source'], 'fallback')
        self.assertEqual(first['findings'][1]['evidence_sources'], ['ai_advisory'])
        self.assertEqual(first['findings'][1]['category'], 'advisory')
        self.assertEqual(first['findings'][1]['severity'], 'UNKNOWN')
        self.assertTrue(first['report_id'])

    def test_markdown_escapes_untrusted_text(self):
        report = enrich(self.snapshot, self.identity, self.report)
        output = markdown(report)
        self.assertNotIn('<script>', output)
        self.assertIn('&lt;script&gt;', output)
        self.assertIn('Review \\| this', output)

    def test_raw_statuses_normalize_without_erasing_reasons(self):
        cases = {
            'COMPLETED': 'COMPLETED_NO_FINDINGS',
            'POLICY_FINDINGS': 'COMPLETED_WITH_FINDINGS',
            'FAILED': 'FAILED',
            'NOT_AVAILABLE': 'UNAVAILABLE',
            'NOT_APPLICABLE': 'NOT_ASSESSED',
            'DEFERRED': 'NOT_ASSESSED',
            'PARTIAL': 'PARTIAL',
        }
        for raw, expected in cases.items():
            row = normalize_channel({'channel': raw.lower(), 'name': raw, 'status': raw,
                                     'findings': 2 if raw == 'POLICY_FINDINGS' else 0,
                                     'reason': 'retained reason'})
            self.assertEqual(row['normalized_status'], expected)
            self.assertEqual(row['reason'], 'retained reason')
        self.assertIsNone(normalize_channel({'channel': 'x', 'status': 'FAILED', 'findings': 3})['finding_count'])

    def test_report_contains_positioning_and_channel_matrix(self):
        report = enrich(self.snapshot, self.identity, self.report)
        self.assertIn('enabled and successfully completed', report['coverage']['positioning_statement'])
        self.assertEqual(report['coverage']['summary']['completed_no_findings'], 1)
        self.assertEqual(report['coverage']['channel_matrix'][0]['raw_status'], 'COMPLETED')
        self.assertIn('Channel Matrix', markdown(report))


if __name__ == '__main__':
    unittest.main()
