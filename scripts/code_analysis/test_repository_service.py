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
