"""Run the reviewed axe/Playwright WCAG check against the anonymous dashboard shell."""
import argparse
import json
import os
import subprocess
from pathlib import Path


def run(command: list[str], cwd: Path, env: dict[str, str] | None = None, timeout: int = 900) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, env=env, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, timeout=timeout, check=False)


p = argparse.ArgumentParser()
p.add_argument('--request', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--source', type=Path, required=True)
a = p.parse_args()
target = json.loads(a.request.read_text(encoding='utf-8'))['target']
ui = (a.source / 'analysis-ui').resolve()
if not ui.is_relative_to(a.source.resolve()) or not (ui / 'package-lock.json').is_file():
    raise ValueError('Reviewed analysis-ui project is unavailable')

install = run(['npm', 'ci', '--ignore-scripts'], ui)
browser = run(['npx', '--no-install', 'playwright', 'install', 'chromium'], ui) if install.returncode == 0 else install
env = {**os.environ, 'TEST_DASHBOARD_ACCESS': '1', 'CI': 'true'}
audit = run(['npx', '--no-install', 'playwright', 'test', 'tests/dashboard-access.spec.ts',
             '--grep', 'public landing remains accessible', '--reporter=json'], ui, env) if browser.returncode == 0 else browser
operational_failure = install.returncode != 0 or browser.returncode != 0
findings = [] if audit.returncode == 0 or operational_failure else [{
    'rule_id': 'axe-wcag-2.1-aa',
    'message': 'The reviewed axe browser check reported an accessibility violation or could not complete.',
    'severity': 'MEDIUM',
    'file': 'analysis-ui',
    'start_line': 0,
    'native_result_id': 'axe-browser-audit',
}]
result = {
    'source_repository': target['source_repository'],
    'source_sha': target['head_sha'],
    'status': 'OPERATIONAL_FAILURE' if operational_failure else ('COMPLETED' if not findings else 'POLICY_FINDINGS'),
    'reason': ('The reviewed browser runtime could not be prepared.' if operational_failure else
               ('' if not findings else 'The axe WCAG 2.1 AA browser gate needs attention.')),
    'findings': findings,
}
a.output.write_text(json.dumps(result, separators=(',', ':')), encoding='utf-8')
