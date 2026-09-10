import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts.code_analysis.portable_profile import validate,readiness
from scripts.code_analysis.portable_runner import execute
from scripts.code_analysis.applicability import selection
from scripts.code_analysis.snapshot import build_analysis_channels

class PortableTests(unittest.TestCase):
    def test_distinct_layouts_and_missing_commands(self):
        for profile in ({'mode':'portable','python_root':'pkg'},{'mode':'portable','javascript_root':'frontend'}):
            validate(profile)
            self.assertIn('codeql',readiness(profile))
            self.assertNotIn('coverage',readiness(profile))
        self.assertIn('bandit',readiness({'mode':'portable','python_root':'.'}))

    def test_reject_escape_and_malformed_commands(self):
        for profile in [{'mode':'portable','python_root':'../secret'},{'mode':'portable','commands':{'coverage':{'argv':'pytest'}}},{'mode':'portable','commands':{'coverage':{'argv':['pytest'],'cwd':'C:/host'}}}]:
            with self.assertRaises(ValueError):validate(profile)

    def test_coverage_retains_failed_test_exit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'source';source.mkdir();out=root/'out'
            def run(argv,**kwargs):
                if 'json' in argv:(out/'coverage.json').write_text('{"files":{}}')
                return subprocess.CompletedProcess(argv,1 if 'run' in argv else 0)
            with patch('scripts.code_analysis.portable_runner.subprocess.run',side_effect=run):
                result=execute('coverage',{'mode':'portable','commands':{'coverage':{'argv':['python','-m','coverage','run','tests.py']}}},source,out)
            self.assertEqual(result['status'],'COMPLETED');self.assertEqual(result['test_exit_code'],1)
            self.assertEqual(result['coverage_exit_code'],0)

    def test_missing_native_output_never_counts_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with patch('scripts.code_analysis.portable_runner.subprocess.run',return_value=subprocess.CompletedProcess([],0)):
                result=execute('eslint',{'mode':'portable','commands':{'eslint':{'argv':['eslint','.']}}},root,root/'output')
            self.assertEqual(result['status'],'FAILED')

    def test_execution_failure_overrides_retained_static_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'execution-status.json').write_text(json.dumps({'scanner_family':'Bandit','status':'FAILED'}))
            result=build_analysis_channels({'tools':[{'tool':'Bandit','channel':'bandit','class':'security'}]},root,{'channel_status':[{'channel':'bandit','scanner_family':'Bandit','status':'COMPLETED','artifact_files':['bandit-results.json']}]})
            self.assertEqual(result[0]['status'],'FAILED');self.assertIsNone(result[0]['findings'])

    def test_real_bandit_canary_detects_issue_in_non_product_layout(self):
        try:__import__('bandit')
        except ImportError:self.skipTest('Bandit not installed')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'source';(source/'pkg').mkdir(parents=True)
            (source/'pkg/example.py').write_text('import subprocess\nsubprocess.call("echo test", shell=True)\n')
            result=execute('bandit',{'mode':'portable','python_root':'pkg'},source,root/'output')
            self.assertEqual(result['status'],'COMPLETED')
            data=json.loads((root/'output/bandit-results.json').read_text())
            self.assertTrue(any(r['test_id']=='B602' for r in data['results']))


class NativePathTests(unittest.TestCase):
    def test_nested_typescript_diagnostics_keep_repository_prefix(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'client').mkdir()
            def run(argv,**kwargs):
                kwargs['stdout'].write('src/index.ts(2,3): error TS1234: canary\n')
                return subprocess.CompletedProcess(argv,2)
            with patch('scripts.code_analysis.portable_runner.subprocess.run',side_effect=run):
                result=execute('typescript',{'mode':'portable','commands':{'typescript':{'cwd':'client','argv':['tsc']}}},root,root/'output')
            self.assertEqual(result['status'],'COMPLETED')
            self.assertIn('client/src/index.ts(2,3)',(root/'output/tsc-results.txt').read_text())
