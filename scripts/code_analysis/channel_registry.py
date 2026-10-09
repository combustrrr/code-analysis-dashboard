"""Unified channel registry: load, validate, and provide access to all channel descriptors."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / 'config/code-analysis/channel-descriptor.schema.json'
REQUIRED_CHANNELS = ROOT / 'config/code-analysis/required-channels.json'
TOOL_CATALOG = ROOT / 'config/code-analysis/proposal-tool-catalog.json'
SERVICE_CONFIG = ROOT / 'config/code-analysis/service.json'

CLASSES = {'code', 'security', 'dependencies', 'infrastructure', 'reliability'}
EVIDENCE_SOURCES = {'DETERMINISTIC', 'AI_ADVISORY'}
MODES = {'source', 'vendor'}


def _validate(descriptor):
    required = ('channel', 'tool', 'class', 'surface', 'evidence_source')
    for key in required:
        if key not in descriptor or not str(descriptor.get(key, '')).strip():
            raise ValueError(f'channel descriptor missing required key: {key}')
    if descriptor['class'] not in CLASSES:
        raise ValueError(f"unknown channel class: {descriptor['class']}")
    if descriptor['evidence_source'] not in EVIDENCE_SOURCES:
        raise ValueError(f"unknown evidence source: {descriptor['evidence_source']}")
    if 'mode' in descriptor and descriptor['mode'] not in MODES:
        raise ValueError(f"unknown mode: {descriptor['mode']}")
    return descriptor


def _normalize_builtin(row, source):
    descriptor = {
        'channel': row['channel'],
        'tool': row.get('tool', row['channel']),
        'class': row.get('class', 'security'),
        'surface': row.get('surface', row.get('channel', 'repository')),
        'workflow': row.get('workflow', source),
        'evidence_source': row.get('evidence_source', 'DETERMINISTIC'),
        'scanner_family': row.get('scanner_family') or row.get('tool') or row['channel'],
        'activation': row.get('activation', ''),
        'note': row.get('note', ''),
    }
    if row.get('artifact_patterns'):
        descriptor['artifact_patterns'] = row['artifact_patterns']
    return descriptor


def _load_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def _validate_schema(descriptor, require_all=True):
    schema = _load_json(SCHEMA_PATH)
    required = schema.get('required', []) if require_all else [key for key in schema.get('required', []) if key != 'workflow']
    missing = [key for key in required if key not in descriptor]
    if missing:
        raise ValueError(f'channel descriptor missing schema key(s): {", ".join(missing)}')
    properties = schema.get('properties', {})
    unknown = sorted(set(descriptor) - set(properties))
    if schema.get('additionalProperties') is False and unknown:
        raise ValueError(f'channel descriptor has unknown key(s): {", ".join(unknown)}')
    for key, rules in properties.items():
        if key not in descriptor:
            continue
        value = descriptor[key]
        kind = rules.get('type')
        valid = {'string': isinstance(value, str), 'object': isinstance(value, dict),
                 'array': isinstance(value, list), 'boolean': isinstance(value, bool),
                 'integer': isinstance(value, int) and not isinstance(value, bool)}.get(kind, True)
        if not valid:
            raise ValueError(f'channel descriptor field {key} has invalid type')
        if 'enum' in rules and value not in rules['enum']:
            raise ValueError(f'channel descriptor field {key} has invalid value')
        if isinstance(value, str):
            if len(value) < rules.get('minLength', 0) or len(value) > rules.get('maxLength', float('inf')):
                raise ValueError(f'channel descriptor field {key} has invalid length')
            if 'pattern' in rules and __import__('re').fullmatch(rules['pattern'], value) is None:
                raise ValueError(f'channel descriptor field {key} has invalid format')
        if isinstance(value, list) and len(value) < rules.get('minItems', 0):
            raise ValueError(f'channel descriptor field {key} has too few items')
    return descriptor


def load_channels():
    descriptors = []
    required = _load_json(REQUIRED_CHANNELS)
    for row in required.get('required_static_channels', []):
        descriptors.append(_validate(_normalize_builtin(row, 'required-channels.json')))
    for row in required.get('required_dynamic_channels', []):
        descriptors.append(_validate(_normalize_builtin(row, 'required-channels.json')))
    catalog = _load_json(TOOL_CATALOG)
    for row in catalog.get('tools', []):
        descriptor = _normalize_builtin(row, 'proposal-tool-catalog.json')
        descriptor['surface'] = row.get('surface', row.get('class', 'repository'))
        descriptors.append(_validate(descriptor))
    service = _load_json(SERVICE_CONFIG)
    for row in service.get('scanner_extensions', []):
        descriptor = {
            'channel': row['channel'],
            'tool': row.get('name', row['channel']),
            'class': row.get('class', 'security'),
            'surface': row.get('surface', row['channel']),
            'workflow': row.get('workflow', '11-source-analysis.yml'),
            'evidence_source': row.get('evidence_source', 'DETERMINISTIC'),
            'mode': row.get('mode', 'vendor'),
            'adapter': row.get('adapter', ''),
            'timeout_minutes': row.get('timeout_minutes', 15),
            'sensitive': row.get('sensitive', False),
        }
        descriptors.append(_validate(descriptor))
    return [_validate_schema(row) for row in descriptors]


def get_channel(name):
    return next((row for row in load_channels() if row['channel'] == name), None)


def channels_by_class():
    grouped = {}
    for row in load_channels():
        grouped.setdefault(row['class'], []).append(row)
    return grouped


def validate_descriptor(descriptor):
    return _validate_schema(_validate(dict(descriptor)), require_all=False)


if __name__ == '__main__':
    for row in load_channels():
        print(row['channel'], row['class'], row['evidence_source'])
