# Portable repository profiles

Execution and report storage stay in the owner-authorized execution repository.
A source can be that repository (connected) or another public repository (observer).
Observer sources are never modified and never receive native security uploads.

The profile is read from the exact trusted execution-default-branch revision.
`python_root` and `javascript_root` select source roots. Python static adapters
include Bandit, Ruff, Radon, Xenon and Vulture. CodeQL analyzes configured Python
and JavaScript/TypeScript without autobuild. The original product harness is not
used by portable projects.

The `commands` object configures ESLint, TypeScript, Pyright, coverage, Atheris and
Schemathesis. Each adapter has an `argv` argument array, optional `cwd`, optional
`install` arrays and an optional native `output` path. All paths stay inside the
source checkout. Review commands in Repositories > Edit configuration, preview
the exact commit, then confirm. Installation and source code run with no vendor
credentials or write tokens.

```json
{
  "mode": "portable",
  "python_root": "packages/core",
  "javascript_root": "client",
  "commands": {
    "coverage": {
      "argv": ["python", "-m", "coverage", "run", "--source=packages/core", "-m", "unittest", "discover", "-s", "tests"]
    },
    "eslint": {
      "cwd": "client",
      "install": [["npm", "ci", "--ignore-scripts"]],
      "argv": ["npx", "--no-install", "eslint", "src", "--format", "json", "--output-file", "eslint-results.json"]
    },
    "typescript": {
      "cwd": "client",
      "install": [["npm", "ci", "--ignore-scripts"]],
      "argv": ["npx", "--no-install", "tsc", "--noEmit", "--pretty", "false"]
    }
  }
}
```

Coverage exports native JSON after the test command and retains the test exit
code separately. TypeScript and Pyright retain standard output. ESLint requires
its native JSON file. Atheris requires a repository-specific bounded harness;
Schemathesis requires a reviewed invocation/harness retaining fuzzing-results.xml.
Every command has a 15-minute timeout and jobs are bounded. Missing commands,
missing reports and execution errors remain explicit, never clean zero findings.
Vendor entitlement and application-specific image/API setup are separate concerns.

Activity tracks the client request, resolved SHA, exact producer run and attempt,
then publication. Source head changes cannot make an old request claim a new SHA.
The scheduler retains at most 100 small request receipts per project. Reports
remain current-only. Superseded assets have a ten-minute cleanup grace period for
cached readers; deletion happens only after the new manifest is committed.

Validation must distinguish adapter coverage from universal language support:
CodeQL portability currently covers Python and JavaScript/TypeScript. A second
read-only source proves another layout; it does not prove a second App installation.

Current instance: only service-self and the read-only Kavach upstream/product fork
are monitored. The alternate layout was a historical test and is no longer active.
New previews use the adopted service tooling pin; do not copy a historical pin
without checking the execution profile. See [handoff](HANDOFF.md).
