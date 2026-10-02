# Analysis Configuration

Machine-readable contracts for profiles, channels, scanner extensions, report
publication, and generated workflow inputs.

| Contract | File |
|---|---|
| Service profile | `service.json` |
| Current required channels | `required-channels.json` |
| Scanner catalog | `proposal-tool-catalog.json` |
| Extension contract | `scanner-extension.example.json` |
| Repository profile example | `repository-profile.example.json` |
| Portable profile example | `portable-profile.example.json` |
| File ownership/layout | `service-layout.json` |

Change configuration together with its consumers and tests. Do not store credentials
or detected secret values in this directory.
