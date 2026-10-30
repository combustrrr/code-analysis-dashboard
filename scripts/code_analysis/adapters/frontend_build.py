"""Verify the reviewed production frontend build at the selected source revision."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from frontend_common import command, frontend, install, run, write_result

p = argparse.ArgumentParser();p.add_argument('--request', type=Path, required=True);p.add_argument('--output', type=Path, required=True);p.add_argument('--source', type=Path, required=True);a = p.parse_args()
target = json.loads(a.request.read_text(encoding='utf-8'))['target']
ui, profile = frontend(a.source, target['project_id'])
prepared = install(ui, profile)
built = run(command(profile, 'frontend_build_command'), ui, 1200) if prepared.returncode == 0 else prepared
operational = prepared.returncode != 0
findings = [] if built.returncode == 0 or operational else [{'rule_id':'frontend-production-build','message':'The reviewed production frontend build failed.','severity':'HIGH','file':str(ui.relative_to(a.source))+'/package.json','start_line':1,'native_result_id':'frontend-production-build'}]
write_result(a.output, target, 'OPERATIONAL_FAILURE' if operational else ('COMPLETED' if not findings else 'POLICY_FINDINGS'), 'Frontend dependencies could not be prepared.' if operational else ('' if not findings else 'The production frontend build needs attention.'), findings)
