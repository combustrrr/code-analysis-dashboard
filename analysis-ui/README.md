# Analysis Dashboard UI

Static React/Ant Design application deployed to GitHub Pages.

| Area | Location |
|---|---|
| Application entrypoint | `src/main.tsx` |
| Launch flow | `src/ProjectLauncher.tsx`, `src/AnalysisLauncher.tsx` |
| Repository onboarding | `src/Repositories.tsx` |
| Integration checks | `src/Integration.tsx` |
| Shared styling | `src/style.css` |
| Build | `npm run build` |
| Browser tests | `npm test` |

The UI contains no report data. It retrieves current manifests/assets through the
Worker and must preserve exact source, target, request, and publication provenance.
The dashboard includes a **Threat Report** view for newly published analyses. It
summarizes severity/category coverage and deterministic catalog guidance, then links
back to Issues for scanner evidence. Reports can be copied as authenticated private
links, downloaded as JSON or Markdown, or printed to PDF. Older reports may show an
explicit non-immutable legacy-runtime warning.

## Local browser fixtures

`public/data/` is an ignored, local-only fixture dataset used by `npm test`. The
Playwright server builds with the explicit `fixtures` mode; `npm run build` and the
Pages workflow use the normal/repository mode, where Vite disables `public/` copying
and no report fixtures enter `dist/`. Keep the retained fixture evidence available for
browser tests, but remove generated `dist/` and `test-results/` directories when they
are no longer needed. CI security scans run from Git-tracked checkouts, so these
ignored local fixtures are not part of production or security packaging.