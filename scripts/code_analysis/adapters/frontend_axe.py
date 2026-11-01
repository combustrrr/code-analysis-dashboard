"""Run a browser accessibility audit for the reviewed project frontend."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import frontend_common as browser

a, target, ui, project_profile = browser.request('Run the reviewed axe accessibility audit')
prepared = browser.install(ui, project_profile)
built = browser.run(browser.command(project_profile, 'frontend_build_command'), ui, 1200) if prepared.returncode == 0 else prepared
audit = built
preview = None
if built.returncode == 0:
    try:
        preview = browser.start_preview(ui, project_profile)
        audit = browser.run(['npx', '--yes', '@axe-core/cli@4.11.0',
                             project_profile['frontend_preview_url'], '--exit'], ui, 600)
    finally:
        if preview is not None:
            browser.stop_preview(preview)
operational = prepared.returncode != 0 or built.returncode != 0
findings = [] if audit.returncode == 0 or operational else [{
    'rule_id': 'axe-wcag-2.1-aa',
    'message': 'The reviewed frontend has accessibility findings in the automated browser audit.',
    'severity': 'MEDIUM',
    'file': str(ui.relative_to(a.source)) + '/package.json',
    'start_line': 1,
    'native_result_id': 'axe-browser-audit',
}]
browser.write_result(a.output, target,
                     'OPERATIONAL_FAILURE' if operational else ('COMPLETED' if not findings else 'POLICY_FINDINGS'),
                     'The reviewed frontend could not be prepared for accessibility testing.' if operational else
                     ('' if not findings else 'The axe WCAG browser gate needs attention.'), findings)
