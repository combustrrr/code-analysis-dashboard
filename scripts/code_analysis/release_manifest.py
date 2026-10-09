"""Atomic manifest backed by Cloudflare.

An absent manifest is a valid first-publication state.  An inability to read
the manifest is not: callers must stop before they can publish a state which
would discard the previously valid one.
"""
import json
from scripts.code_analysis import github_service as github

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
    raw = json.dumps(state, separators=(',', ':')).encode()
    github.cf_api(config, github.storage_path(config, 'report', f'{tag}.json'), method='POST', data=raw)

def expired_grace(asset, seconds=600):
    return False
