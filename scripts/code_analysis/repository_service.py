"""Serialized repository-local scheduler and current Release publisher."""
from __future__ import annotations
import argparse
import base64
import json
import hashlib
import os
from pathlib import Path
import tempfile
from urllib.parse import quote
import uuid

from scripts.code_analysis import github_service as github, release_manifest
from scripts.code_analysis.hosted import analysis_key, reconcile, now, accept
from scripts.code_analysis.projects import validate, service_config, native_feedback_allowed
from scripts.code_analysis.report_assets import shard
from scripts.code_analysis.evaluation import can_dispatch, consume, idempotency_key, profile_digest

WORKFLOW = '.github/workflows/code-analysis-source.yml'


def queued_selection(intent):
    """Return the canonical repository-qualified selection from a queued request."""
    selection = intent.get('selection')
    if not isinstance(selection, dict):
        raise ValueError('Queued request selection is invalid')
    return json.dumps(selection)


def load_projects(repository):
    repo = github.api('repos/' + repository)
    blob = github.api(f"repos/{repository}/contents/.github/code-analysis/projects.json?ref={quote(repo['default_branch'], safe='')}")
    document = validate(json.loads(base64.b64decode(blob['content'])))
    if repo['id'] != document['execution_repository']['id']:
        raise ValueError('Execution repository identity changed')
    revision = github.api(f"repos/{repository}/commits/{quote(repo['default_branch'], safe='')}")['sha']
    return repo, document, revision


def recover_expired_evidence(config, row):
    """Retry only conclusively absent/expired completed-run evidence, at most twice."""
    if row.get('evidence_retries', 0) >= 2:
        return False
    expected = f"hosted-report-{row['scan_run_id']}-{row['run_attempt']}"
    artifacts = github.pages(f"repos/{config['analysis_repository']}/actions/runs/{row['scan_run_id']}/artifacts", 'artifacts')
    usable = [a for a in artifacts if a['name'] == expected and not a.get('expired')]
    if usable:
        return False
    row['evidence_retries'] = row.get('evidence_retries', 0) + 1
    row['previous_producer'] = {'run_id':row.pop('scan_run_id'), 'attempt':row.pop('run_attempt')}
    row.pop('request_id', None)
    row.update(status='queued', recovery_reason='Completed producer evidence expired or is missing; bounded replacement queued')
    return True


def recover_completed_producer_run(config, row, runs):
    """Recover a completed producer whose dispatch receipt was lost.

    GitHub can accept a workflow dispatch while the state-release write is
    being retried.  In that window the producer still creates a durable,
    exact-named report artifact, but the next reconciliation has no
    ``scan_run_id`` to follow.  Match only completed source-workflow runs for
    the exact execution SHA and require the canonical report artifact before
    associating one with the target.
    """
    execution_sha = row.get('execution_sha')
    if not execution_sha or row.get('request_id') is None:
        return None
    candidates = sorted(
        (run for run in runs
         if run.get('status') == 'completed'
         and run.get('path') == WORKFLOW
         and run.get('head_sha') == execution_sha),
        key=lambda run: (run.get('created_at', ''), run.get('id', 0)),
        reverse=True,
    )
    for run in candidates:
        attempt = run.get('run_attempt', 1)
        expected = f"hosted-report-{run['id']}-{attempt}"
        artifacts = github.pages(
            f"repos/{config['analysis_repository']}/actions/runs/{run['id']}/artifacts",
            'artifacts',
        )
        if any(a.get('name') == expected and not a.get('expired') for a in artifacts):
            return run
    return None


