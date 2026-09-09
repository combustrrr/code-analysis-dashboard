"""Load reviewed execution-repository settings into an isolated tooling checkout."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request
from urllib.parse import quote

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.code_analysis.projects import validate, service_config


def fetch(path):
    request = urllib.request.Request('https://api.github.com/' + path, headers={
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json',
        'User-Agent': 'code-analysis-project-loader'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def main():
    import base64
    root = Path(__file__).resolve().parents[2]
    actual = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != os.environ['TOOLING_SHA']:
        raise ValueError('Checked-out tooling does not match requested revision')
    execution = fetch('repos/' + os.environ['GITHUB_REPOSITORY'])
    blob = fetch(f"repos/{execution['full_name']}/contents/.github/code-analysis/projects.json?ref={quote(execution['default_branch'], safe='')}")
    document = validate(json.loads(base64.b64decode(blob['content'])))
    if document['execution_repository']['id'] != execution['id'] or document['tooling_sha'] != actual:
        raise ValueError('Execution repository or approved tooling identity mismatch')
    target = json.loads(os.environ['TARGET_JSON'])
    project_id = target['project_id']
    template = json.loads((root / 'config/code-analysis/service.json').read_text(encoding='utf-8-sig'))
    config = service_config(document, project_id, template)
    source = fetch('repos/' + config['source_repository'])
    if source['id'] != config['source_repository_id'] or source['private']:
        raise ValueError('Source repository identity or visibility changed')
    if target['repository'].lower() != source['full_name'].lower():
        raise ValueError('Selected target is outside the configured source')
    # The first reusable producer is deliberately portable. Never run the original
    # repository harness against a new project simply because Python is detected.
    expected = os.environ.get('EXPECTED_PROFILE', 'portable')
    if expected == 'portable' and config['profile'].get('mode') != 'portable':
        raise ValueError('This producer requires a portable profile')
    if expected == 'agentic-soc' and config['profile'] != template['profile']:
        raise ValueError('Configured commands require a matching reviewed scanner workflow adapter')
    (root / 'config/code-analysis/service.json').write_text(json.dumps(config), encoding='utf-8')


if __name__ == '__main__':
    main()
