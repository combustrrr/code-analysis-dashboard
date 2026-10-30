"""Run deterministic Lighthouse budgets against the reviewed project frontend."""
import argparse
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frontend_common import command, frontend, install, run, start_preview, stop_preview, write_result

p = argparse.ArgumentParser()
p.add_argument('--request', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--source', type=Path, required=True)
a = p.parse_args()
target = json.loads(a.request.read_text(encoding='utf-8'))['target']
ui, project_profile = frontend(a.source, target['project_id'])
prepared = install(ui, project_profile)
built = run(command(project_profile, 'frontend_build_command'), ui, 1200) if prepared.returncode == 0 else prepared
audit = built
report = None
preview = None
with tempfile.TemporaryDirectory() as directory:
    output = Path(directory) / 'lighthouse.json'
    if built.returncode == 0:
        try:
            preview = start_preview(ui, project_profile)
            audit = run(['npx', '--yes', 'lighthouse@13.0.1', project_profile['frontend_preview_url'],
                         '--quiet', '--chrome-flags=--headless --no-sandbox', '--output=json',
                         f'--output-path={output}'], ui, 900)
            if output.is_file():
                report = json.loads(output.read_text(encoding='utf-8'))
        finally:
            if preview is not None:
                stop_preview(preview)
operational = prepared.returncode != 0 or built.returncode != 0 or report is None
budgets = project_profile.get('frontend_lighthouse_budgets', {})
failures = []
if report is not None:
    categories, audits = report.get('categories', {}), report.get('audits', {})
    measurements = {
        'performance': categories.get('performance', {}).get('score'),
        'accessibility': categories.get('accessibility', {}).get('score'),
        'lcp_ms': audits.get('largest-contentful-paint', {}).get('numericValue'),
        'cls': audits.get('cumulative-layout-shift', {}).get('numericValue'),
    }
    for key in ('performance', 'accessibility'):
        if not isinstance(measurements[key], (int, float)) or measurements[key] < budgets.get(key, 0.9):
            failures.append(key)
    for key in ('lcp_ms', 'cls'):
        limit = budgets.get(key, 2500 if key == 'lcp_ms' else 0.1)
        if not isinstance(measurements[key], (int, float)) or measurements[key] > limit:
            failures.append(key)
findings = [] if operational or not failures else [{
    'rule_id': 'lighthouse-production-budget',
    'message': 'The reviewed frontend missed Lighthouse budgets for: ' + ', '.join(failures) + '.',
    'severity': 'MEDIUM',
    'file': str(ui.relative_to(a.source)) + '/package.json',
    'start_line': 1,
    'native_result_id': 'lighthouse-production-budget',
}]
write_result(a.output, target,
             'OPERATIONAL_FAILURE' if operational else ('COMPLETED' if not findings else 'POLICY_FINDINGS'),
             'The reviewed frontend could not be audited by Lighthouse.' if operational else
             ('' if not findings else 'The Lighthouse production gate needs attention.'), findings)
