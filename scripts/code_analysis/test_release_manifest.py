import json
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

    def test_write_keeps_channel_progress_but_excludes_finding_payloads(self):
        state = {'targets': [{'channel_statuses': [{
            'channel': 'ruff', 'status': 'COMPLETED', 'observation_count': 2,
            'findings': [{'message': 'large'}], 'observation_ids': ['one', 'two'],
            'scanner_version': '0.16.9',
        }]}]}
        with patch.object(release_manifest.github, 'cf_api') as api:
            release_manifest.write({'analysis_repository': 'owner/repo'}, 'analysis-current-1', state)
        payload = json.loads(api.call_args.kwargs['data'])
        channel = payload['targets'][0]['channel_statuses'][0]
        self.assertEqual(channel['status'], 'COMPLETED')
        self.assertEqual(channel['observation_count'], 2)
        self.assertNotIn('findings', channel)
        self.assertNotIn('observation_ids', channel)

    def test_storage_failure_is_not_treated_as_missing(self):
        with patch.object(release_manifest.github, 'cf_api', side_effect=RuntimeError('storage unavailable')):
            with self.assertRaisesRegex(RuntimeError, 'storage unavailable'):
                release_manifest.read({}, 'analysis-current-1')

    def test_empty_or_invalid_manifest_fails_closed(self):
        for response in (b'', b'[]'):
            with self.subTest(response=response), patch.object(release_manifest.github, 'cf_api', return_value=response):
                with self.assertRaises(ValueError):
                    release_manifest.read({}, 'analysis-current-1')
