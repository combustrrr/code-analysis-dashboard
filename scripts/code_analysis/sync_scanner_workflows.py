"""Synchronize generated scanner workflows after dependency bot changes."""
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

import yaml


def sync_release_checksum(root: Path, relative_path: str, product: str, url_template: str, asset_template: str):
    pin_path = root / relative_path
    pin = json.loads(pin_path.read_text())
    version = pin['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError(f'Invalid {product} version')
    if pin['checksum_version'] != version:
        url = url_template.format(version=version)
        with urllib.request.urlopen(url, timeout=30) as response:
            checksums = response.read(1_000_001)
        if len(checksums) > 1_000_000:
            raise ValueError('Oversized release checksum file')
        asset = asset_template.format(version=version)
        pattern = rf'^([0-9a-f]{{64}})\s+\*?{re.escape(asset)}$'
        matches = re.findall(pattern, checksums.decode('utf-8'), flags=re.MULTILINE)
        if len(matches) != 1:
            raise ValueError('Missing or ambiguous official release checksum')
        pin.update(sha256=matches[0], checksum_version=version)
        pin_path.write_text(json.dumps(pin, indent=2) + '\n')


def workflow_actions(path: Path):
    document = yaml.safe_load(path.read_text(encoding='utf-8'))
    actions = {}
    for job in document['jobs'].values():
        for step in job.get('steps', []):
            action = step.get('uses', '')
            if '@' in action:
                name, digest = action.split('@', 1)
                if not re.fullmatch('[0-9a-f]{40}', digest):
                    raise ValueError('Action updates must remain immutable')
                if name in actions and actions[name] != action:
                    raise ValueError('Conflicting action revisions in source workflow')
                actions[name] = action
    return actions


def sync(root: Path):
    sync_release_checksum(
        root, '.ci/scorecard.json', 'Scorecard',
        'https://github.com/ossf/scorecard/releases/download/v{version}/scorecard_checksums.txt',
        'scorecard_{version}_linux_amd64.tar.gz')
    sync_release_checksum(
        root, '.ci/trufflehog.json', 'TruffleHog',
        'https://github.com/trufflesecurity/trufflehog/releases/download/v{version}/trufflehog_{version}_checksums.txt',
        'trufflehog_{version}_linux_amd64.tar.gz')
    actions = workflow_actions(root / 'config/code-analysis/workflow-templates/01-code-quality.yml')
    path = root / 'scripts/code_analysis/generate_source_workflow.py'
    content = path.read_text(encoding='utf-8')
    for constant, name in [('CHECKOUT', 'actions/checkout'), ('UPLOAD', 'actions/upload-artifact'), ('PYTHON', 'actions/setup-python')]:
        if name not in actions:
            # R2-backed workflows no longer invoke upload-artifact. Keep the
            # existing pinned constant for compatibility with the generator.
            continue
        content, count = re.subn(rf"^{constant} = '[^']+'$", f"{constant} = '{actions[name]}'", content, flags=re.MULTILINE)
        if count != 1:
            raise ValueError('Missing generator action constant')
    path.write_text(content, encoding='utf-8')
    security_actions = workflow_actions(root / 'config/code-analysis/workflow-templates/03-dependency-security.yml')
    osv = security_actions.get('google/osv-scanner-action/osv-scanner-action')
    if not osv:
        raise ValueError('Missing OSV action pin in dependency-security template')
    portable_path = root / 'scripts/code_analysis/portable_workflow.py'
    portable = portable_path.read_text(encoding='utf-8')
    portable, count = re.subn(r"^OSV_ACTION = '[^']+'$", f"OSV_ACTION = '{osv}'", portable, flags=re.MULTILINE)
    if count != 1:
        raise ValueError('Missing portable OSV action constant')
    portable_path.write_text(portable, encoding='utf-8')
    subprocess.run([sys.executable, '-m', 'scripts.code_analysis.generate_source_workflow'], cwd=root, check=True)
    subprocess.run([sys.executable, '-m', 'scripts.code_analysis.generate_reusable_workflows'], cwd=root, check=True)


if __name__ == '__main__':
    sync(Path(__file__).resolve().parents[2])
