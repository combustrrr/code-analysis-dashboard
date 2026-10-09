import unittest
from unittest.mock import patch

from scripts.code_analysis import release_manifest


class ReleaseManifestTests(unittest.TestCase):
    def test_repository_qualified_manifest_write_and_legacy_read_fallback(self):
        config = {'analysis_repository': 'Owner/Repo'}
        with patch.object(release_manifest.github, 'cf_api', side_effect=[b'{}', b'{"targets":[]}']) as api:
            self.assertEqual(release_manifest.read(config, 'analysis-current-1'), {'targets': []})
        self.assertEqual(api.call_args_list[0].args[1], '/api/report/repositories/owner/repo/analysis-current-1.json')
        with patch.object(release_manifest.github, 'cf_api') as api:
            release_manifest.write(config, 'analysis-current-1', {'targets': []})
        self.assertEqual(api.call_args.args[1], '/api/report/repositories/owner/repo/analysis-current-1.json')

    def test_missing_manifest_is_empty_state(self):
        with patch.object(release_manifest.github, 'cf_api', return_value=b'{}'):
            self.assertEqual(release_manifest.read({}, 'analysis-current-1'), {})

    def test_storage_failure_is_not_treated_as_missing(self):
        with patch.object(release_manifest.github, 'cf_api', side_effect=RuntimeError('storage unavailable')):
            with self.assertRaisesRegex(RuntimeError, 'storage unavailable'):
                release_manifest.read({}, 'analysis-current-1')

    def test_empty_or_invalid_manifest_fails_closed(self):
        for response in (b'', b'[]'):
            with self.subTest(response=response), patch.object(release_manifest.github, 'cf_api', return_value=response):
                with self.assertRaises(ValueError):
                    release_manifest.read({}, 'analysis-current-1')
