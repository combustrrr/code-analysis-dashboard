"""Serialized repository-local scheduler and current Release publisher."""
from __future__ import annotations
import argparse
import base64
import json
import os
from pathlib import Path
import tempfile
from urllib.parse import quote
import uuid

from scripts.code_analysis import github_service as github
from scripts.code_analysis.hosted import analysis_key, reconcile, now, accept
from scripts.code_analysis.projects import validate, service_config, native_feedback_allowed
from scripts.code_analysis.report_assets import shard

WORKFLOW = '.github/workflows/code-analysis-source.yml'


def load_projects(repository):
    repo = github.api('repos/' + repository)
    blob = github.api(f"repos/{repository}/contents/.github/code-analysis/projects.json?ref={quote(repo['default_branch'], safe='')}")
    document = validate(json.loads(base64.b64decode(blob['content'])))
    if repo['id'] != document['execution_repository']['id']:
        raise ValueError('Execution repository identity changed')
    revision = github.api(f"repos/{repository}/commits/{quote(repo['default_branch'], safe='')}")['sha']
    return repo, document, revision


def report_publication(config, state, report_release, document=None):
    """Publish all active targets together, then remove unreferenced assets."""
    repo = config['analysis_repository']
    previous = json.loads(report_release['body'] or '{}')
    prior = {row['id']: row for row in previous.get('targets', [])}
    assets = {a['name']: a for a in github.pages(f"repos/{repo}/releases/{report_release['id']}/assets")}
    result = {**state, 'schema_version':'analysis-current-v1', 'targets':[]}
    pending = {}
    with tempfile.TemporaryDirectory(prefix='analysis-publication-') as directory:
        for row in state['targets']:
            entry = {**row}
            old = prior.get(row['id'], {})
            for key in ('documents', 'assets', 'analyzed_sha', 'collected_run', 'report_status'):
                if key in old:
                    entry[key] = old[key]
            if entry.get('analyzed_sha') and entry['analyzed_sha'] != row['head_sha']:
                entry['status'] = 'stale'
            run_key = f"{row.get('scan_run_id')}-{row.get('run_attempt')}"
            if row.get('status') == 'collected' and old.get('collected_run') != run_key:
                try:
                    destination = Path(directory) / row['id']
                    report = github.collect(config, row, destination)
                    latest = next((x for x in github.discover(config) if x['id'] == row['id']), None)
                    if row['kind'] == 'commit':
                        latest = github.resolve_selection(config, row['head_sha'], [])
                    if latest is None or not accept(latest, report):
                        raise ValueError('Target changed before publication')
                    documents = {p.relative_to(destination).as_posix():json.loads(p.read_text(encoding='utf-8')) for p in destination.rglob('*.json')}
                    manifest, blobs = shard(documents, budget=config['report_budget_bytes'])
                    pending.update(blobs)
                    entry.update(documents=manifest['documents'], assets=manifest['assets'],
                                 analyzed_sha=report['analyzed_sha'], collected_run=run_key,
                                 status=report['status'], report_status=report['status'])
                    entry.pop('error', None)
                    if document is not None:
                        from scripts.code_analysis.native_feedback import publish
                        try:
                            entry['native_feedback'] = publish(document, config['project_id'], row, report, documents['findings.json'], dashboard_url='https://combustrrr.github.io/code-analysis-dashboard/')
                        except (ValueError, RuntimeError) as error:
                            entry['native_feedback'] = {'status':'failed', 'reason':str(error)}
                except (ValueError, RuntimeError) as error:
                    entry.update(status='failed', error=str(error))
            result['targets'].append(entry)
        referenced = {name:meta for row in result['targets'] for name,meta in row.get('assets', {}).items()}
        size = sum(meta['bytes'] for meta in referenced.values())
        if size > config['report_budget_bytes']:
            raise ValueError('Current project capacity exceeded; previous published reports retained')
        for name in referenced:
            if name not in assets:
                if name not in pending:
                    raise ValueError('Current report references a missing asset')
                path = Path(directory) / name
                path.write_bytes(pending[name])
                github.gh('release','upload',config['report_release'],str(path),'--repo',repo)
        result['metrics'] = {'compressed_bytes':size, 'budget_bytes':config['report_budget_bytes'],
                             'queued':sum(r['status']=='queued' for r in result['targets']),
                             'scanning':sum(r['status']=='scanning' for r in result['targets'])}
        github.save_state(repo, report_release, result)
        for name, asset in assets.items():
            if name.startswith('analysis-') and name not in referenced:
                github.api(f"repos/{repo}/releases/assets/{asset['id']}", method='DELETE')
    return result


