# Security Policy

## Supported version

Security fixes are applied to the current `main` branch and the production
deployment built from it. Historical revisions and archived scanner artifacts
are retained for provenance but are not supported release lines.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** option in the repository Security tab.
This creates a private vulnerability report for the maintainers. Do not include
credentials, detected secret values, personal data, or exploit details in a
public issue, discussion, pull request, workflow log, or dashboard report.

Include:

- the affected component and revision;
- reproduction steps or a minimal proof of concept;
- expected and observed behavior;
- likely impact and prerequisites; and
- any suggested mitigation.

You should receive an acknowledgement within seven days. Maintainers will
validate the report, agree on disclosure timing when applicable, and provide
status updates as material facts change. Scanner findings are observations, not
confirmation of exploitability; reports are assessed against reachable runtime
behavior and trust boundaries.

Please do not access data that is not yours, degrade the service, or publish a
vulnerability before maintainers have had a reasonable opportunity to respond.

## Security boundaries

The dashboard is an external, read-only analysis service. Scanner jobs operate
on immutable source snapshots and must not receive vendor or publication
credentials. Reports must preserve provenance and must never expose credential
values or detected secret values.

