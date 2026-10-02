# Repository Layout

```text
.
├── analysis-launcher/       Cloudflare Worker and API tests
├── analysis-ui/             React dashboard and browser tests
├── config/code-analysis/    Service contracts and profiles
├── docs/                    Current architecture, operations, governance, roadmap
├── scripts/code_analysis/   Python analysis service and compatibility entrypoints
├── tests/security_canary/   Isolated scanner fixtures and fuzzers
├── .github/workflows/       Scanner, orchestration, compatibility, and Pages workflows
├── .ci/                     Shared CI requirements and security configuration
└── AGENTS.md                Repository safety and deployment instructions
```

## Dependency Direction

```text
scanner/GitHub adapters -> application -> domain
presentation            -> application contracts
infrastructure          -> application/publication ports
analysis-ui             -> Worker API
Worker                  -> GitHub API, KV, R2
```

The repository deliberately retains workflow-facing Python paths under
`scripts/code_analysis/`. They are compatibility entry points, not evidence of a
missing package structure. Moving them requires a coordinated workflow/profile/test
migration and immutable tooling update.
