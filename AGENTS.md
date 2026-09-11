# Code Analysis Dashboard contributor instructions

This repository owns the external code-analysis service. Read docs/HANDOFF.md, README.md and
docs/MIGRATION.md before changing deployment wiring.

- Append Journal.md at session start/end and meaningful milestones.
- Do not copy product backend/webui runtime files here. Check out the configured
  source at its immutable SHA in isolated scanner jobs.
- Preserve exact source, target, workflow run, attempt, and tooling provenance.
- Never expose credentials or detected secret values in public reports or logs.
- Source-executing jobs must not have vendor or publication credentials.
- Keep incomplete scanner evidence explicit; preserve healthy sibling reports.
- Generate workflows 11 and 12 using generate_source_workflow.py.
- Run service tests, workflow audit, launcher tests, and relevant UI checks.
- Verify cutover prerequisites before retiring the active analysis host.
- Changes to the upstream/source repository require separate authorization.
