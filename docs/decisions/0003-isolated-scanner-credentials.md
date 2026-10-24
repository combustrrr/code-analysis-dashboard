# ADR-0003: Separate source execution, vendor access, and publication authority

- Status: Accepted
- Date: 2026-10-16
- Decision owners: service maintainers
- Related: [Data handling inventory](../architecture/DATA_HANDLING_INVENTORY.md), [secret management](../operations/SECRET-MANAGEMENT.md)

## Context

Scanner jobs may execute source-controlled commands. Giving those jobs vendor or
publication credentials would allow analyzed code to cross a critical trust boundary.

## Decision

Source-executing jobs receive read-only source access and no vendor or publication
credentials. Vendor jobs consume a credentialless packaged snapshot and receive only
their vendor-specific secret. Trusted publication is a separate job that reads bounded
producer artifacts and never executes source-controlled commands.

## Consequences

- Compromised source execution cannot directly publish or use vendor credentials.
- Vendor scans require an additional snapshot preparation boundary.
- Publication must validate artifact identity, size, schema, and provenance.
- Workflows contain more jobs, but each job has a smaller and auditable authority set.

