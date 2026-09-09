import unittest
from unittest.mock import patch
from scripts.code_analysis.test_projects import config
from scripts.code_analysis.native_feedback import publish, sarif
from scripts.code_analysis.generate_reusable_workflows import reusable_source
from scripts.code_analysis.repository_service import report_publication
from pathlib import Path

class RepositoryExecutionTests(unittest.TestCase):
    def test_generated_producer_is_current(self):
        self.assertEqual(reusable_source(),Path('.github/workflows/reusable-source.yml').read_text(encoding='utf-8-sig'))

    def test_observer_never_calls_native_api(self):
        with patch('scripts.code_analysis.native_feedback.github.api') as api:
            result=publish(config(),'2',{}, {}, [],dashboard_url='https://example.test')
            self.assertEqual(result['status'],'not_applicable')
            api.assert_not_called()

    def test_incomplete_security_does_not_clear_existing_alerts(self):
        doc=config();project=doc['projects'][0]
        project.update(id='1',relationship='connected',source_repository=doc['execution_repository'])
        report={'analyzed_sha':'b'*40,'target':{'repository':'owner/runner','source_repository':'owner/runner','head_sha':'b'*40},'status':'partial','finding_count':0,'channels':[]}
        row={'id':'target','scan_run_id':2,'run_attempt':1,'kind':'branch','branch':'main'}
        with patch('scripts.code_analysis.native_feedback.github.api',return_value={'id':3}) as api,patch('scripts.code_analysis.native_feedback.github.pages',return_value=[]):
            result=publish(doc,'1',row,report,[],dashboard_url='https://example.test')
            self.assertEqual(result['status'],'partial')
            self.assertEqual(api.call_count,1)
            self.assertTrue(api.call_args.args[0].endswith('/check-runs'))

    def test_quality_and_unsafe_paths_not_exported_as_security(self):
        finding={'id':'a','file':'file.py','line':1,'scanners':['Ruff'],'message':'style','rules':['R1']}
        self.assertEqual(sarif([finding])['runs'][0]['results'],[])
        finding.update(scanners=['Bandit'],file='../escape.py')
        self.assertEqual(sarif([finding])['runs'][0]['results'],[])
        finding['file']='safe.py'
        self.assertEqual(len(sarif([finding])['runs'][0]['results']),1)

    def test_capacity_failure_cannot_mutate_published_manifest(self):
        state={'targets':[{'id':'one','kind':'branch','head_sha':'b'*40,'status':'queued'}]}
        previous={'targets':[{'id':'one','assets':{'analysis-existing':{'bytes':50}},'documents':{},'analyzed_sha':'a'*40}]}
        import json
        config={'analysis_repository':'owner/runner','report_budget_bytes':10}
        with patch('scripts.code_analysis.repository_service.github.pages',return_value=[]),patch('scripts.code_analysis.repository_service.github.save_state') as save,patch('scripts.code_analysis.repository_service.github.gh') as gh:
            with self.assertRaises(ValueError):
                report_publication(config,state,{'id':1,'body':json.dumps(previous)})
            save.assert_not_called();gh.assert_not_called()

if __name__=='__main__':unittest.main()

class TrustedBootstrapTests(unittest.TestCase):
    def test_source_packages_cannot_shadow_trusted_profile_modules(self):
        import os
        import subprocess
        import sys
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            package=root/'scripts'/'code_analysis'
            package.mkdir(parents=True)
            (root/'scripts/__init__.py').write_text('')
            (package/'__init__.py').write_text('')
            (package/'snapshot.py').write_text("raise RuntimeError('SOURCE_PACKAGE_EXECUTED')")
            command=[sys.executable,'-I',str(Path('scripts/code_analysis/trusted_entry.py').resolve()),'run_profile','--help']
            result=subprocess.run(command,cwd=root,env={**os.environ,'PYTHONPATH':str(root)},capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertNotIn('SOURCE_PACKAGE_EXECUTED',result.stderr)


class PublicationRecoveryTests(unittest.TestCase):
    def test_native_buckets_preserve_all_results_and_have_stable_categories(self):
        from scripts.code_analysis.native_feedback import security_shards
        import gzip, base64, json
        findings=[{'id':str(i),'file':'safe.py','scanners':['Bandit'],'message':'test','rules':['B1']} for i in range(6000)]
        payloads=[json.loads(gzip.decompress(base64.b64decode(p))) for p in security_shards(findings,'1')]
        self.assertEqual(sum(len(p['runs'][0]['results']) for p in payloads),6000)
        self.assertTrue(all(len(p['runs'][0]['results'])<=5000 for p in payloads))
        empty=[json.loads(gzip.decompress(base64.b64decode(p))) for p in security_shards([],'1')]
        self.assertEqual([p['runs'][0]['automationDetails'] for p in payloads],[p['runs'][0]['automationDetails'] for p in empty])

    def test_native_processing_waits_for_every_upload_and_preserves_failures(self):
        from scripts.code_analysis.native_feedback import processing
        feedback={'uploads':[{'id':str(i),'status':'pending'} for i in range(16)]}
        with patch('scripts.code_analysis.native_feedback.github.api',return_value={'processing_status':'complete'}):
            self.assertEqual(processing('owner/repo',feedback)['status'],'security_published')
        with patch('scripts.code_analysis.native_feedback.github.api',return_value={'processing_status':'failed','errors':['invalid']}):
            self.assertEqual(processing('owner/repo',feedback)['status'],'failed')
        self.assertEqual(feedback['uploads'][0]['status'],'pending')

    def test_artifact_expiry_retries_are_bounded_and_api_failure_is_not_absence(self):
        from scripts.code_analysis.repository_service import recover_expired_evidence
        row={'scan_run_id':12,'run_attempt':2,'request_id':'request'}
        with patch('scripts.code_analysis.repository_service.github.pages',return_value=[{'name':'hosted-report-12-2','expired':False}]):
            self.assertFalse(recover_expired_evidence({'analysis_repository':'owner/repo'},row))
        with patch('scripts.code_analysis.repository_service.github.pages',side_effect=RuntimeError('unavailable')):
            with self.assertRaises(RuntimeError):recover_expired_evidence({'analysis_repository':'owner/repo'},row)
        self.assertEqual(row['request_id'],'request')
        with patch('scripts.code_analysis.repository_service.github.pages',return_value=[]):
            self.assertTrue(recover_expired_evidence({'analysis_repository':'owner/repo'},row))
        self.assertEqual(row['previous_producer'],{'run_id':12,'attempt':2})
        self.assertEqual(row['status'],'queued')
        row['evidence_retries']=2
        self.assertFalse(recover_expired_evidence({'analysis_repository':'owner/repo'},row))
