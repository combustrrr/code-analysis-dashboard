import unittest
from scripts.code_analysis.channel_registry import (
    load_channels,
    get_channel,
    channels_by_class,
    validate_descriptor,
)


class TestChannelRegistry(unittest.TestCase):
    def test_load_channels_contains_required_channels(self):
        channels = load_channels()
        self.assertGreaterEqual(len(channels), 1)
        names = {row['channel'] for row in channels}
        self.assertIn('codeql', names)
        self.assertIn('bandit', names)
        self.assertIn('ext-github-security-advisories', names)

    def test_get_channel_codeql_is_security(self):
        row = get_channel('codeql')
        self.assertIsNotNone(row)
        self.assertEqual(row['class'], 'security')

    def test_channels_by_class_has_security(self):
        grouped = channels_by_class()
        self.assertIn('security', grouped)
        self.assertGreaterEqual(len(grouped['security']), 1)

    def test_validate_descriptor_rejects_invalid_class(self):
        with self.assertRaises(ValueError):
            validate_descriptor({
                'channel': 'x',
                'tool': 'x',
                'class': 'bogus',
                'surface': 'repo',
                'evidence_source': 'DETERMINISTIC',
            })

    def test_validate_descriptor_rejects_missing_required_key(self):
        with self.assertRaises(ValueError):
            validate_descriptor({
                'channel': 'x',
                'tool': 'x',
                'class': 'security',
                'surface': 'repo',
            })

    def test_validate_descriptor_accepts_valid_minimal(self):
        result = validate_descriptor({
            'channel': 'x',
            'tool': 'x',
            'class': 'security',
            'surface': 'repo',
            'evidence_source': 'DETERMINISTIC',
        })
        self.assertEqual(result['channel'], 'x')


if __name__ == '__main__':
    unittest.main()
