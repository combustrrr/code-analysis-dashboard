# Community health configuration

The repository keeps its GitHub community-health files in the root and
`.github/` so GitHub can discover them on the default branch.

- `CODE_OF_CONDUCT.md` defines participation expectations and enforcement.
- `CONTRIBUTING.md` describes repository boundaries and required verification.
- `SECURITY.md` routes vulnerability reports to GitHub private reporting.
- `ACCESSIBILITY.md` records supported environments and known limitations.
- `.github/ISSUE_TEMPLATE/` provides bug, feature, and accessibility forms.
- `.github/pull_request_template.md` requires verification, provenance, and
  credential-boundary checks.

Blank issues are disabled. Vulnerabilities must use private reporting, and
public forms remind reporters not to include credentials, detected secret
values, or private report data.

`.github/dependabot.yml` enables weekly grouped npm version updates for
`analysis-ui/`. Scanner and workflow dependency pins remain under the existing
Renovate compatibility process documented in
[scanner maintenance](../operations/SCANNER-MAINTENANCE.md).

The repository does not currently declare an open-source license. Selecting a
license is an owner decision because it changes downstream rights; add a
recognized `LICENSE` file only after that decision is explicit.