def report_publication(config, state, report_release, document=None):
    """Publish one canonical project report, then remove unreferenced assets."""
    previous = release_manifest.read(config, report_release)
    previous_targets = previous.get('targets', [])
    prior = {row['id']: row for row in previous_targets}
    prior_current = next((row for row in previous_targets
                          if row.get('id') == previous.get('current_target_id')
                          or row.get('canonical_target_id') == previous.get('current_target_id')), None)
    if prior_current is None and previous_targets:
        # Manifests written before the canonical identity was introduced had one
        # target only in the common case; retain it as a safe fallback.
        prior_current = previous_targets[0] if len(previous_targets) == 1 else None
    result = {**state, 'schema_version':'analysis-current-v1', 'targets':[]}
    pending = {}
    entries = []
    with tempfile.TemporaryDirectory(prefix='analysis-publication-') as directory:
        project_dispatches = 0
        for row in state['targets']:
            entry = {**row}
            entry['lifecycle_status'] = ('collecting' if row.get('status') == 'collected' else
                                         'running' if row.get('status') == 'scanning' else
                                         row.get('status', 'queued'))
            old = prior.get(row['id'], {})
            if not old and prior_current and prior_current.get('original_target_id') == row.get('id'):
                old = prior_current
            for key in ('documents', 'assets', 'analyzed_sha', 'collected_run', 'report_status', 'native_feedback'):
                if key in old:
                    entry[key] = old[key]
            if row.get('status') == 'collected' and old.get('collected_run') == f"{row.get('scan_run_id')}-{row.get('run_attempt')}":
                entry['status'] = old.get('report_status', 'partial')
            if entry.get('analyzed_sha') and entry['analyzed_sha'] != row['head_sha']:
                entry['status'] = 'stale'
            run_key = f"{row.get('scan_run_id')}-{row.get('run_attempt')}"
            native_upgrade = old.get('native_feedback', {}).get('reason', '').startswith('Native SARIF exceeds') and old.get('native_feedback', {}).get('adapter_version') != 2
            if row.get('status') == 'collected' and (old.get('collected_run') != run_key or native_upgrade):
                entry['lifecycle_status'] = 'collecting'
                try:
                    destination = Path(directory) / row['id']
                    report = github.collect(config, row, destination)
                    latest = next((x for x in github.discover(config) if x['id'] == row['id']), None)
                    if row['kind'] == 'commit':
                        latest = github.resolve_selection(config, row['head_sha'], [])
                    if latest is None or not accept(latest, report):
                        raise ValueError('Target changed before publication')
                    documents = {}
                    for p in destination.rglob('*'):
                        if p.suffix == '.json':
                            documents[p.relative_to(destination).as_posix()] = json.loads(p.read_text(encoding='utf-8'))
                        elif p.suffix == '.md':
                            documents[p.relative_to(destination).as_posix()] = p.read_text(encoding='utf-8')
                    manifest, blobs = shard(documents)
                    pending.update(blobs)
                    entry['lifecycle_status'] = 'publishing'
                    entry.update(documents=manifest['documents'], assets=manifest['assets'],
                                 analyzed_sha=report['analyzed_sha'], collected_run=run_key,
                                 status=report['status'], report_status=report['status'])
                    for key in ('generated_at', 'report_generation_timestamp', 'producer_runs', 'tooling_sha'):
                        if key in report:
                            entry[key] = report[key]
                    entry['lifecycle_status'] = 'completed_partial' if report['status'] == 'partial' else 'completed'
                    entry.pop('error', None)
                    if document is not None:
                        from scripts.code_analysis.native_feedback import publish
                        try:
                            dashboard_url = os.environ.get('DASHBOARD_URL') or config.get('dashboard_url', '') or 'https://combustrrr.github.io/code-analysis-dashboard/'
                            entry['native_feedback'] = publish(document, config['project_id'], row, report, documents['findings.json'], dashboard_url=dashboard_url)
                        except (ValueError, RuntimeError) as error:
                            entry['native_feedback'] = {'status':'failed', 'reason':str(error)}
                except (ValueError, RuntimeError) as error:
                    entry.update(status='failed', lifecycle_status='failed', error=str(error))
                    try:
                        if recover_expired_evidence(config, row):
                            entry['recovery_reason'] = row['recovery_reason']
                    except (ValueError, RuntimeError):
                        pass  # API failure does not prove evidence is absent.
            if entry.get('native_feedback', {}).get('status') == 'security_processing':
                from scripts.code_analysis.native_feedback import processing
                try:
                    entry['native_feedback'] = processing(config['analysis_repository'], entry['native_feedback'])
                except (ValueError, RuntimeError) as error:
                    entry['native_feedback']['processing_error'] = str(error)
            entries.append(entry)

        canonical_id = f"current:{config.get('project_id', state.get('project_id', 'unknown'))}"
        valid = [entry for entry in entries
                 if entry.get('lifecycle_status') in {'completed', 'completed_partial'}
                 and entry.get('analyzed_sha') == entry.get('head_sha')
                 and entry.get('documents') and entry.get('assets')]
        requested_id = state.get('last_request_id')
        requested = next((entry for entry in valid
                          if requested_id and requested_id in {entry.get('client_request_id'), entry.get('request_id')}), None)

        def newest(entry):
            return (entry.get('report_generation_timestamp') or entry.get('generated_at') or
                    entry.get('checked_at') or '', int(entry.get('scan_run_id') or 0),
                    int(entry.get('run_attempt') or 0))

        selected = requested or (max(valid, key=newest) if valid else None) or prior_current
        if selected is not None:
            canonical = {**selected, 'id': canonical_id,
                         'canonical_target_id': canonical_id,
                         'original_target_id': selected.get('original_target_id', selected.get('id'))}
            if 'status' not in canonical and canonical.get('report_status'):
                canonical['status'] = canonical['report_status']
            result['targets'] = [canonical]
            result['current_target_id'] = canonical_id

        # Keep enough request/run history for activity polling without turning the
        # current manifest back into a per-target inventory.
        recent = list(previous.get('recent_runs', [])) if isinstance(previous.get('recent_runs'), list) else []
        for entry in sorted(valid, key=newest, reverse=True):
            recent.append({key: entry[key] for key in (
                'request_id', 'client_request_id', 'original_target_id', 'head_sha',
                'analyzed_sha', 'scan_run_id', 'run_attempt', 'execution_sha',
                'collected_run', 'report_status', 'lifecycle_status', 'checked_at')
                           if key in entry})
        deduped = []
        seen_runs = set()
        for run in reversed(recent):
            identity = (run.get('client_request_id') or run.get('request_id') or
                        run.get('collected_run') or run.get('analyzed_sha'))
            if not identity or identity in seen_runs:
                continue
            seen_runs.add(identity)
            deduped.append(run)
        result['recent_runs'] = list(reversed(deduped))[-10:]
        referenced = {name:meta for row in result['targets'] for name,meta in row.get('assets', {}).items()}
        size = sum(meta['bytes'] for meta in referenced.values())
        for name in referenced:
            if name in pending:
                path = Path(directory) / name
                path.write_bytes(pending[name])
                github.cf_api(config, github.storage_path(config, 'report', f'{config["report_release"]}/{name}'),
                              method='POST', data=path.read_bytes(), content_type='application/gzip')
        result['metrics'] = {'compressed_bytes':size,
                             'queued':sum(r.get('status')=='queued' for r in result['targets']),
                             'scanning':sum(r.get('status')=='scanning' for r in result['targets']),
                             'published':sum(r.get('lifecycle_status') in {'completed','completed_partial'} for r in result['targets']),
                             'failed':sum(r.get('lifecycle_status') == 'failed' for r in result['targets']),
                             # Include bounded, non-secret publication diagnostics
                             # in the job summary so a failed handoff is not
                             # indistinguishable from an empty report.
                             'report_errors':[{'target_id':r.get('id'),'reason':r.get('error')}
                                              for r in result['targets'] if r.get('error')][:20]}
        # Track a small bounded history of compressed storage usage for free-tier monitoring.
        history = previous.get('report_storage_history', [])
        try:
            # Append current point with timestamp; keep last 60 points (~rolling window via publisher cadence)
            history = [h for h in history if isinstance(h, dict) and 'compressed_bytes' in h and 'at' in h]
        except Exception:
            history = []
        history.append({'at': now(), 'compressed_bytes': size})
        result['report_storage_history'] = history[-60:]
        result['checked_at'] = now()
        release_manifest.write(config, report_release, result)
    return result


