# Code Analysis Dashboard documentation

This documentation is organized by purpose so deployed behavior, architectural
reasoning, operator procedures, and future plans do not get mixed together.

## Start here

| You need to | Read |
|---|---|
| Understand the complete system | [System architecture](architecture/SYSTEM_OVERVIEW.md) |
| Learn why major choices were made | [Architecture decisions](decisions/README.md) |
| Use the deployed product | [Product reference](current/README.md) |
| Operate or recover the service | [Operations](operations/README.md) |
| Understand repository and security policy | [Governance](governance/README.md) |
| Change deployment or storage wiring | [Migration boundaries](MIGRATION.md) |
| Review proposed future work | [Roadmap](roadmap/README.md) |

## Documentation map

```text
docs/
|-- architecture/   Stable structure, boundaries, data flow, and integrations
|-- decisions/      Append-only architecture decision records (ADRs)
|-- current/        Focused reference guides for deployed product behavior
|-- operations/     Runbooks for access, deployment, recovery, and maintenance
|-- governance/     Contribution, documentation, security, and acceptance policy
|-- roadmap/        Proposed work and explicit non-goals
`-- MIGRATION.md    Deployment boundaries and cutover constraints
```

## Authority and lifecycle

- Architecture explains stable responsibilities; it does not record every release.
- ADRs explain why consequential choices were accepted and are superseded, not rewritten.
- Product references describe deployed behavior only.
- Runbooks include prerequisites, safe actions, expected results, rollback, and verification.
- Production readiness records acceptance evidence and known limitations.
- Roadmap items are proposals and are never proof of availability.
- Deployment evidence belongs in its change or release record, not in product documentation.

See [documentation governance](governance/DOCUMENTATION.md) for ownership, metadata,
review triggers, naming rules, and the ADR process.
