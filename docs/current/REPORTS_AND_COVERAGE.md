# Reports and Coverage

Status: **Current production UI contract**

The project workspace separates evidence review into two focused sections:

- **Issues** is the interactive investigation surface for searching, filtering, grouping,
  and opening retained findings and their source evidence.
- **Coverage** contains the status, finding count, and explicit evidence limitation for
  every requested scanner channel. Unknown or unavailable evidence is not presented as
  zero findings.
- **Reports** is an export center. It provides a direct complete issues PDF plus the
  immutable JSON and Markdown source artifacts. It does not repeat the interactive issue
  register or channel table.

The generated PDF includes every retained finding, source locations, scanner
attribution, remediation guidance, coverage limitations, and immutable report
provenance. Opening these sections or downloading an artifact is read-only and never
submits analysis, modifies a configured source repository, or publishes source feedback.
## Current workspace contract

The project analyst loading sequence, `project-overview-v1`, and sanitized collaborator audit ZIP are documented in [PROJECT_ANALYST_WORKSPACE.md](PROJECT_ANALYST_WORKSPACE.md). Audit ZIPs are prebuilt during publication and remain in private R2; the Worker never assembles them on demand or exposes a browser-supplied object key.
