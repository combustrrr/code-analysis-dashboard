# Code Analysis Dashboard Documentation

This directory uses a compatibility-preserving documentation architecture. The
root handoff files remain stable entry points for automation and existing links;
the index directories below classify the material by audience and lifecycle.

## Start Here

- [Current handoff](HANDOFF.md): deployed architecture, boundaries, evidence, and blockers.
- [Current documentation index](current/README.md): what is implemented now.
- [Architecture index](architecture/README.md): system boundaries and data flow.
- [Operations index](operations/README.md): deployment, access, maintenance, and free-tier controls.
- [Governance index](governance/README.md): repository onboarding, security policy, and acceptance gates.
- [Roadmap](roadmap/README.md): planned work and explicit non-goals.

## Documentation Rules

- Current behavior belongs in `current/`, `architecture/`, `operations/`, or `governance/`.
- Proposed work belongs in `roadmap/` and must be labeled planned.
- `HANDOFF.md` and `MIGRATION.md` remain stable root compatibility entry points.
- A document must identify its status when it describes behavior that is not deployed.
