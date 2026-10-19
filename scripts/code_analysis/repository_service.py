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
from scripts.code_analysis.projects import validate, service_config
from scripts.code_analysis.report_assets import shard, verify_asset
from scripts.code_analysis.applicability import GROUPS as SCANNER_GROUPS

WORKFLOW = '.github/workflows/code-analysis-coordinator.yml'
GENERATED_WORKFLOW = '.github/workflows/11-source-analysis.yml'


def project_profile_digest(project):
    profile = {'enabled_scanners':sorted(project.get('enabled_scanners', [])),
               'deferred_channels':project.get('deferred_channels', {}),
               'native_feedback_enabled':False,
               'profile':project.get('profile', {})}
    return hashlib.sha256(json.dumps(profile, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def owns_active_request(row, intent):
    request_id = row.get('client_request_id')
    return bool(request_id and request_id == intent.get('request_id'))


def terminal_queue_request(state, published, request_id):
    """Recover a terminal queue owner even when inventory dropped its target row."""
    active = next((row for row in state.get('targets', [])
                   if row.get('client_request_id') == request_id), None)
    if active and active.get('status') in {'collected', 'cached'}:
        return active
    receipt = next((row for row in state.get('requests', [])
                    if row.get('request_id') == request_id), {})
    published_runs = [*published.get('targets', []), *published.get('recent_runs', [])]
    recent = next((run for run in published_runs
                   if (run.get('client_request_id') or run.get('request_id')) == request_id
                   and run.get('scan_run_id') and run.get('run_attempt')
                   and (not receipt.get('scan_run_id') or run.get('scan_run_id') == receipt.get('scan_run_id'))
                   and (not receipt.get('run_attempt') or run.get('run_attempt') == receipt.get('run_attempt'))), None)
    if not recent:
        return None
    return {**receipt, **recent, 'client_request_id': request_id,
            'status': 'collected',
            'execution_channels': receipt.get('execution_channels', recent.get('execution_channels', [])),
            'remaining_channels': receipt.get('remaining_channels', recent.get('remaining_channels', []))}


def channel_execution_plan(requested, cached_channels, run_again=False):
    reusable={'COMPLETED','COMPLETED_OPTIONAL','CONFIGURED_COMPLETE','POLICY_FINDINGS','NOT_APPLICABLE'}
    cached={value.get('channel'):value for value in cached_channels}
    reused=[] if run_again else [channel for channel in requested if cached.get(channel,{}).get('status') in reusable]
    execution=[channel for channel in requested if channel not in reused]
    for group in SCANNER_GROUPS.values():
        members=set(group).intersection(requested)
        if members and members.intersection(execution):
            reused=[channel for channel in reused if channel not in members]
            execution=[channel for channel in requested if channel not in reused]
    return execution,reused


def channel_lanes(channels):
    lanes=[]
    seen=set()
    for channel in channels:
        if channel in seen:
            continue
        group=next((list(values) for values in SCANNER_GROUPS.values() if channel in values),[channel])
        lane=[value for value in channels if value in group]
        lanes.append(lane)
        seen.update(lane)
    return lanes


def concurrent_execution_channels(channels):
    """Flatten trusted shared-producer groups into one concurrent workflow dispatch."""
    return [channel for lane in channel_lanes(channels) for channel in lane]


def producer_dispatch_id(request_id, channels):
    suffix=hashlib.sha256((request_id+':'+','.join(channels)).encode()).hexdigest()[:16]
    return request_id[:8]+'-'+suffix


def queued_selection(intent):
    """Return the canonical repository-qualified selection from a queued request."""
    selection = intent.get('resolved_selection') if intent.get('schema_version') == 'analysis-request-v2' else intent.get('selection')
    if not isinstance(selection, dict):
        raise ValueError('Queued request selection is invalid')
    if intent.get('schema_version') == 'analysis-request-v1' and intent.get('target_sha'):
        selection = {'repository':selection.get('repository'),'kind':'commit','ref':intent['target_sha']}
    if intent.get('schema_version') == 'analysis-request-v2':
        pr_context=intent.get('pr_context')
        expected_repository=pr_context.get('head_repository') if isinstance(pr_context,dict) else intent.get('source_repository')
        expected_repository_id=pr_context.get('head_repository_id') if isinstance(pr_context,dict) else intent.get('source_repository_id')
        if (selection.get('kind') != 'commit' or selection.get('ref') != intent.get('target_sha')
                or selection.get('repository') != expected_repository or selection.get('repository_id') != expected_repository_id
                or not isinstance(intent.get('requested_channels'), list)
                or not intent.get('requested_channels')):
            raise ValueError('Pinned request envelope is invalid')
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
         and run.get('path') in {WORKFLOW,GENERATED_WORKFLOW}
         and (not row.get('dispatch_id') or run.get('display_title') == 'Source analysis ' + row['dispatch_id'])
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


def load_report_documents(config, entry):
    documents = {}
    for name, metadata in entry.get('assets', {}).items():
        content = github.read_storage(config, 'report', f"{config['report_release']}/{name}")
        documents.update(verify_asset(name, content, metadata))
    return documents


def merge_channel_documents(previous, incoming, selected_channels):
    """Replace successful selected lanes while retaining healthy sibling evidence."""
    old_snapshot = previous.get('snapshot.json')
    new_snapshot = incoming.get('snapshot.json')
    old_report = previous.get('report.json', {})
    new_report = incoming.get('report.json', {})
    if not isinstance(old_snapshot, dict) or not isinstance(new_snapshot, dict):
        raise ValueError('Same-revision channel merge requires validated snapshot documents')
    selected = set(selected_channels)
    success = {'COMPLETED','COMPLETED_OPTIONAL','CONFIGURED_COMPLETE','POLICY_FINDINGS','NOT_APPLICABLE'}
    old_channels = {row['channel']:row for row in old_snapshot.get('analysis_channels', [])}
    new_channels = {row['channel']:row for row in new_snapshot.get('analysis_channels', [])}
    replace = {channel for channel in selected if new_channels.get(channel, {}).get('status') in success}
    if not replace:
        raise ValueError('No selected scanner channel produced valid evidence for this revision')

    def families(snapshot, channel_rows, identities):
        observations = {row.get('observation_id'):row for row in snapshot.get('observations', [])}
        result = set()
        for identity in identities:
            row = channel_rows.get(identity, {})
            result.add(row.get('name', identity))
            result.update(observations[key].get('scanner_family') for key in row.get('observation_ids', [])
                          if key in observations and observations[key].get('scanner_family'))
        return result

    replaced_families = families(old_snapshot, old_channels, replace) | families(new_snapshot, new_channels, replace)
    old_observations = [row for row in old_snapshot.get('observations', [])
                        if row.get('scanner_family') not in replaced_families]
    new_observations = [row for row in new_snapshot.get('observations', [])
                        if row.get('scanner_family') in replaced_families]
    observations_by_id = {row['observation_id']:row for row in [*old_observations,*new_observations]}

    def merge_findings(field):
        combined = {}
        for finding in old_snapshot.get(field, []):
            row = dict(finding)
            row['observation_ids'] = [value for value in row.get('observation_ids', [])
                                      if value in observations_by_id and observations_by_id[value].get('scanner_family') not in replaced_families]
            row['supporting_scanner_families'] = [value for value in row.get('supporting_scanner_families', []) if value not in replaced_families]
            if row['observation_ids'] or row['supporting_scanner_families']:
                combined[row.get('stable_id',row.get('id'))] = row
        for finding in new_snapshot.get(field, []):
            if not set(finding.get('supporting_scanner_families', [])).intersection(replaced_families):
                continue
            identity = finding.get('stable_id',finding.get('id'))
            prior = combined.get(identity)
            if prior:
                row = dict(prior)
                row['observation_ids'] = list(dict.fromkeys([*row.get('observation_ids',[]),*finding.get('observation_ids',[])]))
                row['supporting_scanner_families'] = list(dict.fromkeys([*row.get('supporting_scanner_families',[]),*finding.get('supporting_scanner_families',[])]))
                combined[identity] = row
            else:
                combined[identity] = dict(finding)
        return list(combined.values())

    channels=[]
    for identity in old_channels.keys() | new_channels.keys():
        old=old_channels.get(identity)
        new=new_channels.get(identity)
        if identity in replace:
            row=dict(new)
        elif identity in selected and new:
            row=dict(old or new)
            row['last_attempt_status']=new.get('status')
            row['last_attempt_reason']=new.get('reason')
        else:
            row=dict(old or new)
        channels.append(row)
    channels.sort(key=lambda row:row['channel'])
    snapshot={**old_snapshot,**new_snapshot,
              'observations':sorted(observations_by_id.values(),key=lambda row:row['observation_id']),
              'canonical_findings':merge_findings('canonical_findings'),
              'ai_advisories':merge_findings('ai_advisories'),
              'analysis_channels':channels,'analysis_channel_count':len(channels)}
    snapshot['finding_count']=len(snapshot['canonical_findings'])+len(snapshot['ai_advisories'])
    snapshot['observation_count']=len(snapshot['observations'])
    gate_ids=list(dict.fromkeys([*old_snapshot.get('publication_gate',{}).get('channel_ids',[]),
                                *[channel for channel in replace if channel in new_channels]]))
    snapshot['publication_gate']={'policy':'static-evidence-v1','channel_ids':gate_ids,
                                 'satisfied':bool(gate_ids) and all(next((row['status'] for row in channels if row['channel']==channel),'')=='COMPLETED' for channel in gate_ids)}

    old_details = [detail for path, values in previous.items() if path.startswith('details/') and isinstance(values,list) for detail in values]
    new_details = [detail for path, values in incoming.items() if path.startswith('details/') and isinstance(values,list) for detail in values]
    details={row['id']:row for row in [*old_details,*new_details]}
    observations_by_id={row['observation_id']:row for row in snapshot['observations']}
    findings=[]
    all_canonical=[*snapshot['canonical_findings'],*snapshot['ai_advisories']]
    for finding in all_canonical:
        identity=finding['stable_id']
        detail=details.get(identity)
        if not detail:
            raise ValueError('Merged channel finding lacks its validated detail document')
        origins=[observations_by_id[oid] for oid in finding.get('observation_ids',[]) if oid in observations_by_id]
        row={'id':identity,'severity':finding.get('severity','UNKNOWN'),'file':finding.get('file',''),
             'line':finding.get('start_line',0),'message':detail.get('message',''),
             'scanners':finding.get('supporting_scanner_families',[]),
             'rules':sorted({str(origin.get('rule','')) for origin in origins}), 'page':0}
        findings.append(row)
        details[identity]={**detail,**row,'origins':[{key:origin.get(key) for key in ('scanner_family','rule','file','start_line','raw_artifact','observation_id')} for origin in origins]}
    findings.sort(key=lambda row:(row.get('severity',''),row.get('file',''),row.get('line',0),row['id']))
    merged_documents={path:value for path,value in previous.items() if not (path.startswith('details/') or path in {'report.json','snapshot.json','findings.json'})}
    merged_documents.update({path:value for path,value in incoming.items() if path.startswith('source/')})
    for index,row in enumerate(findings):
        row['page']=index//100
    for start in range(0,len(findings),100):
        page=start//100
        merged_documents[f'details/{page}.json']=[details[row['id']] for row in findings[start:start+100] if row['id'] in details]
    severities={}
    for row in findings:severities[row.get('severity','UNKNOWN')]=severities.get(row.get('severity','UNKNOWN'),0)+1
    incomplete=[row for row in channels if row.get('status') not in {'COMPLETED','COMPLETED_OPTIONAL','CONFIGURED_COMPLETE','POLICY_FINDINGS','NOT_SELECTED'} and not (row.get('status') in {'NOT_APPLICABLE','DEFERRED'} and row.get('reason'))]
    report={**old_report,**new_report,'finding_count':len(findings),'observation_count':len(snapshot['observations']),
            'channels':channels,'severities':severities,'status':'partial' if incomplete or selected-replace else 'complete'}
    merged_documents.update({'snapshot.json':snapshot,'report.json':report,'findings.json':findings})
    return merged_documents,report


def pr_overlay_key(project_id, context, target_sha, tooling_sha, profile_digest):
    identity=[str(project_id),context['number'],context.get('head_repository_id'),context['head_repository'],target_sha,
              context['base_sha'],tooling_sha,profile_digest]
    return hashlib.sha256(json.dumps(identity,separators=(',',':')).encode()).hexdigest()


def matching_pr_overlay(overlay, intent):
    overlay=overlay or {}
    context=intent.get('pr_context') or {}
    saved_context=overlay.get('pr_context') or {}
    return bool(context and overlay.get('status')=='complete'
                and overlay.get('project_id')==str(intent.get('project_id'))
                and overlay.get('head_sha')==intent.get('target_sha')
                and overlay.get('tooling_sha')==intent.get('tooling_sha')
                and overlay.get('profile_digest')==intent.get('profile_digest')
                and saved_context.get('number')==context.get('number')
                and saved_context.get('head_repository')==context.get('head_repository')
                and saved_context.get('head_repository_id')==context.get('head_repository_id')
                and saved_context.get('base_sha')==context.get('base_sha'))


def build_pr_overlay(documents, report, row):
    context=row.get('pr_context')
    snapshot=documents.get('snapshot.json',{})
    channel=next((value for value in snapshot.get('analysis_channels',[]) if value.get('channel')=='coderabbit-ai-advisory'),None)
    if not context or not channel or channel.get('status') not in {'COMPLETED','COMPLETED_OPTIONAL','POLICY_FINDINGS'}:
        raise ValueError('Pull-request overlay lacks validated CodeRabbit evidence and complete PR provenance')
    observations={value['observation_id']:value for value in snapshot.get('observations',[])}
    observation_ids=set(channel.get('observation_ids',[]))
    if not observation_ids.issubset(observations):
        raise ValueError('Pull-request overlay references missing validated observations')
    overlay_observations=[observations[key] for key in channel.get('observation_ids',[])]
    advisories=[value for value in snapshot.get('ai_advisories',[])
                if set(value.get('observation_ids',[])).intersection(observation_ids)]
    advisory_ids={value.get('stable_id') for value in advisories}
    findings=[value for value in documents.get('findings.json',[]) if value.get('id') in advisory_ids]
    detail_ids={value.get('id') for value in findings}
    details=[value for path,values in documents.items() if path.startswith('details/') and isinstance(values,list) for value in values if value.get('id') in detail_ids]
    return {'schema_version':'analysis-pr-overlay-v1','overlay_key':pr_overlay_key(row['project_id'],context,row['head_sha'],report['tooling_sha'],report['profile_digest']),
            'project_id':str(row['project_id']),'repository':row['repository'],'pr_context':context,
            'head_sha':row['head_sha'],'tooling_sha':report['tooling_sha'],'profile_digest':report['profile_digest'],
            'checked_at':report.get('generated_at') or now(),'channel':channel,'observations':overlay_observations,
            'advisories':advisories,'findings':findings,'details':details,
            'status':'complete'}


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
    result = {**previous, **state, 'schema_version':'analysis-current-v1', 'targets':[]}
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
            for key in ('documents', 'assets', 'analyzed_sha', 'collected_run', 'report_status', 'tooling_sha', 'profile_digest', 'requested_channels', 'execution_channels', 'reused_channels', 'channel_statuses'):
                if key in old:
                    entry[key] = old[key]
            if row.get('status') == 'collected' and old.get('collected_run') == f"{row.get('scan_run_id')}-{row.get('run_attempt')}":
                entry['status'] = old.get('report_status', 'partial')
            if entry.get('analyzed_sha') and entry['analyzed_sha'] != row['head_sha']:
                entry['status'] = 'stale'
            run_key = f"{row.get('scan_run_id')}-{row.get('run_attempt')}"
            if row.get('status') == 'collected' and old.get('collected_run') != run_key:
                entry['lifecycle_status'] = 'collecting'
                attempt_channel_statuses=[]
                try:
                    destination = Path(directory) / row['id']
                    report = github.collect(config, row, destination)
                    latest = row if row.get('client_request_id') else next((x for x in github.discover(config) if x['id'] == row['id']), None)
                    if row['kind'] == 'commit' and not row.get('client_request_id'):
                        latest = github.resolve_selection(config, row['head_sha'], [])
                    if latest is None or not accept(latest, report):
                        raise ValueError('Target changed before publication')
                    documents = {}
                    for p in destination.rglob('*'):
                        if p.suffix == '.json':
                            documents[p.relative_to(destination).as_posix()] = json.loads(p.read_text(encoding='utf-8'))
                        elif p.suffix == '.md':
                            documents[p.relative_to(destination).as_posix()] = p.read_text(encoding='utf-8')
                    report.update(profile_digest=row.get('profile_digest'),requested_channels=row.get('requested_channels'),
                                  execution_channels=row.get('execution_channels',row.get('requested_channels')),
                                   reused_channels=row.get('reused_channels',[]),
                                   request_id=row.get('client_request_id'),requested_selection=row.get('requested_selection'),
                                   pr_context=row.get('pr_context'))
                    attempt_channel_statuses=[dict(value) for value in report.get('channels',[]) if isinstance(value,dict)]
                    selected_channels=row.get('execution_channels',row.get('requested_channels',[]))
                    channel_rows={value.get('channel'):value for value in report.get('channels',[])}
                    valid_selected=any(channel_rows.get(channel,{}).get('status') in {'COMPLETED','COMPLETED_OPTIONAL','CONFIGURED_COMPLETE','POLICY_FINDINGS','NOT_APPLICABLE'} for channel in selected_channels)
                    if (selected_channels==['coderabbit-ai-advisory'] and row.get('pr_context')):
                        overlay=build_pr_overlay(documents,report,row)
                        overlay_manifest,overlay_blobs=shard({'pr-overlay.json':overlay})
                        pending.update(overlay_blobs)
                        result['current_overlay']={key:overlay[key] for key in (
                            'schema_version','overlay_key','project_id','repository','pr_context','head_sha',
                            'tooling_sha','profile_digest','checked_at','channel','status')}
                        result['current_overlay'].update(documents=overlay_manifest['documents'],assets=overlay_manifest['assets'],
                                                        client_request_id=row.get('client_request_id'),request_id=row.get('client_request_id'),
                                                        scan_run_id=row.get('scan_run_id'),run_attempt=row.get('run_attempt'))
                        entry.update(status='overlay_published',lifecycle_status='overlay_published',overlay_only=True,
                                     overlay_id=overlay['overlay_key'],overlay_status='complete',
                                     attempt_channel_statuses=attempt_channel_statuses,channel_statuses=report.get('channels',[]))
                        entries.append(entry)
                        continue
                    same_revision=(old.get('analyzed_sha')==report.get('analyzed_sha')
                                   and old.get('tooling_sha')==report.get('tooling_sha')
                                   and old.get('profile_digest')==report.get('profile_digest'))
                    if same_revision:
                        documents,report=merge_channel_documents(load_report_documents(config,old),documents,selected_channels)
                        for channel in report.get('channels',[]):
                            if channel.get('channel') in row.get('reused_channels',[]):
                                channel['evidence_reused']=True
                        for channel in documents.get('snapshot.json',{}).get('analysis_channels',[]):
                            if channel.get('channel') in row.get('reused_channels',[]):
                                channel['evidence_reused']=True
                    elif not valid_selected:
                        raise ValueError('No selected scanner channel produced valid evidence; the previous current report is preserved')
                    documents['report.json']=report
                    manifest, blobs = shard(documents)
                    pending.update(blobs)
                    entry['lifecycle_status'] = 'publishing'
                    entry.update(documents=manifest['documents'], assets=manifest['assets'],
                                 analyzed_sha=report['analyzed_sha'], collected_run=run_key,
                                 tooling_sha=report.get('tooling_sha'),profile_digest=report.get('profile_digest'),
                                 requested_channels=report.get('requested_channels'),execution_channels=report.get('execution_channels'),
                                 reused_channels=report.get('reused_channels'),
                                  attempt_channel_statuses=attempt_channel_statuses,
                                 channel_statuses=report.get('channels',[]),
                                 status=report['status'], report_status=report['status'])
                    for key in ('generated_at', 'report_generation_timestamp', 'producer_runs', 'requested_selection', 'pr_context'):
                        if key in report:
                            entry[key] = report[key]
                    entry['lifecycle_status'] = 'completed_partial' if report['status'] == 'partial' else 'completed'
                    entry.pop('error', None)
                    # Findings are never projected back to source repositories.
                except (ValueError, RuntimeError) as error:
                    entry.update(status='failed', lifecycle_status='failed', error=str(error))
                    receipt=next((value for value in state.get('requests',[]) if value.get('request_id')==row.get('client_request_id')),None)
                    if receipt and attempt_channel_statuses:
                        statuses={value.get('channel'):value for value in receipt.get('channel_statuses',[])}
                        statuses.update({value.get('channel'):value for value in attempt_channel_statuses if value.get('channel') in row.get('execution_channels',[])})
                        receipt['channel_statuses']=list(statuses.values())
                    try:
                        if recover_expired_evidence(config, row):
                            entry['recovery_reason'] = row['recovery_reason']
                    except (ValueError, RuntimeError):
                        pass  # API failure does not prove evidence is absent.
            entries.append(entry)

        canonical_id = f"current:{config.get('project_id', state.get('project_id', 'unknown'))}"
        valid = [entry for entry in entries if not entry.get('overlay_only')
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
            overlay=result.get('current_overlay')
            if (overlay and selected is not prior_current
                    and overlay.get('head_sha')!=selected.get('analyzed_sha')):
                result.pop('current_overlay',None)

        # Keep enough request/run history for activity polling without turning the
        # current manifest back into a per-target inventory.
        recent = list(previous.get('recent_runs', [])) if isinstance(previous.get('recent_runs'), list) else []
        for entry in sorted(valid, key=newest, reverse=True):
            recent.append({key: entry[key] for key in (
                'request_id', 'client_request_id', 'original_target_id', 'head_sha',
                'analyzed_sha', 'scan_run_id', 'run_attempt', 'execution_sha',
                'collected_run', 'report_status', 'lifecycle_status', 'checked_at',
                'execution_channels','attempt_channel_statuses')
                           if key in entry})
        for entry in entries:
            if entry.get('overlay_only'):
                recent.append({key:entry[key] for key in ('request_id','client_request_id','head_sha','analyzed_sha','scan_run_id','run_attempt','lifecycle_status','overlay_id','attempt_channel_statuses') if key in entry})
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
        referenced.update((result.get('current_overlay') or {}).get('assets',{}))
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
        previous_assets={name for row in previous_targets for name in row.get('assets',{})}
        previous_assets.update((previous.get('current_overlay') or {}).get('assets',{}))
        for name in previous_assets-set(referenced):
            try:
                github.cf_api(config,github.storage_path(config,'report',f'{config["report_release"]}/{name}'),method='DELETE')
            except (ValueError,RuntimeError):
                pass  # The committed manifest no longer references these assets.
    return result


def reconcile_repository(repository, project_id='', selection='', request_id=''):
    repo, document, execution_sha = load_projects(repository)
    queued_asset = None
    external_queue = bool(os.environ.get('QUEUE_INTENT'))
    if external_queue:
        intent = json.loads(os.environ['QUEUE_INTENT'])
        project_id = intent.get('project_id', '')
        selection = queued_selection(intent)
        request_id = intent.get('request_id', '')
        queued_asset = {'external': True}
    if queued_asset is None:
        # Direct/manual workflow inputs are recovery signals only. Only a durable,
        # previously accepted request asset is allowed to introduce scan work.
        project_id, selection, request_id = '', '', ''
    template = json.loads((Path(__file__).resolve().parents[2] / 'config/code-analysis/service.json').read_text(encoding='utf-8-sig'))
    runs = []
    for workflow in ('code-analysis-coordinator.yml',):
        runs.extend(github.pages(f'repos/{repository}/actions/workflows/{workflow}/runs','workflow_runs'))
    if external_queue:
        runs.append({'id':int(os.environ['GITHUB_RUN_ID']),'run_attempt':int(os.environ.get('GITHUB_RUN_ATTEMPT','1')),
                     'status':'completed','conclusion':'success','head_sha':os.environ['GITHUB_SHA'],
                     'display_title':'Queue coordinator '+os.environ['GITHUB_RUN_ID']})
    runs = list({run['id']:run for run in runs}.values())
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
        queue_advanced=False
        config = service_config(document, project['id'], template)
        config['source_workflow'] = WORKFLOW
        current=config['report_release']
        current_manifest=release_manifest.read(config,current)
        source = github.api('repos/' + config['source_repository'])
        if source['id'] != config['source_repository_id'] or source['private']:
            raise ValueError('Source repository identity/visibility changed')
        config['source_repository'] = source['full_name']
        release, old = stored[project['id']]
        rows = github.inventory(config, old)  # Fail closed on incomplete pagination.
        selected = None
        if selection and str(project['id']) == str(project_id):
            selected = github.resolve_selection(config, selection, rows)
            if not any(r['id'] == selected['id'] for r in rows):
                manual = old.get('manual_target', {})
                rows = [r for r in rows if r['id'] != manual.get('id')]
                old['manual_target'] = selected
                rows.append(selected)
        state = reconcile(old, rows, now())
        for row in state['targets']:
            if row.get('status') in {'queued','dispatching'} and not (row.get('client_request_id') or row.get('request_id')):
                row.update(status='superseded',error='Automatic discovery no longer launches scans; submit an explicit request.')
        state.update(project_id=project['id'], source_repository=source['full_name'],
                     analysis_repository=repository, relationship=project['relationship'],
                     preferred_branch=project['preferred_branch'])
        if selection and str(project['id']) == str(project_id) and request_id != old.get('last_request_id'):
            github.request_refresh(state, selected['id'])
            state['last_request_id'] = request_id
            accepted = next(r for r in state['targets'] if r['id'] == selected['id'])
            accepted['client_request_id'] = request_id
            accepted['requested_selection'] = intent.get('selection', selected) if queued_asset is not None else selected
            if queued_asset is not None and intent.get('schema_version') == 'analysis-request-v2':
                accepted.update(requested_channels=intent['requested_channels'],pr_context=intent.get('pr_context'),
                                tooling_sha=intent['tooling_sha'],profile_digest=intent['profile_digest'],
                                analysis_key_components=intent['analysis_key'],run_again=intent.get('run_again',False))
                requested=accepted['requested_channels']
                cached_target=next((target for target in current_manifest.get('targets',[])
                                    if target.get('original_target_id')==selected['id']
                                    and target.get('analyzed_sha')==selected['head_sha']
                                    and target.get('tooling_sha')==intent['tooling_sha']
                                    and target.get('profile_digest')==intent['profile_digest']),None)
                cached_status=list((cached_target or {}).get('channel_statuses',[]))
                overlay=current_manifest.get('current_overlay',{})
                if matching_pr_overlay(overlay,intent):
                    cached_status.append({'channel':'coderabbit-ai-advisory','status':'COMPLETED','evidence_reused':True})
                execution,reused=channel_execution_plan(requested,cached_status,accepted['run_again'])
                # One durable request owns the global slot. Dispatch every missing
                # producer lane in that one workflow so its jobs can fan out while
                # all lanes remain pinned to the same immutable source revision.
                execution_channels=concurrent_execution_channels(execution)
                accepted.update(execution_channels=execution_channels,remaining_channels=[],reused_channels=reused,
                                completed_channels=list(reused),failed_channels=[])
                if reused:
                    cached_by_id={value['channel']:value for value in cached_status}
                    accepted['channel_statuses']=[{**cached_by_id[channel],'evidence_reused':True} for channel in reused]
                if not execution:
                    accepted.update(status='cached',lifecycle_status='completed',execution_channels=[],remaining_channels=[],reused_channels=list(requested))
            state['requests'] = [r for r in state.get('requests', []) if r['request_id'] != request_id][-99:] + [{'request_id':request_id,'target_id':selected['id'],'head_sha':selected['head_sha'],'requested_channels':accepted.get('requested_channels',project['enabled_scanners']),'execution_channels':accepted.get('execution_channels',accepted.get('requested_channels',[])),'remaining_channels':accepted.get('remaining_channels',[]),'reused_channels':accepted.get('reused_channels',[]),'completed_channels':accepted.get('completed_channels',[]),'failed_channels':[],'selection':accepted.get('requested_selection'),'pr_context':accepted.get('pr_context'),'channel_statuses':accepted.get('channel_statuses',[]),'status':'reused' if accepted.get('status')=='cached' else 'queued'}]
        state['targets'].sort(key=lambda row: not row.get('manual_refresh',False))
        for row in state['targets']:
            key = analysis_key(row, document['tooling_sha'], config)
            if row.get('analysis_key') != key:
                row.update(analysis_key=key,status='queued')
                row.pop('request_id',None); row.pop('scan_run_id',None)
            if row.get('request_id'):
                run = (by_id.get(row.get('scan_run_id'))
                       or by_nonce.get('Source analysis ' + row.get('dispatch_id',row['request_id']))
                       or recover_completed_producer_run(config, row, runs))
                if run and run['head_sha'] == row.get('execution_sha'):
                    row.update(scan_run_id=run['id'],run_attempt=run['run_attempt'],
                               status='collected' if run['status']=='completed' else 'scanning',run_conclusion=run['conclusion'])
                continue  # Never retry a dispatch with an uncertain outcome.
            if row.get('status')=='cached':
                continue
            if not selection or str(project['id']) != str(project_id):
                continue
            request_id=row.get('client_request_id')
            # A queued envelope may unlock scheduling for this project, but it
            # must never revive a stale historical client request retained in
            # another target row. Only the exact FIFO envelope owns the slot.
            if not owns_active_request(row, intent):
                continue
            execution_channels=row.get('execution_channels',row.get('requested_channels',project['enabled_scanners']))
            dispatch_id=producer_dispatch_id(request_id,execution_channels)
            row.update(dispatch_id=dispatch_id,execution_sha=execution_sha,execution_channels=execution_channels)
            already_started=by_nonce.get('Source analysis '+dispatch_id)
            if already_started and already_started.get('head_sha')==execution_sha:
                row.update(request_id=request_id,scan_run_id=already_started['id'],run_attempt=already_started.get('run_attempt',1),
                           status='collected' if already_started['status']=='completed' else 'scanning',
                           run_conclusion=already_started.get('conclusion'))
                running+=already_started['status']!='completed'
                continue
            if running >= 1:
                continue
            row.update(profile_mode='portable' if project['profile'].get('mode') == 'portable' else 'agentic-soc', project_id=project['id'],request_id=request_id,status='dispatching',
                       tooling_sha=document['tooling_sha'], execution_sha=execution_sha,
                       requested_channels=row.get('requested_channels',project['enabled_scanners']),
                       execution_channels=execution_channels,dispatch_id=dispatch_id,
                       reused_channels=row.get('reused_channels',[]))
            row.pop('manual_refresh',None)
            release_manifest.write(config,release,state)
            if external_queue:
                row.update(request_id=request_id,scan_run_id=int(os.environ['GITHUB_RUN_ID']),
                           run_attempt=int(os.environ.get('GITHUB_RUN_ATTEMPT','1')),status='collected')
                continue
            raise ValueError('Only Durable Object coordinator claims may start source analysis')
        release_manifest.write(config,release,state)
        for receipt in state.get('requests', []):
            selected_row = next((r for r in state['targets'] if r.get('client_request_id') == receipt['request_id'] and r['head_sha'] == receipt['head_sha']), None)
            if selected_row and selected_row.get('scan_run_id'):
                receipt.update({k:selected_row[k] for k in ('scan_run_id','run_attempt','execution_sha','status','error','execution_channels','remaining_channels','dispatch_id') if k in selected_row})
        published = report_publication(config,state,current,document)
        summaries.append(published['metrics'])
        # Keep the FIFO head durable until every selected lane reaches a terminal state.
        if queued_asset is not None and str(project['id'])==str(project_id):
            active_request=terminal_queue_request(state,published,request_id)
            if request_id and not active_request:
                completed_runs = [run for run in runs
                                  if run.get('status') == 'completed'
                                  and run.get('display_title', '').startswith('Source analysis ' + request_id[:8] + '-')]
                exact_run = next((run for run in completed_runs
                                  if any(target.get('collected_run') == f"{run['id']}-{run.get('run_attempt', 1)}"
                                         and target.get('analyzed_sha') == intent.get('target_sha')
                                         and target.get('tooling_sha') == intent.get('tooling_sha')
                                         and target.get('profile_digest') == intent.get('profile_digest')
                                         for target in published.get('targets', []))), None)
                if exact_run:
                    active_request = {'status':'collected', 'remaining_channels':[],
                                      'scan_run_id':exact_run['id'],
                                      'run_attempt':exact_run.get('run_attempt', 1),
                                      'execution_channels':intent.get('requested_channels', [])}
            if active_request:
                receipt=next((row for row in state['requests'] if row.get('request_id')==request_id),None)
                if receipt:
                    if active_request.get('status')=='cached':
                        receipt.update(status='reused',target_id=published.get('current_target_id',receipt.get('target_id')))
                        queue_advanced=True
                    else:
                        recent=next((run for run in published.get('recent_runs',[])
                                     if (run.get('client_request_id') or run.get('request_id'))==request_id
                                     and run.get('scan_run_id')==active_request.get('scan_run_id')
                                     and run.get('run_attempt')==active_request.get('run_attempt')),None)
                        attempt_rows={value.get('channel'):value for value in (recent or {}).get('attempt_channel_statuses',[])}
                        success={'COMPLETED','COMPLETED_OPTIONAL','CONFIGURED_COMPLETE','POLICY_FINDINGS','NOT_APPLICABLE'}
                        progress={value.get('channel'):value for value in receipt.get('channel_statuses',[])}
                        completed=set(receipt.get('completed_channels',[]))
                        failed=set(receipt.get('failed_channels',[]))
                        for channel in active_request.get('execution_channels',[]):
                            attempt=attempt_rows.get(channel,{})
                            status=attempt.get('status','FAILED')
                            progress[channel]={**attempt,'channel':channel,'status':status,
                                               'reason':attempt.get('reason') or (None if status in success else active_request.get('error') or 'Scanner lane did not produce valid evidence.')}
                            if status in success:
                                completed.add(channel);failed.discard(channel)
                            else:
                                failed.add(channel);completed.discard(channel)
                        receipt.update(completed_channels=sorted(completed),failed_channels=sorted(failed),
                                       channel_statuses=list(progress.values()))
                        receipt.update(status='published' if completed else 'failed',target_id=published.get('current_target_id',receipt.get('target_id')))
                        overlay=published.get('current_overlay',{})
                        if overlay.get('client_request_id')==request_id and overlay.get('head_sha')==receipt.get('head_sha'):
                            receipt['overlay_id']=overlay.get('overlay_key')
                        queue_advanced=True
                    published['requests']=state['requests']
                    release_manifest.write(config,current,published)
                if not external_queue and not active_request.get('remaining_channels') and active_request.get('status') in {'collected','cached'}:
                    queued_asset=None
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
