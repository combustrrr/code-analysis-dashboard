# Analysis Dashboard UI

Static React/Ant Design application deployed to GitHub Pages.

| Area | Location |
|---|---|
| Application entrypoint | `src/main.tsx` |
| Application shell | `src/AppShell.tsx` |
| Modern route contract | `src/appRoutes.ts` |
| Brand and theme tokens | `src/brand.ts` |
| Fixed target selection | `src/Repositories.tsx` |
| Explicit launch flow | `src/ProjectLauncher.tsx` |
| Integration checks | `src/Integration.tsx` |
| Shared styling | `src/style.css` |
| Build | `npm run build` |
| Browser tests | `npm test` |

The UI contains no report data. It retrieves current manifests/assets through the
Worker and must preserve exact source, target, request, and publication provenance.
The authenticated project list comes from the fixed execution-host registry. Selecting
a configured target only opens its report; the separate launch action is shown only
when the signed-in user is an authorized execution-host collaborator. The dashboard has no arbitrary
repository picker, per-user App installation, or setup-commit workflow.

Signed-in users land on Projects and follow one workflow: review current evidence,
start analysis when authorized, inspect progress in the project, review Issues, and
download from Report. Activity has no route or navigation entry. Each project has only
Overview, Issues, and Report navigation. The persistent evidence rail keeps repository,
immutable revision, scanner coverage, publication time, and run state visible.
Operational detail is consolidated in global Settings. The shell is branded **Code Analysis** with the endorsement
**IIT Bombay Trust Lab × Mphasis**; dark mode is the default and light mode is fully
supported from the shared token source. Manrope is bundled for interface copy, Sora for product headings,
and IBM Plex Mono is reserved for SHAs, branches, rules, and run identifiers.
The dashboard includes a **Threat Report** view for newly published analyses. It
summarizes severity/category coverage and deterministic catalog guidance, then links
back to Issues for scanner evidence. Reports can be copied as authenticated private
links, downloaded as JSON or Markdown, or exported as a generated PDF. Complete PDF
export ignores review filters; filtered PDF export freezes the active filters. Large PDF
exports are packaged as deterministic volumes in one ZIP. Reports are loaded only from
the current immutable publication contract.

## Local browser fixtures

`public/data/` is an ignored, local-only fixture dataset used by `npm test`. The
Playwright server builds with the explicit `fixtures` mode; `npm run build` and the
Pages workflow use the normal/repository mode, where Vite disables `public/` copying
and no report fixtures enter `dist/`. Keep the retained fixture evidence available for
browser tests, but remove generated `dist/` and `test-results/` directories when they
are no longer needed. CI security scans run from Git-tracked checkouts, so these
ignored local fixtures are not part of production or security packaging.
