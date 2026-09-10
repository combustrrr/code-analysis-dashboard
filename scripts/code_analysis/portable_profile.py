"""Reviewed portable execution configuration; no implicit application commands."""
from pathlib import PurePosixPath

COMMAND_CHANNELS = {'eslint', 'typescript', 'coverage', 'atheris', 'schemathesis', 'pyright'}
STATIC_JOBS = {'python-bandit', 'python-ruff', 'complexity', 'dead-code'}
ADAPTER_JOBS = STATIC_JOBS | {'typescript-quality', 'test-coverage', 'atheris-state-machine', 'schemathesis-fuzz', 'python-types'}

def path(value):
    if not isinstance(value,str) or not value or "\\" in value or PurePosixPath(value).is_absolute() or '..' in PurePosixPath(value).parts or ':' in value:
        raise ValueError('Profile paths must stay inside the source repository')
    return value

def validate(profile):
    if set(profile)-{'mode','python_root','javascript_root','commands'}:
        raise ValueError('Unknown portable profile field')
    for key in ('python_root','javascript_root'):
        if key in profile:path(profile[key])
    commands=profile.get('commands',{})
    if not isinstance(commands,dict) or set(commands)-COMMAND_CHANNELS:
        raise ValueError('Unknown command adapter')
    for channel,command in commands.items():
        if not isinstance(command,dict) or set(command)-{'argv','cwd','install','output'}:
            raise ValueError('Invalid command adapter')
        path(command.get('cwd','.'))
        if 'output' in command:path(command['output'])
        for argv in [command.get('argv'),*command.get('install',[])]:
            if not isinstance(argv,list) or not argv or len(argv)>100 or any(not isinstance(x,str) or not x or len(x)>4096 or '\x00' in x for x in argv):
                raise ValueError('Commands must be bounded argument arrays')
    return profile

def readiness(profile):
    validate(profile)
    supported={'semgrep','gitleaks','trivy','checkov','openssf-scorecard','github-secret-protection-posture','github-actions-security','coderabbit-ai-advisory'}
    if profile.get('python_root'):supported.update({'bandit','ruff','radon','xenon','vulture'})
    if profile.get('python_root') or profile.get('javascript_root'):supported.add('codeql')
    supported.update(profile.get('commands',{}))
    return supported
