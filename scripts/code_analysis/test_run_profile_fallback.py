"""Focused tests for explicit run_profile.py configuration."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from scripts.code_analysis import run_profile
from scripts.code_analysis import hosted as h


class ExplicitProfileTests(unittest.TestCase):
    def write_config(self, directory, profile):
        path = Path(directory) / 'service.json'
        path.write_text(json.dumps({'profile': profile}), encoding='utf-8')
        return path

    def test_example_profile_is_not_used_as_a_production_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / 'missing-service.json'
            with patch.object(run_profile, 'SERVICE_CONFIG', missing):
                with self.assertRaisesRegex(SystemExit, 'Explicit service profile configuration is required'):
                    run_profile.load_profile('python-test')

    def test_empty_profile_fails_before_source_execution(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self.write_config(tmp, {})
            with patch.object(run_profile, 'SERVICE_CONFIG', config):
                with self.assertRaisesRegex(SystemExit, 'missing a non-empty profile'):
                    run_profile.load_profile('python-test')

    def test_missing_task_fields_are_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self.write_config(tmp, {'python_root': '.'})
            with patch.object(run_profile, 'SERVICE_CONFIG', config):
                with self.assertRaisesRegex(SystemExit, 'python_requirements'):
                    run_profile.load_profile('python-install')

    def test_explicit_configured_profile_runs_without_guessed_commands(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source'
            source.mkdir()
            config = self.write_config(tmp, {
                'python_root': 'backend',
                'python_requirements': 'requirements.txt',
                'python_test_command': ['python', '-m', 'pytest', 'reviewed-tests'],
            })
            (source / 'backend').mkdir()
            with patch.object(run_profile, 'SERVICE_CONFIG', config), \
                    patch('sys.argv', ['profile', 'python-test', '--source', str(source)]), \
                    patch.object(run_profile.subprocess, 'run', return_value=SimpleNamespace(returncode=3)) as run:
                run_profile.main()
            self.assertEqual(run.call_args.args[0], ['python', '-m', 'pytest', 'reviewed-tests'])
            self.assertEqual(run.call_args.kwargs['cwd'], source / 'backend')
            self.assertEqual(h.load(source / 'backend' / 'coverage-status.json')['test_exit_code'], 3)


if __name__ == '__main__':
    unittest.main()
