import json
import unittest
from unittest.mock import patch
from scripts.code_analysis.test_projects import config
from scripts.code_analysis.native_feedback import publish, sarif
from scripts.code_analysis.generate_reusable_workflows import reusable_source
from scripts.code_analysis.repository_service import report_publication
from pathlib import Path

class RepositoryExecutionTests(unittest.TestCase):
    def test_queued_v2_uses_pinned_commit_instead_of_mutable_selection(self):
        from scripts.code_analysis.repository_service import queued_selection
        intent = {
            'schema_version':'analysis-request-v2',
            'source_repository':'owner/source','source_repository_id':42,
            'selection': {'kind': 'branch', 'ref': 'Testing'},
            'resolved_selection': {'repository':'owner/source','repository_id':42,'kind':'commit','ref':'a'*40},
            'target_sha':'a'*40,'requested_channels':['semgrep'],
        }
        self.assertEqual(json.loads(queued_selection(intent)), intent['resolved_selection'])

    def test_v2_queue_rejects_a_mismatched_pinned_sha(self):
        from scripts.code_analysis.repository_service import queued_selection
        intent={'schema_version':'analysis-request-v2','resolved_selection':{'repository':'owner/source','kind':'commit','ref':'a'*40},'target_sha':'b'*40,'requested_channels':['semgrep']}
        with self.assertRaisesRegex(ValueError,'Pinned request envelope'):
            queued_selection(intent)

    def test_channel_cache_reuses_matching_evidence_and_run_again_forces_every_lane(self):
        from scripts.code_analysis.repository_service import channel_execution_plan
        cached=[{'channel':'semgrep','status':'COMPLETED'},{'channel':'eslint','status':'COMPLETED'},
                {'channel':'typescript','status':'FAILED'},{'channel':'snyk','status':'NOT_CONFIGURED'}]
        execution,reused=channel_execution_plan(['semgrep','eslint','typescript','snyk'],cached)
        self.assertEqual(execution,['eslint','typescript','snyk'])
        self.assertEqual(reused,['semgrep'])
        forced,forced_reused=channel_execution_plan(['semgrep','snyk'],cached,run_again=True)
        self.assertEqual(forced,['semgrep','snyk'])
        self.assertEqual(forced_reused,[])

    def test_selected_channels_are_dispatched_as_deterministic_producer_lanes(self):
        from scripts.code_analysis.repository_service import channel_lanes,producer_dispatch_id
        channels=['semgrep','eslint','typescript','snyk']
        lanes=channel_lanes(channels)
        self.assertEqual(lanes,[['semgrep'],['eslint','typescript'],['snyk']])
        self.assertEqual(producer_dispatch_id('12345678-1111-4111-8111-111111111111',lanes[0]),
                         producer_dispatch_id('12345678-1111-4111-8111-111111111111',lanes[0]))
        self.assertNotEqual(producer_dispatch_id('12345678-1111-4111-8111-111111111111',lanes[0]),
                            producer_dispatch_id('12345678-1111-4111-8111-111111111111',lanes[1]))

    def test_generated_producer_is_current(self):
        self.assertEqual(reusable_source(),Path('.github/workflows/reusable-source.yml').read_text(encoding='utf-8-sig'))

    def test_observer_never_calls_native_api(self):
        with patch('scripts.code_analysis.native_feedback.github.api') as api:
            result=publish(config(),'2',{}, {}, [],dashboard_url='https://example.test')
            self.assertEqual(result['status'],'not_applicable')
            api.assert_not_called()

    def test_connected_read_only_project_never_calls_native_api(self):
        doc=config();project=doc['projects'][0]
        project.update(id='1',relationship='connected',source_repository=doc['execution_repository'],
                       native_feedback_enabled=False)
        report={'analyzed_sha':'b'*40,'target':{'repository':'owner/runner',
                'source_repository':'owner/runner','head_sha':'b'*40}}
        with patch('scripts.code_analysis.native_feedback.github.api') as api, \
                patch('scripts.code_analysis.native_feedback.github.pages') as pages:
            result=publish(doc,'1',{},report,[],dashboard_url='https://example.test')
        self.assertEqual(result['status'],'not_applicable')
        api.assert_not_called()
        pages.assert_not_called()

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
    def test_completed_report_artifact_recovers_lost_dispatch_receipt(self):
        from scripts.code_analysis.repository_service import recover_completed_producer_run
        row = {'request_id': 'request', 'execution_sha': 'a' * 40}
        runs = [{
            'id': 42, 'path': '.github/workflows/code-analysis-source.yml',
            'head_sha': 'a' * 40, 'status': 'completed', 'run_attempt': 1,
            'created_at': '2026-10-09T17:00:00Z',
        }]
        with patch('scripts.code_analysis.repository_service.github.pages', return_value=[
            {'name': 'hosted-report-42-1', 'expired': False},
        ]):
            self.assertEqual(
                recover_completed_producer_run({'analysis_repository': 'owner/repo'}, row, runs),
                runs[0],
            )

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


