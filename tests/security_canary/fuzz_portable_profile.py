"""Bounded profile-parser fuzzing against the selected source checkout."""
import json
import sys
from pathlib import Path
import atheris
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
with atheris.instrument_imports():
    from scripts.code_analysis.portable_profile import validate

def test_one_input(data):
    value=atheris.FuzzedDataProvider(data).ConsumeUnicodeNoSurrogates(256)
    profile={'mode':'portable','python_root':value}
    try:validate(profile)
    except ValueError:pass

atheris.Setup(sys.argv,test_one_input)
atheris.Fuzz()