def reconcile_repository(repository, project_id='', selection='', request_id=''):
    repo, document, execution_sha = load_projects(repository)
    template = json.loads((Path(__file__).resolve().parents[2] / 'config/code-analysis/service.json').read_text(encoding='utf-8-sig'))
    runs = github.pages(f'repos/{repository}/actions/workflows/code-analysis-source.yml/runs', 'workflow_runs')
    running = sum(run['status'] != 'completed' for run in runs)
    by_id = {run['id']:run for run in runs}
    by_nonce = {run['display_title']:run for run in reversed(runs)}
    summaries = []
    for project in document['projects']:
        config = service_config(document, project['id'], template)
        config['source_workflow'] = WORKFLOW
        source = github.api('repos/' + config['source_repository'])
        if source['id'] != config['source_repository_id'] or source['private']:
            raise ValueError('Source repository identity/visibility changed')
        config['source_repository'] = source['full_name']
        release = github.release(repository, config['state_release'], create=True)
        old = json.loads(release['body'] or '{}')
        rows = github.inventory(config, old)  # Fail closed on incomplete pagination.
        if selection and project['id'] == project_id:
            selected = github.resolve_selection(config, selection, rows)
            if not any(r['id'] == selected['id'] for r in rows):
                manual = old.get('manual_target', {})
                rows = [r for r in rows if r['id'] != manual.get('id')]
                old['manual_target'] = selected
                rows.append(selected)
        state = reconcile(old, rows, now())
        state.update(project_id=project['id'], source_repository=source['full_name'],
                     analysis_repository=repository, relationship=project['relationship'],
                     preferred_branch=project['preferred_branch'])
        if selection and project['id'] == project_id and request_id != old.get('last_request_id'):
            github.request_refresh(state, selected['id'])
            state['last_request_id'] = request_id
        state['targets'].sort(key=lambda row: not row.get('manual_refresh',False))
        for row in state['targets']:
            key = analysis_key(row, document['tooling_sha'], config)
            if row.get('analysis_key') != key:
                row.update(analysis_key=key,status='queued')
                row.pop('request_id',None); row.pop('scan_run_id',None)
            if row.get('request_id'):
                run = by_id.get(row.get('scan_run_id')) or by_nonce.get('Source analysis ' + row['request_id'])
                if run and run['head_sha'] == row.get('execution_sha'):
                    row.update(scan_run_id=run['id'],run_attempt=run['run_attempt'],
                               status='collected' if run['status']=='completed' else 'scanning',run_conclusion=run['conclusion'])
                continue  # Never retry a dispatch with an uncertain outcome.
            if running >= 2:
                continue
            row.update(profile_mode='portable' if project['profile'].get('mode') == 'portable' else 'agentic-soc', project_id=project['id'],request_id=uuid.uuid4().hex,status='dispatching',
                       tooling_sha=document['tooling_sha'], execution_sha=execution_sha)
            row.pop('manual_refresh',None)
            github.save_state(repository,release,state)
            dispatched = github.api(f'repos/{repository}/actions/workflows/code-analysis-source.yml/dispatches',
                {'ref':repo['default_branch'],'return_run_details':True,'inputs':{
                    'target':json.dumps(row),'tooling_sha':document['tooling_sha'],'request_id':row['request_id']}})
            if dispatched and dispatched.get('workflow_run_id'):
                row.update(scan_run_id=dispatched['workflow_run_id'],run_attempt=1)
            row['status']='scanning'
            running += 1
        github.save_state(repository,release,state)
        current = github.release(repository,config['report_release'],create=True)
        summaries.append(report_publication(config,state,current,document)['metrics'])
    return summaries


def main():
    result = reconcile_repository(os.environ['GITHUB_REPOSITORY'],os.environ.get('PROJECT_ID',''),
                                  os.environ.get('SELECTION',''),os.environ.get('REQUEST_ID',''))
    print(json.dumps(result))
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as output:
            output.write('## Current analysis projects\n\n```json\n'+json.dumps(result,indent=2)+'\n```\n')


if __name__ == '__main__':
    main()