class ConfigurationSnapshotTests(unittest.TestCase):
    def test_running_analysis_uses_immutable_default_branch_configuration(self):
        from scripts.code_analysis.prepare_project import trusted_configuration_revision
        revision='a'*40
        with patch.dict('os.environ',{'GITHUB_SHA':revision,'GITHUB_REF':'refs/heads/main'}):
            self.assertEqual(trusted_configuration_revision({'default_branch':'main'},{'execution_sha':revision}),revision)
            with self.assertRaises(ValueError):
                trusted_configuration_revision({'default_branch':'main'},{'execution_sha':'b'*40})
        with patch.dict('os.environ',{'GITHUB_SHA':revision,'GITHUB_REF':'refs/pull/1/head'}):
            with self.assertRaises(ValueError):
                trusted_configuration_revision({'default_branch':'main'},{'execution_sha':revision})


class ExternalServiceBoundaryTests(unittest.TestCase):
    def test_product_execution_is_rejected_even_after_rename(self):
        from scripts.code_analysis.projects import validate
        document=config()
        document['execution_repository']['id']=1278177697
        with self.assertRaises(ValueError):validate(document)

    def test_migration_preserves_producer_identity_and_disables_product_native_writes(self):
        from scripts.code_analysis.migrate_execution import migrated_manifest
        source={'schema_version':'analysis-current-v1','analysis_repository':'owner/old','source_repository':'owner/product','targets':[{'id':'one','scan_run_id':123,'run_attempt':2,'analyzed_sha':'a'*40,'assets':{'immutable':{'sha256':'hash'}},'native_feedback':{'check_id':9}}]}
        result=migrated_manifest(source,'owner/old','owner/service')
        row=result['targets'][0]
        self.assertEqual(row['producer_repository'],'owner/old')
        self.assertEqual(row['migration_producer'],{'repository':'owner/old','run_id':123,'attempt':2})
        self.assertEqual(row['assets'],source['targets'][0]['assets'])
        self.assertEqual(row['analyzed_sha'],'a'*40)
        self.assertEqual(row['native_feedback']['status'],'not_applicable')
        self.assertEqual(source['targets'][0]['native_feedback'],{'check_id':9})


