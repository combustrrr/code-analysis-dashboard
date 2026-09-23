"""Atomic manifest backed by Cloudflare."""
import json
from scripts.code_analysis import github_service as github

def read(config, tag):
    try:
        data = github.cf_api(config, f'/api/report/{tag}.json')
        if not data:
            return {}
        return json.loads(data)
    except Exception:
        return {}

def write(config, tag, state):
    raw = json.dumps(state, separators=(',', ':')).encode()
    github.cf_api(config, f'/api/report/{tag}.json', method='POST', data=raw)

def expired_grace(asset, seconds=600):
    return False
