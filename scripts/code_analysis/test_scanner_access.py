import io
import json
import unittest
import urllib.error
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch

from scripts.code_analysis import ensure_sonar_browse as ensure_browse
from scripts.code_analysis.sonar_identity import project_identity
import yaml
from scripts.code_analysis import probe_sonar_access as probe
from scripts.code_analysis.generate_source_workflow import generate, diagnostics


class ScannerAccessTests(unittest.TestCase):
    def test_reusable_source_inputs_match_trusted_caller(self):
        for path in ('.github/workflows/reusable-source.yml',
                     '.github/workflows/reusable-source-full.yml'):
            workflow = yaml.safe_load(Path(path).read_text(encoding='utf-8'))
            trigger = workflow.get('on', workflow.get(True))
            self.assertEqual(
                set(trigger['workflow_call']['inputs']),
                {'target', 'tooling_sha', 'request_id'},
            )

    def test_source_profile_runs_after_incomplete_vendor_evidence(self):
        workflow = yaml.safe_load(Path('.github/workflows/code-analysis-source.yml').read_text(encoding='utf-8'))
        barrier = workflow['jobs']['vendor-complete']
        self.assertEqual(barrier['needs'], 'isolated-vendor')
        self.assertEqual(barrier['if'], '${{ always() }}')
        self.assertEqual(barrier['permissions'], {'contents': 'none'})
        for name in ('analyze', 'configured-profile'):
            condition = workflow['jobs'][name]['if']
            self.assertIn('always()', condition)
            self.assertIn("needs['validate-request'].result == 'success'", condition)
            self.assertNotIn("needs['isolated-vendor'].result", condition)
            self.assertEqual(workflow['jobs'][name]['needs'], ['validate-request', 'vendor-complete'])

    def test_vendor_diagnostics_cannot_publish_a_target_report(self):
        workflow = yaml.safe_load(diagnostics())
        self.assertEqual(set(workflow['jobs']), {'identity'})
        self.assertEqual(workflow['permissions'], {'contents': 'read'})
        self.assertNotIn('--assemble', diagnostics())
        self.assertEqual(Path('.github/workflows/12-scanner-diagnostics.yml').read_text(encoding='utf-8'), diagnostics())

    def test_snyk_resolver_imports_its_helpers_without_importing_source(self):
        from scripts.code_analysis.snyk_python import resolver_path
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, staged = root/'source', root/'staged'
            source.mkdir(); staged.mkdir()
            (source/'sitecustomize.py').write_text('raise RuntimeError("source imported")')
            (staged/'sibling.py').write_text('value="trusted resolver helper"')
            script = staged/'pip_resolve.py'
            script.write_text('import sibling; print(sibling.value)')
            helper = Path('scripts/code_analysis/snyk_python.py').resolve()
            result = subprocess.run([sys.executable,'-I',str(helper),str(source),str(script)], cwd=source,
                                    env={**os.environ,'PYTHONPATH':str(source)},capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('trusted resolver helper',result.stdout)
            bad = source/'pip_resolve.py'; bad.write_text('')
            with self.assertRaises(ValueError): resolver_path(str(bad),source)

    def test_branch_entitlement_is_distinct_from_token_failure(self):
        for message, kind in [('Organization is not allowed to access data from non main branches.', 'branch_entitlement'), ('private provider data', 'access_denied')]:
            error = urllib.error.HTTPError('https://sonarcloud.io', 403, 'Forbidden', {}, io.BytesIO(json.dumps({'errors':[{'msg':message}]}).encode()))
            with patch.object(probe.urllib.request, 'urlopen', side_effect=error):
                status, document = probe._request('https://sonarcloud.io', 'do-not-log')
            self.assertEqual(status, 403)
            self.assertEqual(document, {'access_failure':kind})
            self.assertNotIn(message, json.dumps(document))

    def test_vendor_scanners_are_absent_from_source_checkout_jobs(self):
        jobs = yaml.safe_load(generate())['jobs']
        self.assertNotIn('scanner-1-sonarqube-cloud', jobs)
        self.assertNotIn('scanner-3-snyk', jobs)
        for job in jobs.values():
            if 'fromJSON(inputs.target).source_repository' in yaml.safe_dump(job):
                self.assertNotIn('secrets.', yaml.safe_dump(job))

    def test_sonar_identity_is_source_scoped_and_rejects_missing_environment(self):
        self.assertEqual(project_identity('owner/other-repo'), ('owner', 'owner_other-repo'))
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(SystemExit):
                probe.probe(Path(tempfile.mkdtemp()) / 'probe.json')
            with self.assertRaises(SystemExit):
                ensure_browse.ensure(Path(tempfile.mkdtemp()) / 'grant.json')

    def test_vendor_jobs_are_opt_in_and_receive_a_credentialless_pinned_snapshot(self):
        workflow = yaml.safe_load(Path('.github/workflows/reusable-vendor.yml').read_text())
        self.assertIn("contains(fromJSON(inputs.target).requested_channels, 'snyk')", workflow['jobs']['snyk']['if'])
        self.assertIn("contains(fromJSON(inputs.target).requested_channels, 'sonarqube-cloud')", workflow['jobs']['sonar']['if'])
        self.assertIn("contains(fromJSON(inputs.target).requested_channels, 'coderabbit-ai-advisory')", workflow['jobs']['coderabbit']['if'])
        snapshot = workflow['jobs']['source-snapshot']
        checkout = next(step for step in snapshot['steps'] if step.get('uses', '').startswith('actions/checkout@'))
        self.assertEqual(checkout['with']['repository'], '${{ fromJSON(inputs.target).source_repository }}')
        self.assertEqual(checkout['with']['ref'], '${{ fromJSON(inputs.target).head_sha }}')
        self.assertFalse(checkout['with']['persist-credentials'])
        self.assertNotIn('secrets.', yaml.safe_dump(snapshot))
        package = next(step for step in snapshot['steps'] if step.get('name') == 'Package source without checkout metadata')
        self.assertIn('--exclude=.git', package['run'])
        for job_name in ('snyk', 'sonar'):
            job = workflow['jobs'][job_name]
            self.assertEqual(job['needs'], 'source-snapshot')
            self.assertEqual(job['permissions']['contents'], 'none')
            self.assertFalse(any(step.get('uses', '').startswith('actions/checkout@') and step.get('with', {}).get('path') == '.source' for step in job['steps']))
            self.assertTrue(any(step.get('uses', '').startswith('actions/download-artifact@') for step in job['steps']))

    def test_portable_sonar_does_not_trust_source_controlled_project_properties(self):
        workflow = yaml.safe_load(Path('.github/workflows/reusable-vendor.yml').read_text())
        steps = workflow['jobs']['sonar']['steps']
        settings = next(step for step in steps if step.get('name') == 'Prepare isolated Sonar project settings')
        scan = next(step for step in steps if step.get('name') == 'Run SonarQube analysis')
        self.assertIn('sonar.sources=.', settings['run'])
        self.assertIn('sonar.organization=$organization', settings['run'])
        self.assertIn('${{ runner.temp }}/sonar-project.properties', scan['with']['args'])
        self.assertNotIn('sonar.projectKey=${{', scan['with']['args'])

    def test_reconciliation_cannot_publish_checks_or_security_events_to_sources(self):
        for path in ('.github/workflows/code-analysis-reconcile.yml',
                     '.github/workflows/reusable-reconcile.yml'):
            workflow = yaml.safe_load(Path(path).read_text(encoding='utf-8'))
            permissions = workflow['jobs']['reconcile']['permissions']
            self.assertNotIn('checks', permissions)
            self.assertNotIn('security-events', permissions)


if __name__ == '__main__':
    unittest.main()
