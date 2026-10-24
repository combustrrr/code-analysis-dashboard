"""Atomic manifest backed by Cloudflare.

An absent manifest is a valid first-publication state.  An inability to read
the manifest is not: callers must stop before they can publish a state which
would discard the previously valid one.
"""
import json
from scripts.code_analysis import github_service as github

CHANNEL_SUMMARY_FIELDS = {
    'channel', 'name', 'class', 'surface', 'status', 'observation_count',
    'reason', 'workflow', 'artifact_files', 'status_artifact',
    'evidence_source', 'scanner_version', 'test_exit_code',
    'coverage_exit_code', 'evidence_reused',
}


def bounded(state):
    """Remove finding-level data from manifest channel progress snapshots.

    Full findings remain in the separately sharded, integrity-addressed report
    assets. The current manifest is an index and polling document, so embedding
    findings or observation IDs here only duplicates data and can exceed the
    Worker's request limit.
    """
    def visit(value, parent=''):
        if isinstance(value, dict):
            return {key: visit(item, key) for key, item in value.items()}
        if isinstance(value, list):
            if parent in {'channel_statuses', 'attempt_channel_statuses'}:
                return [{key: visit(item[key], key) for key in CHANNEL_SUMMARY_FIELDS if key in item}
                        for item in value if isinstance(item, dict)]
            return [visit(item) for item in value]
        return value
    return visit(state)

def read(config, tag):
    data = github.read_storage(config, 'report', f'{tag}.json')
    # cf_api represents a GET 404 as an empty JSON object.  Keep that distinct
    # from transport/API errors, which must propagate and abort publication.
    if data == b'{}' or data == '{}':
        return {}
    if not data:
        raise ValueError('manifest response was empty')
    manifest = json.loads(data)
    if not isinstance(manifest, dict):
        raise ValueError('manifest response must be a JSON object')
    return manifest

def write(config, tag, state):
    raw = json.dumps(bounded(state), separators=(',', ':')).encode()
    github.cf_api(config, github.storage_path(config, 'report', f'{tag}.json'), method='POST', data=raw)

def expired_grace(asset, seconds=600):
    return False
