"""Run the reviewed Lighthouse landing performance and accessibility budgets."""
import argparse
import json
import subprocess
from pathlib import Path


def run(command: list[str], cwd: Path, timeout: int = 1200) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, text=True, stdout=subprocess.PIPE,
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
build = run(['npm', 'run', 'build'], ui) if install.returncode == 0 else install
audit = run(['npm', 'run', 'test:lighthouse'], ui) if build.returncode == 0 else build
operational_failure = install.returncode != 0 or build.returncode != 0
findings = [] if audit.returncode == 0 or operational_failure else [{
    'rule_id': 'lighthouse-production-budget',
    'message': 'The reviewed Lighthouse production budget failed for performance, accessibility, LCP, or CLS.',
    'severity': 'MEDIUM',
    'file': 'analysis-ui/lighthouserc.cjs',
    'start_line': 1,
    'native_result_id': 'lighthouse-production-budget',
}]
result = {
    'source_repository': target['source_repository'],
    'source_sha': target['head_sha'],
    'status': 'OPERATIONAL_FAILURE' if operational_failure else ('COMPLETED' if not findings else 'POLICY_FINDINGS'),
    'reason': ('The reviewed production UI could not be built.' if operational_failure else
               ('' if not findings else 'The Lighthouse production gate needs attention.')),
    'findings': findings,
}
a.output.write_text(json.dumps(result, separators=(',', ':')), encoding='utf-8')
