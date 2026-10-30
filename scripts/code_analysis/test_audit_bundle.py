import io
import json
import unittest
import zipfile

from scripts.code_analysis.audit_bundle import WITHHELD, build_audit_bundle


class AuditBundleTests(unittest.TestCase):
    def test_bundle_is_deterministic_and_withholds_secret_values(self):
        report = {'analyzed_sha': 'a' * 40, 'generated_at': '2026-10-30T00:00:00Z',
                  'status': 'partial', 'channels': [], 'publication_gate': {'satisfied': False}}
        findings = [{'id': 'secret-1', 'severity': 'HIGH', 'category': 'security',
                     'message': 'token=actual-secret-value', 'file': 'app.py', 'line': 2,
                     'scanners': ['Gitleaks'], 'rules': ['hardcoded-secret']}]
        overview = {'coverage': {'completed': 0, 'total': 1}}
        name, data, metadata = build_audit_bundle(report, findings, overview)
        second = build_audit_bundle(report, findings, overview)
        self.assertEqual((name, data, metadata), second)
        self.assertEqual(metadata['sha256'], name.removeprefix('audit-').removesuffix('.zip'))
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = set(archive.namelist())
            self.assertEqual(names, {'normalized.sarif', 'report.json', 'coverage.json',
                                     'provenance.json', 'threat-report.md', 'bundle-manifest.json'})
            content = b''.join(archive.read(item) for item in names)
            self.assertNotIn(b'actual-secret-value', content)
            self.assertIn(WITHHELD.encode(), content)
            manifest = json.loads(archive.read('bundle-manifest.json'))
            self.assertEqual(manifest['schema_version'], 'audit-bundle-v1')


if __name__ == '__main__':
    unittest.main()
