import unittest

from scripts.code_analysis.workspace_documents import (
    FINDINGS_PAGE_SIZE,
    build_workspace_documents,
    locator_bucket,
)


class WorkspaceDocumentTests(unittest.TestCase):
    def test_builds_compact_coverage_paged_catalog_and_locator_buckets(self):
        findings = [
            {'id': f'sid-v1:{index:064x}', 'page': index // 100, 'severity': 'LOW'}
            for index in range(FINDINGS_PAGE_SIZE + 1)
        ]
        report = {
            'analyzed_sha': 'a' * 40,
            'generated_at': '2026-10-30T00:00:00Z',
            'status': 'partial',
            'finding_count': len(findings),
            'observation_count': len(findings),
            'severities': {'LOW': len(findings)},
            'channels': [{'channel': 'semgrep', 'status': 'COMPLETED'}],
            'publication_gate': {'satisfied': True},
        }
        documents = build_workspace_documents(report, findings)
        self.assertEqual(documents['coverage.json']['schema_version'], 'project-coverage-v1')
        self.assertEqual(documents['findings-catalog.json']['pages'], 2)
        self.assertEqual(len(documents['findings-pages/0.json']), FINDINGS_PAGE_SIZE)
        self.assertEqual(len(documents['findings-pages/1.json']), 1)
        self.assertEqual(locator_bucket(findings[-1]['id']), '0')
        located = {row['id']: row['detail_page'] for row in documents['finding-locators/0.json']}
        self.assertEqual(located[findings[-1]['id']], findings[-1]['page'])

    def test_non_hex_identifiers_use_bounded_fallback_bucket(self):
        self.assertEqual(locator_bucket('issue-not-hex'), 'other')


if __name__ == '__main__':
    unittest.main()
