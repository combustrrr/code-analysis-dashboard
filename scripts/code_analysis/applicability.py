"""Trusted scanner selection from explicit configuration and the checked-out tree."""
from pathlib import Path


IGNORED_DISCOVERY_DIRS = {'.git', '.venv', 'venv', 'node_modules', 'vendor',
                          'dist', 'build', '.tox', '.mypy_cache', '.pytest_cache'}
DEPENDENCY_MANIFEST_NAMES = {
    'Cargo.lock', 'Gemfile.lock', 'composer.lock', 'go.mod', 'go.sum',
    'gradle.lockfile', 'package-lock.json', 'pnpm-lock.yaml', 'poetry.lock',
    'requirements.txt', 'requirements-dev.txt', 'requirements-test.txt',
    'uv.lock', 'yarn.lock',
}


def discover_capabilities(source: Path) -> dict[str, list[str]]:
    """Discover safe, repository-relative inputs for generic portable scanners."""
    manifests, dockerfiles = [], []
    for path in source.rglob('*'):
        if any(part in IGNORED_DISCOVERY_DIRS for part in path.relative_to(source).parts):
            continue
        if path.is_file():
            relative = path.relative_to(source).as_posix()
            if path.name in DEPENDENCY_MANIFEST_NAMES:
                manifests.append(relative)
            if path.name == 'Dockerfile' or path.name.startswith('Dockerfile.'):
                dockerfiles.append(relative)
    return {'dependency_manifests': sorted(manifests), 'dockerfiles': sorted(dockerfiles)}

# A shared producer must be enabled or deferred as a unit: partial disabling must
# never silently discard observations produced by another channel in that job.
GROUPS = {
    'sonarqube-cloud': ['sonarqube-cloud'], 'python-ruff': ['ruff'],
    'python-bandit': ['bandit'], 'python-types': ['pyright'],
    'typescript-quality': ['eslint', 'typescript'], 'codeql': ['codeql'],
    'semgrep': ['semgrep'], 'snyk': ['snyk'], 'osv-scanner': ['osv'],
    'gitleaks': ['gitleaks'], 'trivy': ['trivy'], 'hadolint': ['hadolint'],
    'checkov': ['checkov'],
    'shipping-image-security': ['shipping-image-cves', 'sbom-license-provenance'],
    'github-secret-protection-posture': ['github-secret-protection-posture'],
    'github-actions-security': ['github-actions-security'],
    'openssf-scorecard': ['openssf-scorecard'], 'complexity': ['radon', 'xenon'],
    'dead-code': ['vulture'], 'test-coverage': ['coverage'],
    'schemathesis-fuzz': ['schemathesis'], 'atheris-state-machine': ['atheris'],
    'coderabbit': ['coderabbit-ai-advisory'],
    'codex-security': ['codex-security'],
    'alibaba-ocr': ['alibaba-ocr'],
    'flounder-audit': ['flounder-audit'],
    'vulnagent-triage': ['vulnagent-triage'],
    'owasp-jvm': ['owasp-jvm'],
    'owasp-go': ['owasp-go'],
    'owasp-js': ['owasp-js'],
    'owasp-ruby': ['owasp-ruby'],
    'owasp-iac-secrets': ['owasp-iac-secrets'],
}
PORTABLE_JOBS = {'semgrep', 'gitleaks', 'trivy', 'checkov', 'openssf-scorecard', 'coderabbit'}
VENDOR_JOBS = {'snyk','sonarqube-cloud'}

PYTHON_JOBS = {'python-ruff', 'python-bandit', 'python-types', 'complexity',
               'dead-code', 'test-coverage', 'schemathesis-fuzz', 'atheris-state-machine'}
GENERATED_JOBS = PORTABLE_JOBS | VENDOR_JOBS | PYTHON_JOBS | {
    'codeql', 'osv-scanner', 'typescript-quality', 'github-actions-security',
    'owasp-js', 'owasp-iac-secrets'}