class IndependentSecurityChannelsTests(unittest.TestCase):
    def test_available_security_channels_publish_without_clearing_missing_channels(self):
        from scripts.code_analysis.native_feedback import publish
        import gzip,base64,json
        doc=config();project=doc['projects'][0]
        project.update(id='1',relationship='connected',source_repository=doc['execution_repository'])
        report={'analyzed_sha':'b'*40,'target':{'repository':'owner/runner','source_repository':'owner/runner','head_sha':'b'*40},'status':'partial','finding_count':0,'channels':[{'channel':'trivy','name':'Trivy','status':'COMPLETED'}]}
        row={'id':'target','scan_run_id':2,'run_attempt':1,'kind':'branch','branch':'main'}
        with patch('scripts.code_analysis.native_feedback.github.api',return_value={'id':3}) as api,patch('scripts.code_analysis.native_feedback.github.pages',return_value=[]):
            result=publish(doc,'1',row,report,[],dashboard_url='https://example.test')
        self.assertEqual(result['expected_uploads'],16)
        self.assertIn('bandit',result['unavailable_channels'])
        payloads=[c.kwargs['payload']['sarif'] for c in api.call_args_list if 'sarif' in c.kwargs.get('payload',{})]
        categories=[json.loads(gzip.decompress(base64.b64decode(p)))['runs'][0]['automationDetails']['id'] for p in payloads]
        self.assertTrue(all('/trivy/' in c for c in categories))


