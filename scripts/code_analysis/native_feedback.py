"""GitHub-native feedback with an explicit connected-source boundary."""
import base64
import gzip
import hashlib
import copy
import json
from urllib.parse import urlencode

from scripts.code_analysis import github_service as github
from scripts.code_analysis.projects import native_feedback_allowed

SECURITY_SCANNERS = {'bandit', 'gitleaks', 'osv-scanner', 'osv', 'trivy'}


def sarif(findings):
    results = []
    for finding in findings:
        scanners = {str(s).lower() for s in finding.get('scanners', [])}
        if not scanners.intersection(SECURITY_SCANNERS):
            continue
        path = finding.get('file', '')
        if not path or path.startswith('/') or '..' in path.replace('\\', '/').split('/') or ':' in path:
            continue
        location = {'artifactLocation':{'uri':path.replace('\\','/'), 'uriBaseId':'%SRCROOT%'}}
        if type(finding.get('line')) is int and finding['line'] > 0:
            location['region'] = {'startLine':finding['line']}
        results.append({'ruleId':str(next(iter(finding.get('rules') or ['security-finding']))),
            'level':{'CRITICAL':'error','HIGH':'error','MEDIUM':'warning'}.get(finding.get('severity'),'note'),
            'message':{'text':str(finding.get('message', 'Scanner finding'))},
            'partialFingerprints':{'analysisFindingId/v1':str(finding['id'])},
            'locations':[{'physicalLocation':location}]})
    return {'version':'2.1.0', '$schema':'https://json.schemastore.org/sarif-2.1.0.json',
            'runs':[{'tool':{'driver':{'name':'Code Analysis Security'}},'results':results}]}


def security_shards(findings, project_id):
    """Fixed hash buckets keep categories stable across revisions and clear empty buckets."""
    template = sarif(findings)
    buckets = [[] for _ in range(16)]
    for result in template['runs'][0]['results']:
        identity = result['partialFingerprints']['analysisFindingId/v1']
        buckets[int(hashlib.sha256(identity.encode()).hexdigest()[0], 16)].append(result)
    payloads = []
    for index, results in enumerate(buckets):
        if len(results) > 5000:
            raise ValueError('A native security bucket exceeds 5000 results; complete findings remain in dashboard')
        payload = copy.deepcopy(template)
        payload['runs'][0]['results'] = results
        payload['runs'][0]['automationDetails'] = {'id':f'code-analysis/{project_id}/security-v2/{index:02d}/'}
        compressed = gzip.compress(json.dumps(payload).encode())
        if len(compressed) > 10_000_000:
            raise ValueError('Native security bucket exceeds upload size; complete findings remain in dashboard')
        payloads.append(base64.b64encode(compressed).decode())
    return payloads


def processing(repository, feedback):
    result = copy.deepcopy(feedback)
    uploads = result.get('uploads', [])
    for upload in uploads:
        if upload.get('status') not in ('complete', 'failed'):
            response = github.api(f"repos/{repository}/code-scanning/sarifs/{upload['id']}")
            upload['status'] = response.get('processing_status', 'pending')
            if response.get('errors'):
                upload['errors'] = response['errors']
    result['status'] = ('failed' if any(u.get('status') == 'failed' for u in uploads)
                        else 'security_published' if len(uploads) == result.get('expected_uploads',16) and all(u.get('status') == 'complete' for u in uploads)
                        else 'security_processing')
    return result


def publish(document, project_id, row, report, findings, *, dashboard_url):
    if not native_feedback_allowed(document,project_id,report):
        return {'status':'not_applicable','reason':'Read-only observer or foreign PR source; native upload prohibited'}
    repo = document['execution_repository']['full_name']
    identity = f"analysis:{project_id}:{row['id']}:{row['scan_run_id']}:{row['run_attempt']}"
    check = {'name':'Code Analysis', 'head_sha':report['analyzed_sha'], 'external_id':identity,
        'status':'completed', 'conclusion':'success' if report['status']=='current' and not report['finding_count'] else 'neutral',
        'details_url':dashboard_url+'#'+urlencode({'repository':repo,'project':project_id,'target':row['id'],'tab':'overview'}),
        'output':{'title':f"{report['finding_count']} findings; {report['status']} analysis",
                  'summary':'Scanner observations are not confirmed defects.\n\n'+
                    '\n'.join(f"- {c['name']}: {c['status']}" for c in report['channels'])}}
    existing = github.pages(f"repos/{repo}/commits/{report['analyzed_sha']}/check-runs", 'check_runs')
    previous = next((c for c in existing if c.get('external_id')==identity),None)
    if previous:
        github.api(f"repos/{repo}/check-runs/{previous['id']}",payload={k:v for k,v in check.items() if k!='head_sha'},method='PATCH')
        check_id=previous['id']
    else:
        check_id=github.api(f'repos/{repo}/check-runs',payload=check)['id']
    # Manual commits have no proven branch/PR ref. Checks are sufficient there.
    ref = f"refs/heads/{row['branch']}" if row['kind']=='branch' else f"refs/pull/{row['pr']}/head" if row['kind']=='pr' else None
    if not ref:
        return {'status':'checks_published','check_id':check_id}
    from scripts.code_analysis.snapshot import COMPLETE_STATUSES
    security = [c for c in report['channels'] if c['channel'] in {'bandit','gitleaks','osv','trivy'}]
    completed = [c['channel'] for c in security if c['status'] in COMPLETE_STATUSES]
    missing = sorted({'bandit','gitleaks','osv','trivy'} - set(completed))
    if not completed:
        return {'status':'partial', 'check_id':check_id, 'reason':'Incomplete security channels; retain previous native security alerts'}
    payloads = []
    try:
        for channel in sorted(completed):
            aliases = {'osv','osv-scanner'} if channel == 'osv' else {channel}
            selected = [f for f in findings if aliases.intersection(str(x).lower() for x in f.get('scanners', []))]
            payloads.extend(security_shards(selected, project_id + '/' + channel))
    except ValueError as error:
        return {'status':'partial','adapter_version':3,'check_id':check_id,'reason':str(error)}
    uploads = []
    for index, payload in enumerate(payloads):
        try:
            upload = github.api(f'repos/{repo}/code-scanning/sarifs',payload={
                'commit_sha':report['analyzed_sha'],'ref':ref,'sarif':payload})
            uploads.append({'bucket':index,'id':upload['id'],'status':'pending'})
        except (RuntimeError, ValueError) as error:
            return {'status':'failed','adapter_version':3,'check_id':check_id,'expected_uploads':len(payloads),'unavailable_channels':missing,'uploads':uploads,'reason':str(error)}
    return {'status':'security_processing','adapter_version':3,'check_id':check_id,'expected_uploads':len(payloads),'unavailable_channels':missing,'uploads':uploads}