def reconcile_repository(repository, project_id='', selection='', request_id=''):
    repo, document, execution_sha = load_projects(repository)
    queued_asset = None
    queue = github.release(repository, 'analysis-requests')
    if queue:
        candidates = sorted((a for a in github.pages(f"repos/{repository}/releases/{queue['id']}/assets") if a['name'].startswith('request-') and a['name'].endswith('.json')), key=lambda a:(a['created_at'],a['id']))
        if candidates:
            queued_asset = candidates[0]
            if queued_asset.get('size', 0)>8192:
                raise ValueError('Queued request exceeds the accepted request size')
            intent = json.loads(github.gh('api',f"repos/{repository}/releases/assets/{queued_asset['id']}",'-H','Accept: application/octet-stream',binary=True))
            if intent.get('schema_version')!='analysis-request-v1' or intent.get('execution_repository_id')!=repo['id'] or not any(p['id']==intent.get('project_id') for p in document['projects']):
                raise ValueError('Queued request identity is invalid or project was removed')
            # `selection` is the canonical, repository-qualified revision. The
            # optional requested_selection records the user's original UI
            # choice and, in evaluation mode, intentionally omits repository.
            project_id, selection, request_id = intent['project_id'], queued_selection(intent), intent['request_id']
    template = json.loads((Path(__file__).resolve().parents[2] / 'config/code-analysis/service.json').read_text(encoding='utf-8-sig'))
    evaluation = template.get('evaluation', {})
    runs = github.pages(f'repos/{repository}/actions/workflows/code-analysis-source.yml/runs', 'workflow_runs')
    running = sum(run['status'] != 'completed' for run in runs)
    by_id = {run['id']:run for run in runs}
    by_nonce = {run['display_title']:run for run in reversed(runs)}
    summaries = []
    stored = {}
    for project in document['projects']:
        rel = 'analysis-state-' + project['id']
        config_tmp = service_config(document, project['id'], template)
        config_tmp['launch_endpoint'] = template.get('launch_endpoint') or document.get('launch_endpoint')
        stored[project['id']] = (rel, release_manifest.read(config_tmp, rel))
    projects = sorted(document['projects'], key=lambda p: not (str(p['id']) == str(project_id) and selection or any(r.get('manual_refresh') for r in stored[p['id']][1].get('targets', []))))
    for project in projects:
        config = service_config(document, project['id'], template)
        config['source_workflow'] = WORKFLOW
        source = github.api('repos/' + config['source_repository'])
        if source['id'] != config['source_repository_id'] or source['private']:
            raise ValueError('Source repository identity/visibility changed')
        config['source_repository'] = source['full_name']
        release, old = stored[project['id']]
        rows = github.inventory(config, old)  # Fail closed on incomplete pagination.
        if selection and str(project['id']) == str(project_id):
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
        evaluation_enabled = bool(evaluation.get('enabled')) and source['full_name'].lower() == str(evaluation.get('source_repository', '')).lower()
        if evaluation_enabled:
            state.setdefault('evaluation_mode', True)
            state.setdefault('evaluation_target_sha', None)
            state.setdefault('evaluation_dispatches_used', 0)
            state.setdefault('evaluation_paused', bool(evaluation.get('paused', False)))
            state.setdefault('evaluation_dispatch_budget', int(evaluation.get('dispatch_budget', 1)))
            if evaluation.get('paused'):
                state['evaluation_paused'] = True
        if selection and str(project['id']) == str(project_id) and request_id != old.get('last_request_id'):
            github.request_refresh(state, selected['id'])
            state['last_request_id'] = request_id
            next(r for r in state['targets'] if r['id'] == selected['id'])['client_request_id'] = request_id
            state['requests'] = [r for r in state.get('requests', []) if r['request_id'] != request_id][-99:] + [{'request_id':request_id,'target_id':selected['id'],'head_sha':selected['head_sha']}]
        state['targets'].sort(key=lambda row: not row.get('manual_refresh',False))
        project_dispatches = 0
        for row in state['targets']:
            if evaluation_enabled and selection and str(project['id']) == str(project_id):
                frozen_sha = state.get('evaluation_target_sha') or evaluation.get('target_sha')
                if row.get('branch') != evaluation.get('target_branch') and row.get('head_sha') != frozen_sha:
                    state['evaluation_error'] = f"Evaluation only accepts the frozen {evaluation.get('target_branch')} branch."
                    continue
            key = analysis_key(row, document['tooling_sha'], config)
            if row.get('analysis_key') != key:
                row.update(analysis_key=key,status='queued')
                row.pop('request_id',None); row.pop('scan_run_id',None)
            if row.get('request_id'):
                run = (by_id.get(row.get('scan_run_id'))
                       or by_nonce.get('Source analysis ' + row['request_id'])
                       or recover_completed_producer_run(config, row, runs))
                if run and run['head_sha'] == row.get('execution_sha'):
                    row.update(scan_run_id=run['id'],run_attempt=run['run_attempt'],
                               status='collected' if run['status']=='completed' else 'scanning',run_conclusion=run['conclusion'])
                continue  # Never retry a dispatch with an uncertain outcome.
            if running >= (1 if evaluation_enabled else 2) or (not evaluation_enabled and len(projects)>1 and project_dispatches>=1):
                continue
            if evaluation_enabled:
                # Evaluation dispatches are request-driven and consume their budget before
                # the external dispatch. Reconciliation can recover this request, but never
                # infer that an uncertain dispatch was absent and issue another one.
                if not selection or project['id'] != project_id:
                    continue
                if not state.get('evaluation_target_sha'):
                    state['evaluation_target_sha'] = row.get('head_sha')
                allowed, reason = can_dispatch(state, row.get('head_sha'))
                if not allowed:
                    state['evaluation_error'] = reason
                    continue
                scanner_digest = profile_digest(project)
                evaluation_key = idempotency_key(source['full_name'], row['head_sha'], document['tooling_sha'], scanner_digest)
                duplicate = next((candidate for candidate in state['targets'] if candidate.get('evaluation_idempotency_key') == evaluation_key), None)
                if duplicate:
                    continue
                request_id = hashlib.sha256(evaluation_key.encode()).hexdigest()[:32]
                row['evaluation_idempotency_key'] = evaluation_key
                state.update(consume(state, request_id, evaluation_key))
            else:
                request_id = uuid.uuid4().hex
            row.update(profile_mode='portable' if project['profile'].get('mode') == 'portable' else 'agentic-soc', project_id=project['id'],request_id=request_id,status='dispatching',
                       tooling_sha=document['tooling_sha'], execution_sha=execution_sha)
            row.pop('manual_refresh',None)
            release_manifest.write(config,release,state)
            dispatched = github.api(f'repos/{repository}/actions/workflows/code-analysis-source.yml/dispatches',
                {'ref':repo['default_branch'],'return_run_details':True,'inputs':{
                    'target':json.dumps(row),'tooling_sha':document['tooling_sha'],'request_id':row['request_id']}})
            if dispatched and dispatched.get('workflow_run_id'):
                row.update(scan_run_id=dispatched['workflow_run_id'],run_attempt=1)
            row['status']='scanning'
            running += 1
            project_dispatches += 1
        release_manifest.write(config,release,state)
        if queued_asset is not None and project['id']==project_id and state.get('last_request_id')==request_id:
            github.api(f"repos/{repository}/releases/assets/{queued_asset['id']}",method='DELETE')
            queued_asset = None
        for receipt in state.get('requests', []):
            selected_row = next((r for r in state['targets'] if r.get('client_request_id') == receipt['request_id'] and r['head_sha'] == receipt['head_sha']), None)
            if selected_row and selected_row.get('scan_run_id'):
                receipt.update({k:selected_row[k] for k in ('scan_run_id','run_attempt','execution_sha')})
        current = config['report_release']
        summaries.append(report_publication(config,state,current,document)['metrics'])
        release_manifest.write(config,release,state)  # Persist bounded evidence recovery intents.
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
