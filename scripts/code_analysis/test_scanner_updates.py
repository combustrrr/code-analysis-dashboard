import json
import re
import unittest
from pathlib import Path

import yaml

from scripts.code_analysis import extensions


class ScannerUpdateTests(unittest.TestCase):
    def test_frontend_runtime_channels_are_registered_for_every_frontend_project(self):
        service = json.loads(Path('config/code-analysis/service.json').read_text(encoding='utf-8'))
        rows = {row['channel']: row for row in extensions.registry(service)}
        frontend_channels = {
            'ext-axe-accessibility', 'ext-frontend-build',
            'ext-frontend-tests', 'ext-lighthouse-ui',
        }
        self.assertEqual(set(rows).intersection(frontend_channels), frontend_channels)
        for channel in frontend_channels:
            self.assertEqual(rows[channel]['mode'], 'source')
            self.assertEqual(rows[channel].get('secrets', {}), {})
            self.assertEqual(rows[channel]['class'], 'reliability')
        projects = json.loads(Path('.github/code-analysis/projects.json').read_text(encoding='utf-8'))['projects']
        reviewed_agentic = service['profile']
        for project in projects:
            self.assertTrue(frontend_channels.issubset(set(project['enabled_scanners'])))
            profile = project['profile']
            self.assertTrue(profile['javascript_root'])
            for key in ('javascript_install_command', 'javascript_test_command',
                        'frontend_build_command', 'frontend_preview_command'):
                self.assertTrue(all(isinstance(item, str) and item for item in profile[key]))
            self.assertRegex(profile['frontend_preview_url'], r'^http://127\.0\.0\.1:[0-9]+/$')
            if profile.get('mode') == 'agentic-soc':
                self.assertEqual(
                    {key: value for key, value in profile.items() if key != 'mode'},
                    reviewed_agentic,
                    'agentic-soc projects must match the reviewed reusable adapter',
                )

    def test_frontend_adapters_resolve_the_selected_trusted_project_profile(self):
        from scripts.code_analysis.adapters.frontend_common import profile
        projects = json.loads(Path('.github/code-analysis/projects.json').read_text(encoding='utf-8'))['projects']
        for project in projects:
            self.assertEqual(profile(project['id']), project['profile'])
        with self.assertRaises(ValueError):
            profile('../../untrusted')

        for name in ('frontend_build.py', 'frontend_tests.py',
                     'frontend_axe.py', 'frontend_lighthouse.py'):
            adapter = Path('scripts/code_analysis/adapters') / name
            source = adapter.read_text(encoding='utf-8')
            self.assertIn("frontend(a.source, target['project_id'])", source,
                          f'{name} must select the reviewed project profile')

    def test_zizmor_pin_is_stable_and_synchronized_across_generated_workflows(self):
        paths = (
            'config/code-analysis/workflow-templates/03-dependency-security.yml',
            'scripts/code_analysis/community_workflow.py',
            '.github/workflows/11-source-analysis.yml',
            '.github/workflows/reusable-source.yml',
            '.github/workflows/reusable-source-full.yml',
        )
        pins = {}
        for path in paths:
            matches = set(re.findall(
                r'zizmor==([0-9]+\.[0-9]+\.[0-9]+)',
                Path(path).read_text(encoding='utf-8'),
            ))
            self.assertEqual(len(matches), 1, f'{path} must contain one stable exact Zizmor pin')
            pins[path] = matches.pop()
        self.assertEqual(
            len(set(pins.values())),
            1,
            f'Zizmor pins must be synchronized by sync_scanner_workflows: {pins}',
        )

    def test_standalone_tooling_cannot_borrow_product_configuration(self):
        import tempfile
        from unittest.mock import patch

        from scripts.code_analysis import audit_workflows as audit
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'config').mkdir()
            (root/'config/ruff.toml').write_text('line-length = 100')
            with patch.object(audit, 'ROOT', root):
                self.assertEqual(audit.missing_tooling_paths('ruff --config $RUNNER_TEMP/analysis-tooling/backend/pyproject.toml'), ['backend/pyproject.toml'])
                self.assertEqual(audit.missing_tooling_paths('ruff --config .analysis-tooling/config/ruff.toml'), [])

    def test_inventory_accepts_one_hundred_independent_extensions(self):
        example = json.loads(Path('config/code-analysis/scanner-extension.example.json').read_text())
        rows = [{**example, 'channel': f'ext-scanner-{i}', 'name': f'Independent scanner {i}'} for i in range(100)]
        manifest, catalog = extensions.contracts({'scanner_extensions': rows}, {'required_static_channels': []}, {'tools': []})
        self.assertEqual(len(manifest['required_static_channels']), 100)
        self.assertEqual(len(catalog['tools']), 100)

    def test_all_stable_updates_require_native_compatibility_before_automerge(self):
        policy = json.loads(Path('.github/renovate-scanners.json').read_text())
        self.assertTrue(policy['automerge'])
        self.assertFalse(policy['ignoreTests'])
        self.assertTrue(policy['ignoreUnstable'])
        self.assertEqual(policy['minimumReleaseAge'], '3 days')
        self.assertEqual(set(policy['ignoreDeps']), {'python', 'node'})
        runtime_rule = next(rule for rule in policy['packageRules']
                            if set(rule.get('matchPackageNames', [])) == {'python', 'node'})
        self.assertFalse(runtime_rule['enabled'])
        self.assertEqual(runtime_rule['matchManagers'], ['github-actions'])
        # Renovate removed requiredStatusChecks; enforce the named gate through
        # branch protection rather than a deprecated configuration key.
        updater = Path('.github/workflows/13-scanner-updates.yml').read_text()
        self.assertIn('protection/required_status_checks', updater)
        self.assertIn('Scanner compatibility', updater)
        self.assertNotIn('requiredStatusChecks', policy)
        scanner_rule = next(rule for rule in policy['packageRules'] if rule.get('groupName'))
        update_types = set(scanner_rule['matchUpdateTypes'])
        self.assertEqual(update_types, {'major', 'minor', 'patch', 'digest', 'pin'})
        self.assertEqual(scanner_rule['groupName'], 'validated scanner dependencies')
        workflow = yaml.safe_load(Path('.github/workflows/14-scanner-compatibility.yml').read_text())
        self.assertEqual(workflow['permissions'], {'contents': 'read'})
        self.assertNotIn('secrets.', json.dumps(workflow))
        self.assertIn('scanner_smoke', json.dumps(workflow))

    def test_bad_adapter_does_not_discard_a_healthy_sibling(self):
        import tempfile

        from scripts.code_analysis import hosted
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            row = json.loads(Path('config/code-analysis/scanner-extension.example.json').read_text())
            config = {'scanner_extensions': [row, {**row, 'channel': 'ext-second', 'name': 'Second'}]}
            identity = hosted.target('sample/repo', 'main', 'a' * 40)
            good = {'schema_version': 'channel-evidence-v1', 'channel': 'ext-second',
                    'source_repository': 'sample/repo', 'source_sha': 'a' * 40,
                    'target_id': identity['id'], 'producer_run_id': '1',
                    'status': 'COMPLETED', 'reason': '', 'findings': []}
            hosted.write(root/'ext-second.channel-evidence', good)
            hosted.write(root/'ext-example.channel-evidence', {**good, 'channel': 'ext-example', 'status': []})
            _, status = extensions.ingest(config, root, identity, '1')
            self.assertEqual(status['ext-example']['status'], 'INVALID_EVIDENCE')
            self.assertEqual(status['ext-second']['status'], 'COMPLETED')

    def test_malformed_registration_is_rejected_predictably(self):
        for row in [None, [], {'channel': []}]:
            with self.assertRaises(ValueError):
                extensions.registry({'scanner_extensions': [row]})
        example = json.loads(Path('config/code-analysis/scanner-extension.example.json').read_text())
        with self.assertRaises(ValueError):
            extensions.registry({'scanner_extensions': [{**example, 'name': 'Ruff'}]})

    def test_adapter_rerun_cannot_reuse_stale_result(self):
        import os
        import tempfile
        from types import SimpleNamespace
        from unittest.mock import patch

        from scripts.code_analysis import extension_runner as runner
        from scripts.code_analysis import hosted
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            row = json.loads(Path('config/code-analysis/scanner-extension.example.json').read_text())
            row['mode'] = 'vendor'
            hosted.write(root/'config/code-analysis/service.json', {'scanner_extensions': [row]})
            adapter = root/row['adapter']
            adapter.parent.mkdir(parents=True)
            adapter.write_text('')
            identity = hosted.target('sample/repo', 'main', 'a'*40)
            work = root/'.extension-output/ext-example'
            hosted.write(work/'adapter-result.json', {'source_repository': 'sample/repo', 'source_sha': 'a'*40,
                          'status': 'COMPLETED', 'reason': '', 'findings': []})
            with patch.object(runner, '__file__', str(root/'scripts/code_analysis/extension_runner.py')), \
                    patch.dict(os.environ, TARGET_JSON=json.dumps(identity), GITHUB_RUN_ID='1', TOOLING_SHA='b'*40, GITHUB_SHA='b'*40), \
                    patch.object(runner, 'checked_out_tooling_sha', return_value='b'*40), \
                    patch.object(runner.subprocess, 'run', return_value=SimpleNamespace(returncode=0)):
                runner.run('ext-example')
            result = hosted.load(root/'.extension-output/ext-example.channel-evidence')
            self.assertEqual(result['status'], 'OPERATIONAL_FAILURE')

    def test_scorecard_update_cannot_keep_an_old_checksum(self):
        import io
        import shutil
        import tempfile
        from unittest.mock import patch

        from scripts.code_analysis.sync_scanner_workflows import sync
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'.ci').mkdir()
            (root/'.github/workflows').mkdir(parents=True)
            (root/'scripts/code_analysis').mkdir(parents=True)
            templates=root/'config/code-analysis/workflow-templates';templates.mkdir(parents=True)
            shutil.copy('config/code-analysis/workflow-templates/01-code-quality.yml', templates)
            shutil.copy('config/code-analysis/workflow-templates/03-dependency-security.yml', templates)
            shutil.copy('scripts/code_analysis/generate_source_workflow.py', root/'scripts/code_analysis')
            shutil.copy('scripts/code_analysis/portable_workflow.py', root/'scripts/code_analysis')
            pin = {'version': '9.0.0', 'checksum_version': '5.5.0', 'sha256': 'a'*64}
            path = root/'.ci/scorecard.json'
            path.write_text(json.dumps(pin))
            (root/'.ci/trufflehog.json').write_text(json.dumps({
                'version': '3.99.7', 'checksum_version': '3.99.7', 'sha256': 'b'*64}))
            with patch('urllib.request.urlopen', return_value=io.BytesIO(b'wrong asset')), \
                    patch('subprocess.run') as execute:
                with self.assertRaises(ValueError): sync(root)
                execute.assert_not_called()
            self.assertEqual(json.loads(path.read_text()), pin)
            checksum = ('b'*64 + '  scorecard_9.0.0_linux_amd64.tar.gz\n').encode()
            with patch('urllib.request.urlopen', return_value=io.BytesIO(checksum)), patch('subprocess.run'):
                sync(root)
            self.assertEqual(json.loads(path.read_text())['sha256'], 'b'*64)
            self.assertEqual(json.loads(path.read_text())['checksum_version'], '9.0.0')

    def test_trufflehog_update_cannot_keep_an_old_checksum(self):
        import io
        import shutil
        import tempfile
        from unittest.mock import patch

        from scripts.code_analysis.sync_scanner_workflows import sync
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'.ci').mkdir()
            (root/'.github/workflows').mkdir(parents=True)
            (root/'scripts/code_analysis').mkdir(parents=True)
            templates = root/'config/code-analysis/workflow-templates'; templates.mkdir(parents=True)
            shutil.copy('config/code-analysis/workflow-templates/01-code-quality.yml', templates)
            shutil.copy('config/code-analysis/workflow-templates/03-dependency-security.yml', templates)
            shutil.copy('scripts/code_analysis/generate_source_workflow.py', root/'scripts/code_analysis')
            shutil.copy('scripts/code_analysis/portable_workflow.py', root/'scripts/code_analysis')
            (root/'.ci/scorecard.json').write_text(json.dumps({
                'version': '5.5.0', 'checksum_version': '5.5.0', 'sha256': 'a'*64}))
            pin = {'version': '4.0.0', 'checksum_version': '3.99.7', 'sha256': 'b'*64}
            path = root/'.ci/trufflehog.json'; path.write_text(json.dumps(pin))
            checksum = ('c'*64 + '  trufflehog_4.0.0_linux_amd64.tar.gz\n').encode()
            with patch('urllib.request.urlopen', return_value=io.BytesIO(checksum)), patch('subprocess.run'):
                sync(root)
            updated = json.loads(path.read_text())
            self.assertEqual(updated['sha256'], 'c'*64)
            self.assertEqual(updated['checksum_version'], '4.0.0')


if __name__ == '__main__':
    unittest.main()


class PortableMaintenanceTests(unittest.TestCase):
    def test_portable_pins_and_reusable_generation_are_maintained(self):
        policy=json.loads(Path('.github/renovate-scanners.json').read_text())
        self.assertIn('scripts/code_analysis/portable_workflow.py',policy['includePaths'])
        self.assertIn('.github/code-analysis/projects.json',policy['includePaths'])
        self.assertIn('.github/workflows/reusable-source.yml',policy['postUpgradeTasks']['fileFilters'])
        self.assertIn('scripts.code_analysis.generate_reusable_workflows',Path('scripts/code_analysis/sync_scanner_workflows.py').read_text())
