# Contributing

Thank you for helping improve the Code Analysis Dashboard.

## Before opening a change

1. Search existing issues and pull requests.
2. Use an issue form for bugs or feature proposals.
3. For vulnerabilities, follow [SECURITY.md](SECURITY.md) and do not open a
   public issue.
4. Keep changes within this service repository. Changes to an analyzed source
   repository require separate authorization.

## Development setup

Read [README.md](README.md),
[docs/architecture/SYSTEM_OVERVIEW.md](docs/architecture/SYSTEM_OVERVIEW.md), and
[docs/MIGRATION.md](docs/MIGRATION.md) before changing deployment wiring.

Install the Python and UI dependencies as described in the root README. Do not
commit credentials, scanner output containing detected secret values, generated
build directories, or local environment files.

## Required verification

Run checks relevant to the change. For changes that affect shared scanner or
deployment behavior, run the complete baseline:

```shell
python -m pip install -r .ci/requirements.txt
python -m unittest discover -s scripts/code_analysis -p "test_*.py"
python -m pytest scripts/deployment -v
python -m scripts.code_analysis.audit_workflows
node --test analysis-launcher/worker.test.mjs
cd analysis-ui
npm ci --ignore-scripts
npm run test:unit
npm run build
```

Generate workflows 11 and 12 with
`python -m scripts.code_analysis.generate_source_workflow` whenever their
templates or generation logic changes. Commit generated output with its source.

## Pull requests

- Keep the scope focused and explain the user-visible outcome.
- Include tests and documentation for changed behavior.
- Preserve exact source, target, run, attempt, and tooling provenance.
- Keep incomplete scanner evidence explicit and retain healthy sibling reports.
- Never give source-executing jobs vendor or publication credentials.
- Complete the pull-request template and disclose known limitations.

By contributing, you confirm that you have the right to submit the contribution
under the repository's applicable terms. This repository currently has no
declared open-source license; contribution does not itself grant additional
rights to reuse the project.

