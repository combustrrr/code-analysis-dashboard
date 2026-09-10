import copy
import unittest
from scripts.code_analysis.projects import validate, service_config, native_feedback_allowed
from scripts.code_analysis.report_assets import shard, verify_asset


def config():
    return {'schema_version': 'analysis-projects-v1',
            'execution_repository': {'id': 1, 'full_name': 'owner/runner', 'private': False},
            'tooling_sha': 'a' * 40,
            'projects': [{'id': '2', 'source_repository': {'id': 2, 'full_name': 'source/project', 'private': False},
                          'relationship': 'observer', 'preferred_branch': 'main', 'profile': {'mode': 'portable'},
                          'enabled_scanners': ['semgrep'], 'deferred_channels': {}}]}


class ProjectTests(unittest.TestCase):
    def test_observer_cannot_publish_native_findings(self):
        self.assertFalse(native_feedback_allowed(config(), '2', {}))

    def test_protected_upstream_never_executes(self):
        doc = config()
        doc['execution_repository']['full_name'] = 'ARYDESTROYER/Kavach-AgenticSOC'
        with self.assertRaises(ValueError):
            validate(doc)

    def test_connected_native_identity(self):
        doc = config()
        project = doc['projects'][0]
        project.update(id='1', relationship='connected', source_repository=doc['execution_repository'])
        report = {'analyzed_sha': 'b' * 40, 'target': {'repository': 'owner/runner',
                  'source_repository': 'owner/runner', 'head_sha': 'b' * 40}}
        self.assertTrue(native_feedback_allowed(doc, '1', report))
        report['target']['head_sha'] = 'c' * 40
        self.assertFalse(native_feedback_allowed(doc, '1', report))

    def test_rename_preserves_project_namespace(self):
        original = config()
        renamed = copy.deepcopy(original)
        renamed['projects'][0]['source_repository']['full_name'] = 'new/name'
        self.assertEqual(service_config(original, '2', {})['report_release'],
                         service_config(renamed, '2', {})['report_release'])

    def test_private_duplicate_and_relationship_mismatch(self):
        for mutation in ('private', 'duplicate', 'relationship'):
            doc = config()
            if mutation == 'private':
                doc['projects'][0]['source_repository']['private'] = True
            elif mutation == 'duplicate':
                doc['projects'].append(copy.deepcopy(doc['projects'][0]))
            else:
                doc['projects'][0]['relationship'] = 'connected'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate(doc)

    def test_shared_execution_publication_host(self):
        from scripts.code_analysis.configure_instance import configure
        from scripts.code_analysis.hosted import load
        from pathlib import Path
        output = configure(load(Path('config/code-analysis/service.json')), 'source/project',
                           'owner/runner', 'owner/runner', 'main', {'mode': 'portable'})
        self.assertEqual(output['analysis_repository'], output['publishing_repository'])


class AssetTests(unittest.TestCase):
    def test_shards_round_trip_and_integrity(self):
        documents = {f'details/{i}.json': {'value': str(i) * 20} for i in range(20)}
        manifest, assets = shard(documents, asset_limit=120)
        self.assertGreater(len(assets), 1)
        recovered = {}
        for name, content in assets.items():
            recovered.update(verify_asset(name, content, manifest['assets'][name]))
            with self.assertRaises(ValueError):
                verify_asset(name, content + b'x', manifest['assets'][name])
        self.assertEqual(recovered, documents)
        self.assertEqual((manifest, assets), shard(documents, asset_limit=120))

    def test_capacity_and_unsafe_paths_fail_before_publication(self):
        for docs, kwargs in [({'../escape.json': {}}, {}), ({'a.json': {}}, {'budget': 1}),
                             ({'a.json': {}}, {'asset_limit': 1})]:
            with self.assertRaises(ValueError):
                shard(docs, **kwargs)


if __name__ == '__main__':
    unittest.main()
