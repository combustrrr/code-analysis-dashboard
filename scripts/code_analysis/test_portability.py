import json
import tempfile
import unittest
from pathlib import Path

import yaml

from scripts.code_analysis.applicability import (
    PORTABLE_JOBS,
    discover_capabilities,
    selection,
)
from scripts.code_analysis.configure_instance import bundle, configure
from scripts.code_analysis.generate_source_workflow import generate
from scripts.code_analysis.hosted import load


class PortabilityTests(unittest.TestCase):
    def config(self):
        return configure(load(Path('config/code-analysis/service.json')), 'example/source', 'example/scanners',
                         'example/dashboard', 'main', {'mode': 'portable'})

    def test_unrelated_layouts_do_not_require_python_or_javascript(self):
        for files in (['src/main.rs', 'Cargo.toml'], ['Main.java', 'pom.xml'], ['index.js', 'package.json'], ['README.md']):
            with self.subTest(files=files), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                for name in files:
                    path = root / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.touch()
                jobs, excluded, _ = selection(self.config(), root)
                self.assertEqual(set(jobs), PORTABLE_JOBS | {'snyk', 'sonarqube-cloud', 'owasp-iac-secrets'})
                self.assertEqual(excluded['atheris']['status'], 'NOT_AVAILABLE')
                self.assertNotIn('DEFERRED', {v['status'] for v in excluded.values()})

    def test_portable_capabilities_discover_generic_manifests_and_dockerfiles(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'services/api/requirements.txt').parent.mkdir(parents=True)
            (root / 'services/api/requirements.txt').touch()
            (root / 'Dockerfile.release').touch()
            (root / 'node_modules/ignored/package-lock.json').parent.mkdir(parents=True)
            (root / 'node_modules/ignored/package-lock.json').touch()
            self.assertEqual(discover_capabilities(root), {
                'dependency_manifests': ['services/api/requirements.txt'],
                'dockerfiles': ['Dockerfile.release'],
            })

    def test_portable_selection_enables_generic_scanners_from_capabilities(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'requirements.txt').touch()
            (root / 'Dockerfile').touch()
            jobs, excluded, _ = selection(self.config(), root)
            self.assertIn('osv-scanner', jobs)
            self.assertNotIn('osv', excluded)
            self.assertIn('hadolint', excluded)

    def test_portable_selection_keeps_vendor_scanners_in_the_exact_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts/code_analysis').mkdir(parents=True)
            (root / 'analysis-ui').mkdir()
            (root / '.ci').mkdir()
            (root / '.ci/requirements.txt').touch()
            (root / 'analysis-ui/package-lock.json').touch()
            config = self.config()
            config['profile'].update(python_root='scripts/code_analysis', javascript_root='analysis-ui')
            jobs, excluded, _ = selection(config, root)
            self.assertIn('snyk', jobs)
            self.assertIn('sonarqube-cloud', jobs)
            self.assertNotIn('snyk', excluded)
            self.assertNotIn('sonarqube-cloud', excluded)

    def test_portable_javascript_selection_runs_typescript_quality(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'analysis-ui').mkdir()
            config = self.config()
            config['profile'].update(javascript_root='analysis-ui', commands={
                'eslint': {'cwd': 'analysis-ui', 'argv': ['eslint', '.']},
                'typescript': {'cwd': 'analysis-ui', 'argv': ['tsc', '--noEmit']},
            })
            jobs, excluded, languages = selection(config, root)
            self.assertIn('typescript-quality', jobs)
            self.assertNotIn('eslint', excluded)
            self.assertNotIn('typescript', excluded)
            self.assertIn('javascript-typescript', languages)

    def test_portable_workflow_contains_no_original_project_harness(self):
        workflow = generate(self.config())
        jobs = yaml.safe_load(workflow)['jobs']
        for name in ('backend/', 'webui/', 'combustrrr', 'ARYDESTROYER', 'agentic-soc-backend'):
            self.assertNotIn(name, workflow)
        self.assertNotIn('scanner-7-atheris-state-machine', jobs)
        self.assertIn(' --output=semgrep-results.json .', workflow)
        self.assertEqual(jobs['scanner-3-gitleaks']['permissions'], {'contents':'read'})

    def test_portable_osv_prepares_its_nested_output_directory(self):
        from scripts.code_analysis.portable_workflow import scanner_jobs
        steps = scanner_jobs()['portable-osv-scanner']['steps']
        self.assertIn({'name':'Prepare OSV output directory',
                       'run':'mkdir -p portable-output/osv'}, steps)

    def test_current_workflow_is_unchanged(self):
        self.assertEqual(generate(), Path('.github/workflows/11-source-analysis.yml').read_text(encoding='utf-8'))

    def test_trusted_profile_runner_installs_its_pinned_runtime(self):
        jobs = yaml.safe_load(generate())['jobs']
        for name in ('scanner-1-typescript-quality', 'scanner-4-test-coverage',
                     'scanner-7-schemathesis-fuzz'):
            steps = jobs[name]['steps']
            runner = next(index for index, step in enumerate(steps)
                          if 'trusted_entry.py' in str(step.get('run', '')))
            runtime = next(index for index, step in enumerate(steps)
                           if step.get('name') == 'Install pinned trusted analysis runtime')
            self.assertLess(runtime, runner)
            self.assertIn('$RUNNER_TEMP/analysis-tooling/.ci/requirements.txt', steps[runtime]['run'])

    def test_bundle_synchronizes_all_services_without_overwriting(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'new'
            args = (self.config(), destination, 'https://new-worker.example', 'https://example.github.io/dashboard/', 'Iv-test', 'new-launcher')
            bundle(*args)
            a = load(destination / 'analysis/config/code-analysis/service.json')
            b = load(destination / 'dashboard/config/code-analysis/service.json')
            launcher = load(destination / 'launcher/wrangler.jsonc')
            self.assertEqual(a, b)
            self.assertNotIn('SOURCE_REPOSITORY', launcher['vars'])
            self.assertEqual(launcher['vars']['DASHBOARD_ORIGIN'], 'https://example.github.io')
            self.assertEqual(launcher['vars']['DASHBOARD_BASE_PATH'], '/dashboard/')
            self.assertNotIn('combustrrr', json.dumps(launcher))
            with self.assertRaises(FileExistsError):
                bundle(*args)

    def test_colliding_repositories_and_invalid_origins_are_rejected(self):
        template = load(Path('config/code-analysis/service.json'))
        with self.assertRaises(ValueError):
            configure(template, 'Owner/Repo', 'owner/repo', 'owner/site', 'main', {'mode':'portable'})
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(ValueError):
            bundle(self.config(), Path(directory)/'new', 'https://user:password@worker.example', 'https://example.github.io', 'id', 'worker')


if __name__ == '__main__':
    unittest.main()
