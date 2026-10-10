"""Validate dispatch identity; assemble only artifacts from this workflow attempt."""
import argparse
import json
import os
from pathlib import Path

from scripts.code_analysis.github_service import api, gh, extract_zip, pages
from scripts.code_analysis.hosted import load, target, write
from scripts.code_analysis.hosted_pipeline import assemble


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--assemble', action='store_true')
    a = p.parse_args()
    row = json.loads(os.environ['TARGET_JSON'])
    validated = target(row['repository'], row['branch'], row['head_sha'], pr=row.get('pr'),
                       source_repository=row['source_repository'], base_sha=row.get('base_sha'), base_branch=row.get('base_branch'), kind=row.get('kind'))
    import subprocess
    tooling_revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip() if os.environ.get('IS_REUSABLE_ANALYSIS') == 'true' else os.environ['GITHUB_SHA']
    if validated['id'] != row['id'] or os.environ['TOOLING_SHA'] != tooling_revision:
        raise ValueError('dispatch identity or tooling revision mismatch')
    if not a.assemble:
        from scripts.code_analysis.applicability import selection
        jobs, _, languages = selection(json.loads(Path('config/code-analysis/service.json').read_text()), Path('.source'))
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('jobs=' + json.dumps(jobs) + '\n')
            # An empty language result is meaningful: applicability excludes
            # language-dependent scanners. Never invent Python evidence for a
            # repository with no detected supported language.
            output.write('languages=' + json.dumps(languages) + '\n')
        return
    host, run, attempt = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_RUN_ID'], int(os.environ['GITHUB_RUN_ATTEMPT'])
    root = Path('.hosted/artifacts')
    root.mkdir(parents=True, exist_ok=True)
    # A rerun reuses its run ID; only artifacts created after this attempt started qualify.
    producer = api(f'repos/{host}/actions/runs/{run}/attempts/{attempt}')
    artifact_bytes = 0
    # Download from R2 (temp-runs prefix isolates ephemeral brokered artifacts)
    bucket = os.environ.get('R2_BUCKET_NAME')
    import subprocess
    if bucket:
        endpoint = f"https://{os.environ.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com"
        # Since R2 paths are {run}/{attempt}/{artifact_name}/, we sync the attempt prefix to .hosted/artifacts/
        subprocess.run([
            "aws", "s3", "sync", 
            f"s3://{bucket}/temp-runs/{run}/{attempt}/", 
            str(root),
            "--endpoint-url", endpoint
        ], check=True)
    else:
        for artifact in pages(f'repos/{host}/actions/runs/{run}/artifacts', 'artifacts'):
            if artifact['expired'] or artifact['name'].startswith('hosted-report-') or artifact['created_at'] < producer['run_started_at']:
                continue
            destination = root / str(artifact['id'])
            artifact_bytes += artifact.get('size_in_bytes', 0)
            extract_zip(gh('api', f"repos/{host}/actions/artifacts/{artifact['id']}/zip", binary=True), destination)
    write(root / 'producer-status.json', {'scanner_family': 'Producer', 'run_id': run, 'run_attempt': attempt,
                                        'source_repository': row['source_repository'], 'source_sha': row['head_sha']})
    from scripts.code_analysis.applicability import selection
    selected_jobs, excluded, _ = selection(json.loads(Path('config/code-analysis/service.json').read_text()), Path('.source'))
    execution_jobs = pages(f'repos/{host}/actions/runs/{run}/attempts/{attempt}/jobs', 'jobs')
    from scripts.code_analysis.applicability import GROUPS
    from scripts.code_analysis.portable_profile import ADAPTER_JOBS
    JOBS = {key:value for key,value in GROUPS.items() if key in ADAPTER_JOBS}
    from scripts.code_analysis.portable_runner import FAMILIES
    for group, channels in JOBS.items():
        matching = [j for j in execution_jobs if j.get('name','').endswith('Portable ' + group)]
        if group in selected_jobs and matching and any(j.get('conclusion') != 'success' for j in matching):
            for channel in channels:
                write(root / 'zz-workflow-execution' / channel / 'execution-status.json', {'scanner_family':FAMILIES[channel], 'status':'FAILED', 'reason':'Portable scanner job failed before usable completion; inspect its exact producer run.'})
    if 'codeql' in selected_jobs:
        codeql_jobs = [j for j in execution_jobs if 'CodeQL (' in j.get('name','')]
        complete = bool(codeql_jobs) and all(j.get('conclusion') == 'success' for j in codeql_jobs)
        write(root / 'codeql-execution/execution-status.json', {'scanner_family':'CodeQL', 'status':'COMPLETED' if complete else 'FAILED', 'reason':'Every selected language job completed.' if complete else 'One or more selected CodeQL language jobs failed or lack completion evidence.'})
    if 'coderabbit-ai-advisory' in excluded:
        write(root / 'coderabbit/coderabbit-status.json', {'scanner_family': 'CodeRabbit', **excluded['coderabbit-ai-advisory']})
    elif row.get('pr'):
        from scripts.code_analysis.collect_coderabbit import collect
        try:
            evidence, status = collect(
                row['repository'], row['branch'], row['head_sha'],
                os.environ.get('CODERABBIT_GITHUB_TOKEN', ''),
                pr_number=row['pr'], base_sha=row.get('base_sha'), base_branch=row.get('base_branch'),
                provenance={'workflow_run_id': os.environ['GITHUB_RUN_ID'],
                            'workflow_run_attempt': os.environ['GITHUB_RUN_ATTEMPT'],
                            'tooling_sha': os.environ['TOOLING_SHA'],
                            'collector': 'collect_coderabbit.py',
                            'collector_revision': os.environ.get('COLLECTOR_SHA', os.environ['TOOLING_SHA'])})
            write(root / 'coderabbit/coderabbit-advisories.json', evidence)
            write(root / 'coderabbit/coderabbit-status.json', status)
        except Exception as exc:
            write(root / 'coderabbit/coderabbit-status.json', {
                'scanner_family': 'CodeRabbit', 'status': 'UNAVAILABLE',
                'reason': f'Exact upstream PR review collection failed: {type(exc).__name__}',
                'provenance': {'workflow_run_id': os.environ['GITHUB_RUN_ID'],
                               'workflow_run_attempt': os.environ['GITHUB_RUN_ATTEMPT'],
                               'tooling_sha': os.environ['TOOLING_SHA']},
            })
    else:
        write(root / 'coderabbit/coderabbit-status.json', {'scanner_family': 'CodeRabbit', 'status': 'COMPLETED_OPTIONAL', 'reason': 'Branch target; CodeRabbit evidence is collected on PR targets'})
    report = assemble(root, Path('.hosted/output'), validated, host, run, Path('.source'), Path('config/code-analysis'))
    report.update(tooling_sha=os.environ['TOOLING_SHA'], producer_run_attempt=attempt,
                  producer_artifact_bytes=artifact_bytes, source_boundary='isolated-tooling-v1')
    write(Path('.hosted/output/report/report.json'), report)
    from scripts.code_analysis.threat_report import enrich, markdown
    snapshot = load(Path('.hosted/output/snapshot.json'))
    threat = enrich(snapshot, validated, report)
    write(Path('.hosted/output/report/threat-report.json'), threat)
    Path('.hosted/output/report/threat-report.md').write_text(markdown(threat), encoding='utf-8')
    Path('.hosted/output/report').rename('.hosted/report')


if __name__ == '__main__':
    main()
