"""Generate the isolated exact-source workflow from existing scanner definitions.

The generated workflow has no SARIF publication privileges, persisted checkout
credentials, or source-inherited tooling.
"""
import copy
import json
import re
from pathlib import Path
from typing import Any, cast

import yaml

ROOT = Path(__file__).resolve().parents[2]
CHECKOUT = 'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803'
UPLOAD = 'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9'
PYTHON = 'actions/setup-python@ece7cb06caefa5fff74198d8649806c4678c61a1'
# GitHub resolves this expression at runtime; it contains no credential material in source.
GITHUB_TOKEN_EXPRESSION = '${{ github.token }}'


def mapping(value: object, context: str) -> dict[str, Any]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise ValueError(f'{context} must be a string-keyed mapping')
    return cast(dict[str, Any], value)


def step_list(value: object, context: str) -> list[dict[str, Any]]:
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValueError(f'{context} must be a list of step mappings')
    return cast(list[dict[str, Any]], value)


def normalize_expressions(value: Any) -> Any:
    if isinstance(value, str):
        return re.sub(r'\$\{\s*((?:secrets|github)\.[^{}]+?)\s*\}', r'${{ \1 }}', value)
    if isinstance(value, list):
        return [normalize_expressions(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_expressions(item) for key, item in value.items()}
    return value


def include_template_job(name: str, profile: dict[str, Any]) -> bool:
    if name in {'workflow-security-posture', 'snyk', 'sonarqube-cloud', 'dependency-review'}:
        return False
    if profile.get('mode') not in {'portable', 'code-analysis-dashboard'}:
        return True
    from scripts.code_analysis.applicability import PORTABLE_JOBS
    return name in PORTABLE_JOBS | {'codeql'}


def remove_secret_environment(job: dict[str, Any], name: str) -> None:
    job['env'] = {key: value for key, value in job.get('env', {}).items()
                  if not (isinstance(value, str) and 'secrets.' in value)}
    for step in step_list(job.get('steps', []), f'{name} steps'):
        if isinstance(step.get('env'), dict):
            step['env'] = {key: value for key, value in step['env'].items()
                           if not (isinstance(value, str) and 'secrets.' in value)}
            if not step['env']:
                step.pop('env')


def strip_isolated_step_secrets(job: dict[str, Any], name: str) -> None:
    for step in step_list(job['steps'], f'{name} isolated steps'):
        if 'env' in step:
            step['env'] = {key: value for key, value in step['env'].items()
                           if not (isinstance(value, str) and 'secrets.' in value)}
        if step.get('name') == 'Observe GitHub secret-scanning posture':
            step['env'] = {'GH_TOKEN': GITHUB_TOKEN_EXPRESSION}


def render_source_step(step: dict[str, Any], name: str) -> dict[str, Any] | None:
    uses = step.get('uses', '')
    if 'R2_' in json.dumps(step):
        command = re.search(r'aws s3 cp\s+(.*?)\s+s3://', str(step.get('run', '')), re.DOTALL)
        if not command:
            raise ValueError('Cannot safely convert R2 upload in ' + str(step.get('name', 'unnamed')))
        paths = '\n'.join(line.strip().rstrip('\\') for line in command.group(1).splitlines() if line.strip())
        artifact_name = step.get('name', 'scanner-output').replace('Upload ', '').replace(' to R2', '').strip()
        missing = 'ignore' if artifact_name == 'fuzzing-findings' else 'error'
        step = {'name': 'Upload ' + artifact_name + ' as artifact', 'if': step.get('if', 'always()'),
                'uses': UPLOAD, 'with': {'name': artifact_name, 'path': paths,
                                         'if-no-files-found': missing, 'retention-days': 7}}
        uses = UPLOAD
    if 'upload-sarif@' in uses or step.get('name') in {'Parse Results for Aggregation', 'Upload Normalized Findings'}:
        return None
    if uses.startswith('actions/checkout@'):
        options = step.setdefault('with', {})
        options['persist-credentials'] = False
        if options.get('path') == '.analysis-tooling':
            options.update(repository='${{ github.repository }}', ref='${{ inputs.tooling_sha }}')
            options.pop('sparse-checkout', None)
            options.pop('sparse-checkout-cone-mode', None)
        else:
            options.update(repository='${{ fromJSON(inputs.target).source_repository }}',
                           ref='${{ fromJSON(inputs.target).head_sha }}')
    if 'github/codeql-action/analyze@' in uses:
        step.setdefault('with', {})['upload'] = 'never'
        step['with']['upload-database'] = False
    if uses.startswith('gitleaks/gitleaks-action@'):
        step = {'name': 'Run pinned Gitleaks without PR mutation', 'run':
                'docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.30.1 detect --source=/repo --report-format=sarif --report-path=/repo/gitleaks-results.sarif --redact --exit-code=0'}
    if step.get('name') == 'Validate and normalize Gitleaks output':
        step = {'name': 'Validate redacted Gitleaks output',
                'run': 'jq -e \'(.runs | type) == "array"\' gitleaks-results.sarif > /dev/null'}
    if name == 'snyk' and step.get('name') == 'Resolve Python dependency manifests for Snyk SCA':
        step['run'] = 'python -I .analysis-tooling/scripts/code_analysis/snyk_metadata.py --source "$GITHUB_WORKSPACE" --destination "$RUNNER_TEMP/snyk-metadata"'
    if name == 'snyk' and step.get('name') == 'Scan open-source dependencies':
        step['run'] = 'set -o pipefail\npython -I .analysis-tooling/scripts/code_analysis/snyk_scan.py 2>&1 | tee snyk-open-source.log'
    text = yaml.safe_dump(step, sort_keys=False)
    replacements = (
        ('inputs.scan_sha || github.event.pull_request.head.sha || github.sha', 'fromJSON(inputs.target).head_sha'),
        ('inputs.scan_sha', 'fromJSON(inputs.target).head_sha'),
        ('inputs.scan_branch', 'fromJSON(inputs.target).branch'),
        ('inputs.ensure_sonar_browse', 'false'),
        ("env.SNYK_TOKEN != ''", "env.SNYK_CONFIGURED == 'true'"),
        ("env.SNYK_TOKEN == ''", "env.SNYK_CONFIGURED != 'true'"),
        ('--command=.snyk-venv/bin/python', '--command="$RUNNER_TEMP/snyk-metadata/inspect-python"'),
        ('repos/${GITHUB_REPOSITORY}', 'repos/${SOURCE_REPOSITORY}'),
    )
    for old, new in replacements:
        text = text.replace(old, new)
    step = mapping(yaml.safe_load(text), f'{name} rendered step')
    if name == 'snyk' and step.get('name') == 'Record configured scan status':
        step['run'] = step['run'].replace('jq -n', 'if [[ "$SCA_OUTCOME" != success || "$CODE_OUTCOME" != success ]] && grep -q "monthly limit" snyk-*.log; then\n  reason="Snyk execution incomplete; a quota warning was also emitted. Inspect the failing manifest or surface before attributing the failure to quota."\nfi\njq -n')
    if step.get('name') == 'Ensure Browse for the verified Sonar API user':
        step['if'] = "env.SONAR_API_TOKEN != ''"
        step['continue-on-error'] = True
    if name == 'atheris-state-machine' and 'run' in step:
        step['run'] = step['run'].replace('../tests/security_canary/', '../.analysis-tooling/tests/security_canary/')
    return step


def tooling_checkout() -> dict[str, Any]:
    return {'uses': CHECKOUT, 'with': {'repository': '${{ github.repository }}',
            'ref': '${{ inputs.tooling_sha }}', 'path': '.analysis-tooling', 'persist-credentials': False}}


def configure_profile_steps(name: str, number: int, job: dict[str, Any],
                            steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if name == 'snyk':
        job['env'].pop('SNYK_TOKEN', None)
        job['env']['SNYK_CONFIGURED'] = 'false'
        steps.insert(1, tooling_checkout())
    if name in {'test-coverage', 'typescript-quality'}:
        if not any(step.get('with', {}).get('path') == '.analysis-tooling' for step in steps):
            steps.insert(1, tooling_checkout())
        tasks = {'Install dependencies': 'python-install', 'Run pytest with coverage': 'python-test',
                 'Install locked dependencies': 'javascript-install'}
        for step in steps:
            step_name = step.get('name')
            task = tasks.get(step_name) if isinstance(step_name, str) else None
            if task:
                step['run'] = f'PYTHONPATH="$GITHUB_WORKSPACE/.analysis-tooling" python -m scripts.code_analysis.run_profile {task} --source "$GITHUB_WORKSPACE"'
    if number == 7:
        steps.insert(1, tooling_checkout())
    if name == 'schemathesis-fuzz':
        steps = [step for step in steps if step.get('name') != 'Start FastAPI Backend in Background']
        for step in steps:
            if step.get('name') == 'Install dependencies & Schemathesis':
                step['run'] = 'PYTHONPATH="$GITHUB_WORKSPACE/.analysis-tooling" python -m scripts.code_analysis.run_profile python-install --source "$GITHUB_WORKSPACE"\npython -m pip install schemathesis==3.39.16 httpx==0.28.1'
            elif step.get('name') == 'Run API Fuzzing (Schemathesis)':
                step['run'] = 'PYTHONPATH="$GITHUB_WORKSPACE/.analysis-tooling" python -m scripts.code_analysis.run_profile api-fuzz --source "$GITHUB_WORKSPACE"'
            elif (step.get('name') in {'Upload Fuzzing Report', 'Upload schemathesis-report as artifact'}
                  or step.get('with', {}).get('name') == 'schemathesis-report'):
                step['with']['path'] = 'fuzzing-results.xml\nschema.json\nschemathesis-status.json'
    if name == 'typescript-quality':
        steps.extend([
            {'name': 'Run repository JavaScript test profile', 'if': 'always()',
             'run': 'PYTHONPATH="$GITHUB_WORKSPACE/.analysis-tooling" python -m scripts.code_analysis.run_profile javascript-test --source "$GITHUB_WORKSPACE"'},
            {'uses': UPLOAD, 'if': 'always()', 'with': {'name': 'typescript-tests',
             'path': 'typescript-test-status.json', 'retention-days': 7}}])
    return steps


def configure_sonar_access(steps: list[dict[str, Any]]) -> None:
    probe = next(step for step in steps if step.get('name') == 'Probe Sonar credentials without exposing secrets')
    steps.remove(probe)
    position = next(index for index, step in enumerate(steps) if step.get('id') == 'sonar-identity')
    probe.setdefault('env', {})['SCAN_BRANCH'] = '${{ steps.sonar-identity.outputs.sonar_branch }}'
    probe['id'] = 'sonar-access'
    probe['run'] += '\npython -c \'import json; p=json.load(open("sonar-access-probe.json")); print("native_export_ready="+str(p["credentials"].get("issue_api",{}).get("project_issues_http_status")==200 and p["credentials"].get("issue_api",{}).get("branch_issues_http_status") not in (401,403)).lower())\' >> "$GITHUB_OUTPUT"'
    probe['run'] += '\npython -c \'import json; p=json.load(open("sonar-access-probe.json")); print("access_failure="+p["credentials"].get("issue_api",{}).get("access_failure",""))\' >> "$GITHUB_OUTPUT"'
    steps.insert(position + 1, probe)
    for step in steps:
        if step.get('id') in {'sonar-native', 'sonar-manual'}:
            step['if'] += " && steps.sonar-access.outputs.native_export_ready == 'true'"
        if step.get('name') == 'Record configured scan status':
            step.setdefault('env', {})['EXPORT_READY'] = '${{ steps.sonar-access.outputs.native_export_ready }}'
            step['env']['ACCESS_FAILURE'] = '${{ steps.sonar-access.outputs.access_failure }}'
            step['run'] = step['run'].replace('jq -n', 'if [[ "$EXPORT_READY" != true ]]; then\n  reason="Sonar native issue API is unavailable to the configured credential; analysis awaits export access"\nfi\njq -n')
            step['run'] = step['run'].replace('jq -n', 'if [[ "$ACCESS_FAILURE" == branch_entitlement ]]; then\n  status=COMPLETED_OPTIONAL\n  reason="Sonar organization denies non-main-branch data access; treating as complete for free tier"\nfi\njq -n')


def scorecard_steps() -> list[dict[str, Any]]:
    pin = json.loads((ROOT / '.ci/scorecard.json').read_text())
    version, digest = pin['version'], pin['sha256']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or not re.fullmatch('[0-9a-f]{64}', digest) or pin['checksum_version'] != version:
        raise ValueError('Scorecard update requires a matching verified release checksum')
    return [{'uses': CHECKOUT, 'with': {'ref': '${{ inputs.tooling_sha }}', 'persist-credentials': False}},
            {'name': f'Install verified Scorecard {version}', 'run':
             f'curl --fail --location --retry 3 https://github.com/ossf/scorecard/releases/download/v{version}/scorecard_{version}_linux_amd64.tar.gz -o scorecard.tar.gz\n'
             f'echo "{digest}  scorecard.tar.gz" | sha256sum --check\n'
             'tar -xzf scorecard.tar.gz scorecard\n'},
            {'name': 'Scan external repository at selected commit', 'id': 'scorecard', 'continue-on-error': True,
             'env': {'GITHUB_AUTH_TOKEN': GITHUB_TOKEN_EXPRESSION, 'ENABLE_SARIF': 'true',
                     'SOURCE_SHA': '${{ fromJSON(inputs.target).head_sha }}'},
             'run': './scorecard --repo="github.com/$SOURCE_REPOSITORY" --commit="$SOURCE_SHA" --format=json --show-details > scorecard-native.json\npython -I scripts/code_analysis/scorecard_report.py'},
            {'name': 'Retain Scorecard execution status', 'if': 'always()',
             'env': {'OUTCOME': '${{ steps.scorecard.outcome }}'},
             'run': 'if [[ "$OUTCOME" != success ]]; then\n  jq -n \'{scanner_family:"OpenSSF Scorecard",status:"OPERATIONAL_FAILURE",reason:"Native Scorecard execution or source identity validation failed"}\' > scorecard-status.json\nfi'},
            {'uses': UPLOAD, 'if': 'always()', 'with': {'name': 'openssf-scorecard',
             'path': 'openssf-scorecard.sarif\nscorecard-status.json\nscorecard-native.json', 'retention-days': 7}}]


def isolate_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    isolated: list[dict[str, Any]] = []
    for step in steps:
        if step.get('uses', '').startswith('actions/checkout@') and step.get('with', {}).get('path') == '.analysis-tooling':
            isolated.extend([step, {'name': 'Keep trusted tooling outside the source scan tree',
                                    'run': 'mv "$GITHUB_WORKSPACE/.analysis-tooling" "$RUNNER_TEMP/analysis-tooling"'}])
            continue
        if step.get('uses', '').startswith('github/codeql-action/init@'):
            isolated.append({'name': 'Stage trusted CodeQL policy in Git metadata',
                             'run': 'mkdir -p "$GITHUB_WORKSPACE/.git/code-analysis"\ncp "$RUNNER_TEMP/analysis-tooling/.github/codeql/codeql-config.yml" "$GITHUB_WORKSPACE/.git/code-analysis/codeql-config.yml"'})
            step['with']['config-file'] = '.git/code-analysis/codeql-config.yml'
        if 'run' in step:
            step['run'] = step['run'].replace('$GITHUB_WORKSPACE/.analysis-tooling', '$RUNNER_TEMP/analysis-tooling').replace('../.analysis-tooling', '$RUNNER_TEMP/analysis-tooling').replace('.analysis-tooling', '$RUNNER_TEMP/analysis-tooling')
            step['run'] = step['run'].replace('PYTHONPATH="$RUNNER_TEMP/analysis-tooling" python -m scripts.code_analysis.run_profile', 'python -I "$RUNNER_TEMP/analysis-tooling/scripts/code_analysis/trusted_entry.py" run_profile')
        if 'with' in step:
            step['with'] = {key: value.replace('.analysis-tooling', '${{ runner.temp }}/analysis-tooling')
                            if isinstance(value, str) else value for key, value in step['with'].items()}
        isolated.append(step)
    if any('trusted_entry.py' in str(step.get('run', '')) for step in isolated):
        setup_index = next((index for index, step in enumerate(isolated)
                            if str(step.get('uses', '')).startswith('actions/setup-python@')), None)
        if setup_index is None:
            setup_index = next(index for index, step in enumerate(isolated)
                               if 'trusted_entry.py' in str(step.get('run', '')))
            isolated.insert(setup_index, {'name': 'Set up Python 3.11 for trusted analysis runtime',
                                          'uses': PYTHON, 'with': {'python-version': '3.11'}})
        isolated.insert(setup_index + 1, {'name': 'Install pinned trusted analysis runtime',
                         'run': 'python -m pip install --requirement "$RUNNER_TEMP/analysis-tooling/.ci/requirements.txt"'})
    return isolated


def configure_portable_steps(profile: dict[str, Any], name: str, steps: list[dict[str, Any]]) -> None:
    if profile.get('mode') in {'portable', 'code-analysis-dashboard'} and name == 'codeql':
        steps[:] = [step for step in steps if not step.get('uses', '').startswith('github/codeql-action/autobuild@')]
        for step in steps:
            if step.get('uses', '').startswith('github/codeql-action/init@'):
                step['with'].pop('config-file', None)
                step['with']['build-mode'] = 'none'
    if profile.get('mode') in {'portable', 'code-analysis-dashboard'} and name == 'semgrep':
        for step in steps:
            if 'run' in step and 'backend/ webui/src/' in step['run']:
                step['run'] = 'semgrep --config=p/owasp-top-ten --config=p/secrets --json --output=semgrep-results.json .'


def configure_sonar_project(job: dict[str, Any]) -> None:
    identity_step = {'name': 'Derive Sonar project identity', 'id': 'sonar-project', 'shell': 'bash',
        'run': ('set -euo pipefail\nIFS=/ read -r organization repository <<< "$SOURCE_REPOSITORY"\n'
                'if [[ -z "$organization" || -z "$repository" || "$SOURCE_REPOSITORY" != "$organization/$repository" ]]; then\n'
                '  echo "SOURCE_REPOSITORY must be an owner/repository identity" >&2\n  exit 1\nfi\n'
                'printf "organization=%s\nproject_key=%s_%s\n" "$organization" "$organization" "$repository" >> "$GITHUB_OUTPUT"')}
    steps = step_list(job['steps'], 'Sonar steps')
    steps.insert(0, identity_step)
    for step in steps:
        if 'with' in step and 'args' in step['with']:
            args = step['with']['args'].replace(
                '-Dsonar.organization=${{ github.repository_owner }} -Dsonar.projectKey=${{ github.repository_owner }}_${{ github.event.repository.name }}',
                '-Dsonar.organization=${{ steps.sonar-project.outputs.organization }} -Dsonar.projectKey=${{ steps.sonar-project.outputs.project_key }}')
            if 'sonar.project.properties' in args and '-Dsonar.organization=' not in args:
                args = args.replace('-Dproject.settings=',
                    '-Dsonar.organization=${{ steps.sonar-project.outputs.organization }} -Dsonar.projectKey=${{ steps.sonar-project.outputs.project_key }} -Dproject.settings=', 1)
            step['with']['args'] = args
        if 'run' in step:
            step['run'] = step['run'].replace('--project combustrrr_Agentic-Kibana', '--project ${{ steps.sonar-project.outputs.project_key }}')
            step['run'] = step['run'].replace('--project ${{ github.repository_owner }}_${{ github.event.repository.name }}', '--project ${{ steps.sonar-project.outputs.project_key }}')
            if '$SONAR_PROJECT_KEY' in step['run']:
                step.setdefault('env', {})['SONAR_PROJECT_KEY'] = '${{ steps.sonar-project.outputs.project_key }}'


def build_template_job(name: str, original: object, number: int,
                       profile: dict[str, Any]) -> dict[str, Any]:
    job = copy.deepcopy(mapping(original, f'{name} job'))
    if name == 'test-coverage':
        job['timeout-minutes'] = max(job.get('timeout-minutes', 30), 40)
    remove_secret_environment(job, name)
    job = mapping(normalize_expressions(job), f'{name} normalized job')
    job['needs'] = ['identity']
    job['permissions'] = {'contents': 'read'}
    if name == 'codeql':
        job['permissions']['security-events'] = 'read'
        job['strategy']['matrix']['language'] = '${{ fromJSON(needs.identity.outputs.languages) }}'
    job.pop('if', None)
    job['if'] = "${{ contains(fromJSON(needs.identity.outputs.jobs), '" + name + "') }}"
    job.setdefault('env', {})['SOURCE_REPOSITORY'] = '${{ fromJSON(inputs.target).source_repository }}'
    job['env'].pop('SONAR_PROJECT_KEY', None)
    if name == 'atheris-state-machine':
        job['env'].update(ANALYSIS_BACKEND_ROOT='${{ github.workspace }}/' + profile['python_root'],
                          ANALYSIS_SOURCE_SHA='${{ fromJSON(inputs.target).head_sha }}')
    steps = [rendered for step in step_list(job['steps'], f'{name} normalized steps')
             if (rendered := render_source_step(step, name)) is not None]
    steps = configure_profile_steps(name, number, job, steps)
    if name == 'sonarqube-cloud':
        configure_sonar_access(steps)
    if name == 'openssf-scorecard':
        steps = scorecard_steps()
    isolated = isolate_steps(steps)
    configure_portable_steps(profile, name, isolated)
    job['steps'] = isolated
    strip_isolated_step_secrets(job, name)
    if name == 'sonarqube-cloud':
        configure_sonar_project(job)
    if name == 'snyk':
        step_list(job['steps'], 'Snyk steps').append({'name': 'Upload isolated resolver diagnostics',
            'if': 'always()', 'uses': UPLOAD, 'with': {'name': 'snyk-resolver-diagnostics',
            'path': '${{ runner.temp }}/snyk-resolver-error.json', 'if-no-files-found': 'ignore',
            'retention-days': 7}})
    if 'secrets.' in json.dumps(job):
        raise ValueError('Source scanner job retains a repository secret reference: ' + name)
    return job


def generate(config: dict[str, Any] | None = None) -> str:
    config = config or mapping(json.loads((ROOT / 'config/code-analysis/service.json').read_text()), 'service config')
    profile = mapping(config['profile'], 'service profile')
    inputs: dict[str, Any] = {k: {'required': True, 'type': 'string'} for k in ('target', 'tooling_sha', 'request_id', 'dispatch_id')}
    document: dict[str, Any] = {'name': 'Exact Source Analysis', 'run-name': 'Source analysis ${{ inputs.dispatch_id }}',
                'on': {'workflow_call': {'inputs': inputs}}, 'permissions': {'contents': 'read'},
                 # Every explicit launch gets its own producer artifact.  A
                 # newer request may supersede the dashboard target, but it
                 # must not cancel the earlier run before its evidence/report
                 # artifact is assembled.
                  'concurrency': {'group': 'source-analysis-${{ inputs.dispatch_id }}', 'cancel-in-progress': False}, 'jobs': {}}
    jobs = mapping(document['jobs'], 'workflow jobs')
    jobs['identity'] = {'runs-on': 'ubuntu-24.04', 'timeout-minutes': 5,
        'outputs': {'jobs': '${{ steps.identity.outputs.jobs }}', 'languages': '${{ steps.identity.outputs.languages }}'},
        'steps': [{'uses': CHECKOUT, 'with': {'persist-credentials': False}},
                  {'uses': CHECKOUT, 'with': {'repository': '${{ fromJSON(inputs.target).source_repository }}',
                    'ref': '${{ fromJSON(inputs.target).head_sha }}', 'path': '.source', 'persist-credentials': False}},
                  {'name': 'Validate trusted tooling and selected target', 'id': 'identity',
                    'env': {'GH_TOKEN':GITHUB_TOKEN_EXPRESSION,'TARGET_JSON': '${{ inputs.target }}', 'TOOLING_SHA': '${{ inputs.tooling_sha }}','REQUEST_ID':'${{ inputs.request_id }}'},
                   'run': 'python -m scripts.code_analysis.source_identity'}]}
    # Scanner recipes are inputs to the generated production workflows, not
    # independently runnable Actions entry points.
    templates = ROOT / 'config/code-analysis/workflow-templates'
    for number in (1, 2, 3, 4, 7):
        path = next(templates.glob(f'0{number}-*.yml'))
        old = mapping(yaml.safe_load(path.read_text(encoding='utf-8')), f'{path.name} workflow')
        for name, original in mapping(old['jobs'], f'{path.name} jobs').items():
            if not include_template_job(name, profile):
                continue
            jobs[f'scanner-{number}-{name}'] = build_template_job(name, original, number, profile)
    from scripts.code_analysis.extensions import registry
    for extension in registry(config):
        channel = extension['channel']
        if extension['mode'] == 'source' and extension.get('secrets'):
            raise ValueError('Source extensions cannot receive credentials')
        steps: list[dict[str, Any]] = [{'uses': CHECKOUT, 'with': {'ref': '${{ inputs.tooling_sha }}', 'persist-credentials': False}},
                 {'uses': PYTHON, 'with': {'python-version': '3.11'}}]
        if extension['mode'] == 'source':
            steps.append({'uses': CHECKOUT, 'with': {'repository': '${{ fromJSON(inputs.target).source_repository }}',
                          'ref': '${{ fromJSON(inputs.target).head_sha }}', 'path': '.source', 'persist-credentials': False}})
        environment = {'TARGET_JSON': '${{ inputs.target }}', 'TOOLING_SHA': '${{ inputs.tooling_sha }}'}
        if extension['mode'] == 'vendor':
            environment.update({key: '${{ secrets.' + value + ' }}' for key, value in extension.get('secrets', {}).items()})
        steps += [{'name': 'Run trusted scanner adapter', 'env': environment,
                   'run': 'python -m scripts.code_analysis.extension_runner ' + channel},
                  {'uses': UPLOAD, 'if': 'always()', 'with': {'name': channel,
                   'path': '.extension-output/' + channel + '.channel-evidence', 'retention-days': 7,
                   'if-no-files-found': 'error'}}]
        jobs[channel] = {'name': extension['name'], 'needs': ['identity'],
                         'if': "${{ contains(fromJSON(needs.identity.outputs.jobs), '" + channel + "') }}",
                         'runs-on': 'ubuntu-24.04', 'timeout-minutes': extension.get('timeout_minutes', 15) + 5,
                         'permissions': {'contents': 'read'}, 'steps': steps}
    from scripts.code_analysis.community_workflow import (
        scanner_jobs as community_scanner_jobs,
    )
    jobs.update(community_scanner_jobs())
    if profile.get('mode') in {'portable', 'code-analysis-dashboard'}:
        from scripts.code_analysis.portable_workflow import scanner_jobs
        jobs.update(scanner_jobs())
    jobs['report'] = {'needs': list(jobs), 'if': "${{ always() && needs.identity.result == 'success' }}",
        'runs-on': 'ubuntu-24.04', 'timeout-minutes': 30, 'permissions': {'contents': 'read', 'actions': 'read'},
        'steps': [{'uses': CHECKOUT, 'with': {'ref': '${{ inputs.tooling_sha }}', 'persist-credentials': False}},
            {'uses': PYTHON, 'with': {'python-version': '3.11'}},
            {'name': 'Install trusted reporting dependencies', 'run': 'python -m pip install click==8.5.0 ruff==0.17.3'},
            {'uses': CHECKOUT, 'with': {'repository': '${{ fromJSON(inputs.target).source_repository }}',
                'ref': '${{ fromJSON(inputs.target).head_sha }}', 'path': '.source', 'persist-credentials': False}},
            {'name': 'Collect exact producer artifacts and assemble report',
             'env': {'GH_TOKEN': GITHUB_TOKEN_EXPRESSION, 'TARGET_JSON': '${{ inputs.target }}', 'TOOLING_SHA': '${{ inputs.tooling_sha }}','REQUEST_ID':'${{ inputs.request_id }}'},
             'run': 'python -m scripts.code_analysis.source_identity --assemble'},
            {'uses': UPLOAD, 'with': {'name': 'hosted-report-${{ github.run_id }}-${{ github.run_attempt }}',
                'path': '.hosted/report/', 'if-no-files-found': 'error', 'retention-days': 7}}]}
    return '# Generated by scripts/code_analysis/generate_source_workflow.py; do not edit by hand.\n' + yaml.safe_dump(document, sort_keys=False, width=110)


def diagnostics() -> str:
    raw_document = yaml.safe_load(generate())
    if not isinstance(raw_document, dict):
        raise TypeError('generated source workflow must be a mapping')
    trigger = raw_document.pop('on', raw_document.pop(True, None))
    document = mapping(raw_document, 'generated source workflow')
    document['on'] = {'workflow_dispatch': mapping(trigger, 'workflow trigger')['workflow_call']}
    document['name'] = 'Scanner access diagnostics'
    document['run-name'] = 'Scanner diagnostics ${{ inputs.dispatch_id }}'
    mapping(document['concurrency'], 'workflow concurrency')['group'] = 'scanner-diagnostics-${{ inputs.dispatch_id }}'
    document['jobs'] = {key: value for key, value in mapping(document['jobs'], 'workflow jobs').items()
                        if key in {'identity', 'scanner-3-snyk', 'scanner-1-sonarqube-cloud'}}
    return '# Generated scanner diagnostics; never publishes a target report.\n' + yaml.safe_dump(document, sort_keys=False, width=110)


if __name__ == '__main__':
    (ROOT / '.github/workflows/11-source-analysis.yml').write_text(generate(), encoding='utf-8')
    (ROOT / '.github/workflows/12-scanner-diagnostics.yml').write_text(diagnostics(), encoding='utf-8')
