"""Versioned, repository-owned application projects and publication boundaries."""
from __future__ import annotations

import copy
import re
from typing import Any

SCHEMA = 'analysis-projects-v1'
PROTECTED_SOURCE = 'arydestroyer/kavach-agenticsoc'
READ_ONLY_IDS = {1267340546, 1278177697}
READ_ONLY_NAMES = {PROTECTED_SOURCE, 'combustrrr/agentic-kibana'}
NAME = re.compile(r'^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
SHA = re.compile(r'^[a-f0-9]{40}$')


def repository(value: dict) -> dict:
    if (not isinstance(value, dict) or type(value.get('id')) is not int or value['id'] <= 0
            or not NAME.fullmatch(value.get('full_name', '')) or value.get('private') is not False):
        raise ValueError('A verified public GitHub repository with a numeric ID is required')
    return {key: value[key] for key in ('id', 'full_name', 'private')}


def validate(document: dict) -> dict:
    result = copy.deepcopy(document)
    if result.get('schema_version') != SCHEMA:
        raise ValueError('Unsupported project configuration version')
    execution = repository(result.get('execution_repository'))
    if execution['full_name'].lower() in READ_ONLY_NAMES or execution['id'] in READ_ONLY_IDS:
        raise ValueError('Protected upstream cannot be an execution or publication repository')
    if not SHA.fullmatch(result.get('tooling_sha', '')):
        raise ValueError('Shared tooling must use an immutable revision')
    projects = result.get('projects')
    if not isinstance(projects, list) or not projects:
        raise ValueError('At least one project is required')
    seen = set()
    for project in projects:
        source = repository(project.get('source_repository'))
        identity = str(source['id'])
        if project.get('id') != identity or identity in seen:
            raise ValueError('Project identity must be its unique source repository ID')
        seen.add(identity)
        relation = project.get('relationship')
        if relation not in ('connected', 'observer'):
            raise ValueError('Unknown source relationship')
        same = source['id'] == execution['id']
        if same != (relation == 'connected'):
            raise ValueError('Connected sources must be the execution repository; observers must be separate')
        if source['full_name'].lower() == PROTECTED_SOURCE and relation != 'observer':
            raise ValueError('Protected upstream is read-only')
        if not isinstance(project.get('preferred_branch'), str) or not project['preferred_branch'].strip():
            raise ValueError('Preferred branch is required')
        if not isinstance(project.get('profile'), dict) or not project['profile']:
            raise ValueError('An explicit repository profile is required')
        if not isinstance(project.get('enabled_scanners'), list) or not all(isinstance(x, str) for x in project['enabled_scanners']):
            raise ValueError('Explicit scanner selection is required')
        if (not isinstance(project.get('fast_scanners'), list) or not project['fast_scanners']
                or not all(isinstance(x, str) for x in project['fast_scanners'])):
            raise ValueError('An explicit non-empty fast scanner selection is required')
        if not set(project['fast_scanners']).issubset(project['enabled_scanners']):
            raise ValueError('Fast scanners must be enabled for the project')
        if not isinstance(project.get('deferred_channels', {}), dict):
            raise ValueError('Invalid scanner deferrals')
        if project.get('native_feedback_enabled', False) is not False:
            raise ValueError('Native feedback must remain disabled for every configured project')
        project['native_feedback_enabled'] = False
        if set(project['enabled_scanners']) & set(project.get('deferred_channels', {})):
            raise ValueError('A scanner cannot be enabled and deferred')
        if any(not isinstance(x, str) or not x.strip() for x in project.get('deferred_channels', {}).values()):
            raise ValueError('Every deferral requires a reason')
        if project['profile'].get('mode') == 'portable':
            from scripts.code_analysis.portable_profile import validate as validate_profile
            validate_profile(project['profile'])
        project['source_repository'] = source
    result['execution_repository'] = execution
    result.pop('max_parallel_analyses', None)
    return result


def service_config(document: dict, project_id: str, template: dict) -> dict:
    document = validate(document)
    project = next((p for p in document['projects'] if str(p['id']) == str(project_id)), None)
    if project is None:
        raise ValueError('Unknown project')
    execution = document['execution_repository']['full_name']
    return {**copy.deepcopy(template), **copy.deepcopy(project),
            'source_repository': project['source_repository']['full_name'],
            'source_repository_id': project['source_repository']['id'],
            'execution_repository_id': document['execution_repository']['id'],
            'project_id': project_id, 'analysis_repository': execution,
            'publishing_repository': execution,
            'state_release': f'analysis-state-{project_id}',
            'report_release': f'analysis-current-{project_id}'}


def native_feedback_allowed(document: dict, project_id: str, report: dict) -> bool:
    validate(document)
    return False
