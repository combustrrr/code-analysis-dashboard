"""Reviewed portable execution configuration; no implicit application commands."""
from pathlib import PurePosixPath
import re

COMMAND_CHANNELS = {'eslint', 'typescript', 'coverage', 'atheris', 'schemathesis', 'pyright'}
STATIC_JOBS = {'python-bandit', 'python-ruff', 'complexity', 'dead-code'}
ADAPTER_JOBS = STATIC_JOBS | {'typescript-quality', 'test-coverage', 'atheris-state-machine', 'schemathesis-fuzz', 'python-types', 'osv-scanner'}

def path(value):
    if not isinstance(value,str) or not value or "\\" in value or PurePosixPath(value).is_absolute() or '..' in PurePosixPath(value).parts or ':' in value:
        raise ValueError('Profile paths must stay inside the source repository')
    return value

def validate(profile):
    frontend_fields = {'javascript_install_command','javascript_test_command','frontend_build_command','frontend_preview_command','frontend_preview_url','frontend_lighthouse_budgets'}
    if set(profile)-({'mode','python_root','javascript_root','commands'} | frontend_fields):
        raise ValueError('Unknown portable profile field')
    for key in ('python_root','javascript_root'):
        if key in profile:path(profile[key])
    commands=profile.get('commands',{})
    if not isinstance(commands,dict) or set(commands)-COMMAND_CHANNELS:
        raise ValueError('Unknown command adapter')
    for command in commands.values():
        if not isinstance(command,dict) or set(command)-{'argv','cwd','install','output'}:
            raise ValueError('Invalid command adapter')
        path(command.get('cwd','.'))
        if 'output' in command:path(command['output'])
        for argv in [command.get('argv'),*command.get('install',[])]:
            if not isinstance(argv,list) or not argv or len(argv)>100 or any(not isinstance(x,str) or not x or len(x)>4096 or '\x00' in x for x in argv):
                raise ValueError('Commands must be bounded argument arrays')
    present = frontend_fields & set(profile)
    if present and present != frontend_fields:
        raise ValueError('Portable frontend scanning requires the complete reviewed profile')
    for key in ('javascript_install_command','javascript_test_command','frontend_build_command','frontend_preview_command'):
        if key in profile and (not isinstance(profile[key],list) or not profile[key] or len(profile[key])>16 or any(not isinstance(value,str) or not value or '\x00' in value for value in profile[key])):
            raise ValueError('Invalid frontend command')
    if 'frontend_preview_url' in profile and not re.fullmatch(r'http://127\.0\.0\.1:[0-9]{2,5}/',profile['frontend_preview_url']):
        raise ValueError('Invalid frontend preview URL')
    if 'frontend_lighthouse_budgets' in profile:
        budgets=profile['frontend_lighthouse_budgets']
        if not isinstance(budgets,dict) or set(budgets)!={'performance','accessibility','lcp_ms','cls'} or any(not isinstance(value,(int,float)) or value<0 for value in budgets.values()):
            raise ValueError('Invalid frontend Lighthouse budgets')
    return profile

def readiness(profile):
    validate(profile)
    supported={'semgrep','gitleaks','trivy','checkov','openssf-scorecard','github-secret-protection-posture','github-actions-security','coderabbit-ai-advisory'}
    if profile.get('python_root'):supported.update({'bandit','ruff','radon','xenon','vulture'})
    if profile.get('python_root') or profile.get('javascript_root'):supported.add('codeql')
    if profile.get('javascript_root'):supported.update({'ext-frontend-build','ext-frontend-tests','ext-axe-accessibility','ext-lighthouse-ui'})
    # These channels run in the isolated vendor workflow for every portable
    # project. Missing vendor credentials remain explicit scan evidence.
    supported.update({'snyk','sonarqube-cloud'})
    supported.update(profile.get('commands',{}))
    return supported
