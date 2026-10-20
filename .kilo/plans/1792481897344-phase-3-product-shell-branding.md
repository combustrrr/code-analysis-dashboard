# Phase 3 — Production Shell, Branding, and Navigation

## Goal

Rebuild the frontend around one developer journey: choose a project, run analysis,
follow progress, review issues, and download the report. Keep the product name **Code
Analysis** and present **IIT Bombay Trust Lab × Mphasis** as the institutional
partnership. This file is the sole Phase 3 implementation source.

## Product shell and information architecture

- Replace every workspace header variant with one responsive top navigation: product
  identity and partnership at left, Projects and Activity in the center, and Settings,
  theme, and account controls at right. Mobile uses a drawer with the same destinations.
- Make Projects the signed-in landing page and combine configured projects with their
  active or queued work.
- Limit project navigation to Overview, Issues, and Report. Overview contains revision
  state, risk summary, and the single primary Run analysis action. Issues owns finding
  investigation. Report owns coverage, scanner outcomes, immutable report, and exports.
- Replace the large project metadata block with a persistent revision ribbon containing
  repository, selected ref, short SHA, freshness, and run state.
- Move service health, connections, readiness, workflow links, storage, execution host,
  registry detail, appearance, and full provenance into global Settings, organized as
  General, Projects, Connections & readiness, and Evidence provenance.
- Remove the dashboard page, project settings route, Readiness tab, duplicate provenance
  view, legacy hash normalization, and compatibility navigation.

## Visual and interaction design

- Default to dark mode with a complete light mode. Use Midnight `#08131F`, Slate
  `#122432`, Trust Blue `#5B7DD1`, Evidence Cyan `#42BFD0`, Mphasis Magenta `#D91668`,
  and Signal Amber `#D9A441` as the shared token system.
- Preserve official logo proportions and colors. The shell uses compact marks; full
  co-branding appears only on the landing page, report masthead, and General settings.
- Use a restrained serif for report/display titles, a legible sans serif for interface
  copy, and monospace only for SHAs, rules, and provenance.
- Constrain primary pages to a centered frame. Keep filters/detail panes bounded and
  sticky where useful. Avoid decorative gradients, excessive cards, ornamental project
  numbering, duplicated status copy, and unbounded lower-right page growth.
- Provide one Run analysis action per project. Opening, refreshing, filtering, and
  downloading never start a scan. Collapse secondary issue filters behind More filters.
- Preserve visible keyboard focus, reduced motion, responsive layouts, semantic heading
  order, non-color status meaning, and WCAG AA contrast.

## Routes and implementation boundaries

- Supported routes are `#/projects`, `#/activity`, `#/projects/:projectId`,
  `#/projects/:projectId/issues`, `#/projects/:projectId/report`,
  `#/projects/:projectId/run`, and
  `#/settings?section=<section>&project=<optional-id>`.
- Remove legacy route parsing rather than maintaining aliases.
- Split the monolithic UI into an application shell, project workspace, revision ribbon,
  activity view, and settings workspace. Consolidate brand/theme tokens for Ant Design,
  application CSS, landing pages, and report presentation.
- Preserve authentication, launcher, queue, report, scanner, export, immutable source,
  and deployment contracts. Do not change the Worker, workflows, or upstream sources.
- Update current UX and migration documentation with the new routes and ownership.

## Acceptance

- A signed-in developer lands on Projects and can reach a project, active request, issue,
  report, or download within two navigation decisions.
- Run analysis remains explicit and retains immutable-target confirmation and progress.
- Configuration and operations appear only in Settings, while SHA, freshness, coverage
  warnings, and incomplete evidence remain visible in normal developer work.
- Verify direct modern URLs, reload, Back/Forward, unknown routes, switching projects,
  issue deep links, active and failed runs, partial/no reports, and unavailable services.
- Verify desktop, tablet, and mobile layouts in both themes without horizontal drift,
  clipped controls, inaccessible sections, or uncontrolled page width.
- Run UI unit tests, production build, complete Playwright fixture/access suites, service
  tests, deployment tests, workflow audit, and launcher tests. Perform a visible browser
  walkthrough before deploying through Pages and then run the normal three-project FIFO
  production scan batch.

## Assumptions

Existing TrustLab and Mphasis assets are approved. Developers are primary; maintainer
information is secondary. Unrelated local files remain untouched. Modern routes replace
legacy routes outright.
