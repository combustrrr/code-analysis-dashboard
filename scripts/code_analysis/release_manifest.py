"""Atomic manifest pointers backed by immutable compressed Release assets."""
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
from scripts.code_analysis import github_service as github


def read(repository, release):
    body = json.loads(release['body'] or '{}')
    if body.get('schema_version') != 'analysis-manifest-pointer-v1':
        return body
    asset = body['asset']
    data = github.gh('api',f"repos/{repository}/releases/assets/{asset['id']}",'-H','Accept: application/octet-stream',binary=True)
    if len(data) != asset['bytes'] or hashlib.sha256(data).hexdigest() != asset['sha256']:
        raise ValueError('Stored manifest integrity mismatch')
    return json.loads(gzip.decompress(data))


def write(repository, release, state):
    data = gzip.compress(json.dumps(state,sort_keys=True,separators=(',',':')).encode(),mtime=0)
    if len(data)>5_000_000:
        raise ValueError('Project manifest exceeds delivery capacity; previous manifest retained')
    digest = hashlib.sha256(data).hexdigest()
    name = 'manifest-' + digest + '.json.gz'
    assets = github.pages(f"repos/{repository}/releases/{release['id']}/assets")
    asset = next((a for a in assets if a['name']==name),None)
    if asset is None:
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/name;path.write_bytes(data)
            github.gh('release','upload',release['tag_name'],str(path),'--repo',repository)
        assets = github.pages(f"repos/{repository}/releases/{release['id']}/assets")
        asset=next(a for a in assets if a['name']==name)
    pointer={'schema_version':'analysis-manifest-pointer-v1','asset':{'id':asset['id'],'name':name,'bytes':len(data),'sha256':digest}}
    github.save_state(repository,release,pointer)
    for previous in assets:
        if previous['name'].startswith('manifest-') and previous['name']!=name:
            github.api(f"repos/{repository}/releases/assets/{previous['id']}",method='DELETE')