class PublicationCompletenessTests(unittest.TestCase):
    def test_pr_overlay_is_separately_keyed_and_filters_to_its_channel(self):
        from scripts.code_analysis.repository_service import build_pr_overlay,matching_pr_overlay,pr_overlay_key
        context={'number':7,'head_repository':'fork/source','head_repository_id':998,'head_branch':'topic','base_repository':'owner/source','base_branch':'main','base_sha':'b'*40}
        channel={'channel':'coderabbit-ai-advisory','status':'COMPLETED','observation_ids':['cr-1']}
        advisory={'stable_id':'advisory-1','observation_ids':['cr-1'],'severity':'MEDIUM'}
        unrelated={'stable_id':'other-1','observation_ids':['scanner-1'],'severity':'LOW'}
        documents={'snapshot.json':{'analysis_channels':[channel],
                                    'observations':[{'observation_id':'cr-1','scanner_family':'CodeRabbit'},
                                                    {'observation_id':'scanner-1','scanner_family':'Semgrep'}],
                                    'ai_advisories':[advisory,unrelated]},
                   'findings.json':[{'id':'advisory-1'},{'id':'other-1'}],
                   'details/0.json':[{'id':'advisory-1'},{'id':'other-1'}]}
        report={'tooling_sha':'c'*40,'profile_digest':'d'*64,'generated_at':'2026-10-16T00:00:00Z'}
        row={'project_id':'1267340546','repository':'owner/source','head_sha':'a'*40,'pr_context':context}
        overlay=build_pr_overlay(documents,report,row)
        self.assertEqual(overlay['schema_version'],'analysis-pr-overlay-v1')
        self.assertEqual(overlay['advisories'],[advisory])
        self.assertEqual(overlay['findings'],[{'id':'advisory-1'}])
        self.assertEqual(overlay['details'],[{'id':'advisory-1'}])
        self.assertEqual([value['observation_id'] for value in overlay['observations']],['cr-1'])
        self.assertNotEqual(overlay['overlay_key'],pr_overlay_key('1267340546',{**context,'base_sha':'e'*40},'a'*40,'c'*40,'d'*64))
        self.assertNotEqual(overlay['overlay_key'],pr_overlay_key('1267340546',context,'a'*40,'f'*40,'d'*64))
        intent={'project_id':'1267340546','target_sha':'a'*40,'tooling_sha':'c'*40,'profile_digest':'d'*64,'pr_context':context}
        self.assertTrue(matching_pr_overlay(overlay,intent))
        self.assertFalse(matching_pr_overlay(overlay,{**intent,'pr_context':{**context,'base_sha':'e'*40}}))
        self.assertFalse(matching_pr_overlay(overlay,{**intent,'pr_context':{**context,'head_repository_id':999}}))
        self.assertFalse(matching_pr_overlay(overlay,{**intent,'project_id':'1278177697'}))

    def test_pr_overlay_publication_does_not_replace_the_current_source_report(self):
        from scripts.code_analysis.repository_service import report_publication
        asset='analysis-'+'1'*64+'.json.gz'
        previous_target={'id':'current:1267340546','canonical_target_id':'current:1267340546','original_target_id':'branch-main',
                         'head_sha':'b'*40,'analyzed_sha':'b'*40,'report_status':'complete','status':'complete',
                         'documents':{'report.json':asset},'assets':{asset:{'bytes':10,'sha256':'1'*64}},'collected_run':'10-1'}
        previous={'schema_version':'analysis-current-v1','project_id':'1267340546','analysis_repository':'owner/runner',
                  'current_target_id':'current:1267340546','targets':[previous_target]}
        context={'number':7,'title':'Review','draft':False,'head_repository':'fork/source','head_branch':'topic',
                 'head_sha':'a'*40,'base_repository':'owner/source','base_branch':'main','base_sha':'c'*40}
        channels=[{'channel':'coderabbit-ai-advisory','name':'CodeRabbit','status':'COMPLETED','class':'ai',
                   'findings':1,'observation_count':1,'observation_ids':['cr-1'],'reason':''}]
        snapshot={'schema_version':'snapshot-v2','analysis_channels':channels,'analysis_channel_count':1,
                  'observations':[{'observation_id':'cr-1','scanner_family':'CodeRabbit','rule':'review','file':'src/app.ts','start_line':4}],
                  'canonical_findings':[],'ai_advisories':[{'stable_id':'advisory-1','observation_ids':['cr-1'],'severity':'LOW'}],
                  'finding_count':1,'observation_count':1,'publication_gate':{'satisfied':False,'channel_ids':[]}}
        report={'analyzed_sha':'a'*40,'status':'complete','channels':channels,'tooling_sha':'d'*40,
                'profile_digest':'e'*64,'generated_at':'2026-10-16T00:00:00Z'}
        state={'project_id':'1267340546','last_request_id':'request-overlay','targets':[{
            'id':'pr-7','project_id':'1267340546','repository':'owner/source','source_repository':'fork/source',
            'head_sha':'a'*40,'kind':'commit','status':'collected','scan_run_id':12,'run_attempt':1,
            'client_request_id':'request-overlay','requested_channels':['coderabbit-ai-advisory'],
            'execution_channels':['coderabbit-ai-advisory'],'profile_digest':'e'*64,'tooling_sha':'d'*40,
            'pr_context':context}]}

        def collect(_config,_row,destination):
            destination.mkdir(parents=True,exist_ok=True)
            (destination/'snapshot.json').write_text(json.dumps(snapshot),encoding='utf-8')
            (destination/'report.json').write_text(json.dumps(report),encoding='utf-8')
            (destination/'findings.json').write_text(json.dumps([{'id':'advisory-1','message':'Review'}]),encoding='utf-8')
            (destination/'details').mkdir()
            (destination/'details'/'0.json').write_text(json.dumps([{'id':'advisory-1','message':'Review'}]),encoding='utf-8')
            return report

        config={'analysis_repository':'owner/runner','report_release':'analysis-current-1267340546','project_id':'1267340546'}
        with patch('scripts.code_analysis.repository_service.github.collect',side_effect=collect), \
                patch('scripts.code_analysis.repository_service.accept',return_value=True), \
                patch('scripts.code_analysis.repository_service.github.cf_api') as upload, \
                patch('scripts.code_analysis.repository_service.release_manifest.read',return_value=previous), \
                patch('scripts.code_analysis.repository_service.release_manifest.write') as write:
            result=report_publication(config,state,config['report_release'])

        self.assertEqual(result['current_target_id'],'current:1267340546')
        self.assertEqual(result['targets'][0]['analyzed_sha'],'b'*40)
        overlay=result['current_overlay']
        self.assertEqual(overlay['schema_version'],'analysis-pr-overlay-v1')
        self.assertEqual(overlay['pr_context'],context)
        self.assertIn('pr-overlay.json',overlay['documents'])
        self.assertIn('overlay_key',overlay)
        self.assertNotIn('advisories',overlay)
        self.assertNotIn('findings',overlay)
        self.assertIn('request-overlay',[run.get('client_request_id') for run in result['recent_runs']])
        self.assertTrue(any(call.kwargs.get('method')=='POST' for call in upload.call_args_list))
        self.assertEqual(write.call_args.args[2]['targets'][0]['analyzed_sha'],'b'*40)
        self.assertEqual(write.call_args.args[2]['current_overlay']['overlay_key'],overlay['overlay_key'])

        failed_context={**context,'head_sha':'f'*40,'base_sha':'9'*40}
        failed_channels=[{**channels[0],'status':'FAILED','observation_count':0,'observation_ids':[]}]
        failed_report={**report,'analyzed_sha':'f'*40,'status':'partial','channels':failed_channels}
        failed_snapshot={**snapshot,'analysis_channels':failed_channels,'observations':[],'ai_advisories':[]}
        failed_state={**state,'last_request_id':'request-overlay-failed','targets':[{**state['targets'][0],
            'head_sha':'f'*40,'client_request_id':'request-overlay-failed','pr_context':failed_context}]}

        def collect_failed(_config,_row,destination):
            destination.mkdir(parents=True,exist_ok=True)
            (destination/'snapshot.json').write_text(json.dumps(failed_snapshot),encoding='utf-8')
            (destination/'report.json').write_text(json.dumps(failed_report),encoding='utf-8')
            (destination/'findings.json').write_text('[]',encoding='utf-8')
            (destination/'details').mkdir()
            return failed_report

        with patch('scripts.code_analysis.repository_service.github.collect',side_effect=collect_failed), \
                patch('scripts.code_analysis.repository_service.accept',return_value=True), \
                patch('scripts.code_analysis.repository_service.github.cf_api'), \
                patch('scripts.code_analysis.repository_service.release_manifest.read',return_value=result), \
                patch('scripts.code_analysis.repository_service.release_manifest.write') as failed_write:
            failed_result=report_publication(config,failed_state,config['report_release'])
        self.assertEqual(failed_result['current_target_id'],'current:1267340546')
        self.assertEqual(failed_result['targets'][0]['analyzed_sha'],'b'*40)
        self.assertEqual(failed_result['current_overlay']['overlay_key'],overlay['overlay_key'])
        self.assertEqual(failed_write.call_args.args[2]['current_overlay']['overlay_key'],overlay['overlay_key'])

    def test_same_sha_merge_replaces_only_successful_selected_channel(self):
        from scripts.code_analysis.repository_service import merge_channel_documents
        def channel(identity,name,status,observation):
            return {'channel':identity,'name':name,'status':status,'class':'security','findings':1 if observation else 0,
                    'observation_count':1 if observation else 0,'observation_ids':[observation] if observation else [],'reason':''}
        def observation(identity,family):
            return {'observation_id':identity,'scanner_family':family,'rule':'rule','file':'app.py','start_line':1,'raw_artifact':'scan.json'}
        def finding(identity,family,observation_id):
            return {'stable_id':identity,'severity':'HIGH','file':'app.py','start_line':1,'supporting_scanner_families':[family],'observation_ids':[observation_id]}
        old_snapshot={'schema_version':'snapshot-v2','analysis_channels':[channel('semgrep','Semgrep','COMPLETED','old-s'),channel('bandit','Bandit','COMPLETED','old-b')],
                      'observations':[observation('old-s','Semgrep'),observation('old-b','Bandit')],
                      'canonical_findings':[finding('old-semgrep','Semgrep','old-s'),finding('keep-bandit','Bandit','old-b')],
                      'ai_advisories':[],'analysis_channel_count':2,'finding_count':2,'observation_count':2,
                      'publication_gate':{'policy':'static-evidence-v1','channel_ids':['semgrep','bandit'],'satisfied':True}}
        new_snapshot={'schema_version':'snapshot-v2','analysis_channels':[channel('semgrep','Semgrep','COMPLETED','new-s'),channel('bandit','Bandit','NOT_SELECTED',None)],
                      'observations':[observation('new-s','Semgrep')],
                      'canonical_findings':[finding('new-semgrep','Semgrep','new-s')],
                      'ai_advisories':[],'analysis_channel_count':2,'finding_count':1,'observation_count':1,
                      'publication_gate':{'policy':'static-evidence-v1','channel_ids':['semgrep'],'satisfied':True}}
        def documents(snapshot, findings):
            details={row['stable_id']:{'id':row['stable_id'],'message':row['stable_id'],'origins':[]} for row in snapshot['canonical_findings']}
            return {'snapshot.json':snapshot,'report.json':{'status':'partial','channels':snapshot['analysis_channels']},
                    'findings.json':[{'id':key,'severity':'HIGH','file':'app.py','line':1,'message':key,'scanners':[],'rules':[],'page':0} for key in details],
                    'details/0.json':list(details.values())}
        merged,report=merge_channel_documents(documents(old_snapshot,[]),documents(new_snapshot,[]),['semgrep'])
        snapshot=merged['snapshot.json']
        self.assertEqual({row['stable_id'] for row in snapshot['canonical_findings']},{'new-semgrep','keep-bandit'})
        self.assertEqual({row['observation_id'] for row in snapshot['observations']},{'new-s','old-b'})
        self.assertEqual({row['channel']:row['status'] for row in snapshot['analysis_channels']},{'semgrep':'COMPLETED','bandit':'COMPLETED'})
        self.assertEqual({row['id'] for row in merged['findings.json']},{'new-semgrep','keep-bandit'})
        self.assertEqual(report['finding_count'],2)

    def test_publication_has_one_canonical_target_and_bounded_run_history(self):
        config = {'analysis_repository': 'owner/repo', 'report_release': 'analysis-current-1', 'project_id': '1'}
        rows = [{
            'id': f'target-{i}', 'head_sha': f'{i + 1:040x}', 'status': 'collected',
            'scan_run_id': i + 1, 'run_attempt': 1, 'kind': 'branch', 'branch': f'branch-{i}',
            'source_repository': 'owner/source', 'client_request_id': f'request-{i}',
            'requested_channels':['semgrep'],
        } for i in range(12)]
        state = {'project_id': '1', 'last_request_id': 'request-7', 'targets': rows}

        def collect(_config, row, destination):
            destination.mkdir(parents=True, exist_ok=True)
            channels=[{'channel':'semgrep','name':'Semgrep','status':'COMPLETED','class':'security','findings':0,'observation_count':0,'observation_ids':[],'reason':''}]
            report={'analyzed_sha': row['head_sha'], 'status': 'complete','channels':channels,'finding_count':0,'observation_count':0,'tooling_sha':'a'*40,'profile_digest':'b'*64}
            (destination / 'findings.json').write_text('[]',encoding='utf-8')
            (destination / 'snapshot.json').write_text(json.dumps({'schema_version':'snapshot-v2','analysis_channels':channels,'analysis_channel_count':1,'observations':[],'canonical_findings':[],'ai_advisories':[],'finding_count':0,'observation_count':0,'publication_gate':{'policy':'static-evidence-v1','channel_ids':['semgrep'],'satisfied':True}}),encoding='utf-8')
            (destination / 'report.json').write_text(json.dumps(report),encoding='utf-8')
            return {**report,
                    'generated_at': f"2026-10-10T00:{row['scan_run_id']:02d}:00Z",
                    'producer_runs': [{'id': str(row['scan_run_id'])}]}

        with patch('scripts.code_analysis.repository_service.github.collect', side_effect=collect), \
                patch('scripts.code_analysis.repository_service.github.discover', side_effect=[[row] for row in rows]), \
                patch('scripts.code_analysis.repository_service.github.cf_api'), \
                patch('scripts.code_analysis.repository_service.accept', return_value=True), \
                patch('scripts.code_analysis.repository_service.release_manifest.read', return_value={}), \
                patch('scripts.code_analysis.repository_service.release_manifest.write') as write:
            result = report_publication(config, state, 'analysis-current-1')

        self.assertEqual(len(result['targets']), 1)
        target = result['targets'][0]
        self.assertEqual(target['id'], 'current:1')
        self.assertEqual(target['original_target_id'], 'target-7')
        self.assertEqual(target['branch'], 'branch-7')
        self.assertEqual(target['head_sha'], rows[7]['head_sha'])
        self.assertEqual(len(result['recent_runs']), 10)
        self.assertEqual(write.call_args.args[2]['current_target_id'], 'current:1')

    def test_report_assets_are_uploaded_under_repository_qualified_keys(self):
        config = {'analysis_repository': 'Owner/Repo', 'report_release': 'analysis-current-1'}
        state = {'targets': [{'id': 'one', 'head_sha': 'a' * 40, 'status': 'collected',
                              'scan_run_id': 12, 'run_attempt': 1, 'kind': 'branch', 'branch': 'main','requested_channels':['semgrep']}]}
        uploaded = []

        def collect(_config, _row, destination):
            destination.mkdir(parents=True, exist_ok=True)
            channels=[{'channel':'semgrep','name':'Semgrep','status':'COMPLETED','class':'security','findings':0,'observation_count':0,'observation_ids':[],'reason':''}]
            report={'analyzed_sha':'a'*40,'status':'complete','channels':channels,'finding_count':0,'observation_count':0,'tooling_sha':'a'*40,'profile_digest':'b'*64}
            (destination/'findings.json').write_text('[]',encoding='utf-8')
            (destination/'snapshot.json').write_text(json.dumps({'schema_version':'snapshot-v2','analysis_channels':channels,'analysis_channel_count':1,'observations':[],'canonical_findings':[],'ai_advisories':[],'finding_count':0,'observation_count':0,'publication_gate':{'policy':'static-evidence-v1','channel_ids':['semgrep'],'satisfied':True}}),encoding='utf-8')
            (destination/'report.json').write_text(json.dumps(report),encoding='utf-8')
            return report

        def upload(_config, path, **kwargs):
            uploaded.append((path, kwargs))

        with patch('scripts.code_analysis.repository_service.github.collect', side_effect=collect), \
                patch('scripts.code_analysis.repository_service.github.discover', return_value=[state['targets'][0]]), \
                patch('scripts.code_analysis.repository_service.github.cf_api', side_effect=upload), \
                patch('scripts.code_analysis.repository_service.accept', return_value=True), \
                patch('scripts.code_analysis.repository_service.release_manifest.read', return_value={}), \
                patch('scripts.code_analysis.repository_service.release_manifest.write'):
            report_publication(config, state, 'analysis-current-1')

        self.assertEqual(len(uploaded), 1)
        self.assertRegex(uploaded[0][0], r'^/api/report/repositories/owner/repo/analysis-current-1/analysis-[a-f0-9]{64}\.json\.gz$')

    def test_reconciliation_preserves_partial_and_never_deletes_before_upload(self):
        import json
        old={'id':'one','head_sha':'a'*40,'analyzed_sha':'a'*40,'collected_run':'12-1','report_status':'partial','assets':{},'documents':{}}
        state={'targets':[{'id':'one','head_sha':'a'*40,'status':'collected','scan_run_id':12,'run_attempt':1}]}
        config={'analysis_repository':'owner/repo','report_budget_bytes':1000, 'launch_endpoint': 'http://localhost'}
        with patch('scripts.code_analysis.repository_service.github.pages',return_value=[]),patch('scripts.code_analysis.repository_service.release_manifest.write') as write, patch('scripts.code_analysis.repository_service.release_manifest.read', return_value={'targets':[old]}):
            result=report_publication(config,state,'analysis-current-1')
        self.assertEqual(result['targets'][0]['status'],'partial')
        self.assertEqual(result['targets'][0]['collected_run'],'12-1')


