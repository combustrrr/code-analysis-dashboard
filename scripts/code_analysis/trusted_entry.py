"""Run a trusted service module without importing packages from the source tree."""
import re
import runpy
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root))
if len(sys.argv) < 2 or not re.fullmatch(r'[a-z][a-z0-9_]*', sys.argv[1]):
    raise SystemExit('A trusted service module name is required')
module = sys.argv.pop(1)
runpy.run_module('scripts.code_analysis.' + module, run_name='__main__')
