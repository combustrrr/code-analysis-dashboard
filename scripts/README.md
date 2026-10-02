# Analysis Service Scripts

Python implementation for discovery, scanner execution, normalization, provenance,
publication, workflow generation, and verification.

`code_analysis/` intentionally keeps stable top-level compatibility entry points
because GitHub Actions and trusted profiles invoke these paths directly. The logical
layers are documented in `code_analysis/README.md` and `config/code-analysis/service-layout.json`;
do not physically move a script without updating every workflow, profile, test, and
immutable source reference in the same change.

Use the package modules from the repository root. Generated workflows 11 and 12 must
be produced by `generate_source_workflow.py`, not edited manually.