def selection(config: dict, source: Path, requested_channels: list[str] | None = None) -> tuple[list[str], dict, list[str]]:
    known = {channel for channels in GROUPS.values() for channel in channels}
    enabled = set(config.get('enabled_scanners', known))
    deferred = config.get('deferred_channels', {})
    if (enabled & set(deferred) or enabled | set(deferred) != known
            or any(not isinstance(reason, str) or not reason.strip() for reason in deferred.values())):
        raise ValueError('Every known scanner must be enabled or explicitly deferred with a reason')
    requested = set(requested_channels) if requested_channels is not None else enabled
    if not requested or requested - enabled:
        raise ValueError('Requested scanner channels must be enabled by the trusted project profile')
    for channels in GROUPS.values():
        if requested.intersection(channels) and not set(channels).issubset(requested):
            raise ValueError('Channels sharing a producer must be selected together')
    profile = config['profile']
    def present(relative: str) -> bool:
        path = (source / relative).resolve()
        if not path.is_relative_to(source.resolve()):
            raise ValueError('Profile path escapes selected source')
        return path.exists()
    portable = profile.get('mode') == 'portable'
    if portable:
        from scripts.code_analysis.portable_profile import readiness
        capabilities = discover_capabilities(source)
        supported = readiness(profile)
        supported -= {'github-actions-security', 'owasp-js', 'owasp-iac-secrets'}
        supported.add('owasp-iac-secrets')
        if profile.get('javascript_root') and present(profile['javascript_root']):
            supported.add('owasp-js')
        if present('.github/workflows'):
            supported.add('github-actions-security')
        if capabilities['dependency_manifests']:
            supported.add('osv')
        languages = (['python'] if profile.get('python_root') and present(profile['python_root']) else []) + (['javascript-typescript'] if profile.get('javascript_root') and present(profile['javascript_root']) else [])
        absent = {job: 'Requires a reviewed source path, command adapter or vendor configuration.' for job, channels in GROUPS.items() if not all(c in supported for c in channels) or job not in GENERATED_JOBS}
        for job in PYTHON_JOBS:
            if job not in absent and 'python' not in languages:
                absent[job] = 'Configured Python source path is absent at this revision.'
        if not languages: absent['codeql'] = 'No configured supported language source at this revision.'
    else:
        python = present(profile['python_root'])
        javascript = present(profile['javascript_root'])
        languages = (['python'] if python else []) + (['javascript-typescript'] if javascript else [])
        absent = {'github-secret-protection-posture':'Repository security-posture access requires a credential unavailable to source scanner jobs.'}
        for job in PYTHON_JOBS:
            if not python:
                absent[job] = 'Selected source has no configured Python project: ' + profile['python_root']
        if not javascript:
            absent['typescript-quality'] = 'Selected source has no configured JavaScript project: ' + profile['javascript_root']
            absent['owasp-js'] = 'Selected source has no configured JavaScript project: ' + profile['javascript_root']
        if not languages:
            absent['codeql'] = 'Selected source has neither configured language project'
            absent['sonarqube-cloud'] = 'Selected source has neither configured language project'
            absent['snyk'] = 'Selected source has neither configured language project'
        if not present(profile['python_root'] + '/Dockerfile') or not present(profile['javascript_root'] + '/Dockerfile'):
            absent['shipping-image-security'] = 'Selected source lacks the configured pair of shipping Dockerfiles'
        if not present(profile['python_root'] + '/Dockerfile') and not present(profile['javascript_root'] + '/Dockerfile'):
            absent['hadolint'] = 'Selected source has no configured shipping Dockerfiles to lint'
        manifests = [profile['python_requirements'], profile.get('python_development_requirements'),
                     profile['javascript_root'] + '/package-lock.json']
        if not any(present(path) for path in manifests if path):
            absent['osv-scanner'] = 'Selected source has none of the configured dependency manifests'
    jobs, excluded = [], {}
    for job, channels in GROUPS.items():
        active = enabled.intersection(channels)
        if active and len(active) != len(channels):
            raise ValueError('Channels sharing producer ' + job + ' must be enabled or deferred together')
        selected = requested.intersection(channels)
        if selected and job not in absent:
            jobs.append(job)
        else:
            for channel in channels:
                if channel not in requested and channel in enabled:
                    excluded[channel] = {'status':'NOT_SELECTED','reason':'Not selected for this request'}
                else:
                    excluded[channel] = {
                        'status': ('NOT_AVAILABLE' if portable else 'NOT_APPLICABLE') if active else 'DEFERRED',
                        'reason': absent.get(job) if active else deferred[channel],
                    }
    workflow_directory = source / '.github/workflows'
    if ('github-actions-security' in requested and
            (not present('.github/workflows') or not any(
                p.is_file() and p.suffix in {'.yml', '.yaml'} for p in workflow_directory.iterdir()))):
        excluded['github-actions-security'] = {
            'status': 'NOT_APPLICABLE', 'reason': 'Selected source contains no GitHub Actions workflow definitions'}
    from scripts.code_analysis.extensions import registry
    for extension in registry(config):
        if extension['channel'] not in requested:
            excluded[extension['channel']] = {'status':'NOT_SELECTED','reason':'Not selected for this request'}
        elif extension.get('deferred_reason'):
            excluded[extension['channel']] = {'status': 'DEFERRED', 'reason': extension['deferred_reason']}
        else:
            jobs.append(extension['channel'])
    return jobs, excluded, languages


def apply(snapshot: dict, exclusions: dict) -> None:
    for channel in snapshot['analysis_channels']:
        if channel['channel'] in exclusions:
            if channel['observation_count']:
                raise ValueError('Excluded scanner unexpectedly produced observations')
            channel.update(exclusions[channel['channel']], findings=None)
            if channel['status'] == 'NOT_SELECTED':
                channel.update(observation_count=0,observation_ids=[],artifact_files=[],reason='Not selected for this request')
