# Route-wide Lighthouse audit

Audit date: 2026-10-30

The audit uses the exact production build with fixture-backed authenticated screens. Each canonical screen is measured three times with both Lighthouse desktop and mobile profiles. Values below are medians. Raw reports are written to `analysis-ui/.lighthouseci-routes/` and `analysis-ui/.lighthouseci-routes-mobile/`; these generated directories are intentionally ignored by Git.

Run:

```powershell
cd analysis-ui
npm run build:fixtures
npm run test:lighthouse:routes:desktop
npm run test:lighthouse:routes:mobile
```

## Baseline results

Scores are Performance / Accessibility / Best Practices / SEO. Timing values are milliseconds.

| Screen | Desktop scores | Desktop LCP / CLS / TBT | Mobile scores | Mobile LCP / CLS / TBT |
| --- | --- | --- | --- | --- |
| Landing | 100 / 100 / 100 / 91 | 340 / 0 / 0 | 100 / 100 / 100 / 91 | 1238 / 0 / 0 |
| Project register | 100 / 94 / 100 / 91 | 536 / 0 / 0 | 98 / 94 / 100 / 91 | 2215 / 0 / 0 |
| Project overview | 99 / 96 / 100 / 91 | 627 / 0.062 / 0 | 96 / 96 / 100 / 91 | 2600 / 0.024 / 6 |
| Issues list | 98 / 96 / 100 / 91 | 612 / 0.086 / 0 | 97 / 96 / 100 / 91 | 2426 / 0.024 / 2 |
| Issue detail | 99 / 96 / 100 / 91 | 618 / 0.062 / 0 | 96 / 91 / 100 / 91 | 2596 / 0.024 / 3 |
| Coverage | 99 / 96 / 100 / 91 | 621 / 0.062 / 0 | 97 / 96 / 100 / 91 | 2430 / 0.024 / 6 |
| Reports | 99 / 96 / 100 / 91 | 618 / 0.062 / 0 | 96 / 96 / 100 / 91 | 2594 / 0.024 / 1 |
| Run analysis | 92 / 100 / 100 / 91 | 648 / 0.178 / 0 | 96 / 100 / 100 / 91 | 2581 / 0.036 / 4 |
| Progress | 100 / 100 / 100 / 91 | 640 / 0.002 / 0 | 96 / 100 / 100 / 91 | 2614 / 0.006 / 0 |
| Settings overview | 100 / 100 / 100 / 91 | 650 / 0.005 / 0 | 96 / 100 / 96 / 91 | 2566 / 0.007 / 2 |
| Settings integrations | 100 / 100 / 100 / 91 | 642 / 0.008 / 0 | 96 / 100 / 100 / 91 | 2630 / 0.008 / 16 |
| Settings provenance | 100 / 100 / 100 / 91 | 644 / 0.005 / 0 | 95 / 100 / 100 / 91 | 2739 / 0.008 / 18 |

All 24 profile-screen combinations achieved Best Practices 100 except mobile Settings overview at 96. All routes scored SEO 91 because the production artifact does not currently provide a valid `robots.txt` response.

## Remediation verification

The production-preview rerun after remediation confirmed:

- Accessibility, Best Practices, and SEO are 100 on every desktop and mobile route.
- Run analysis desktop CLS fell from `0.178` to `0.000` in the final artifact.
- Mobile CLS is `0.000` on ten routes, `0.001` on Coverage, and `0.014` on Progress.
- The Issues DOM fell from approximately 20,977 elements to 993 by bounding searchable datalist suggestions while retaining the full in-memory option lookup.
- The compact `project-overview-v1` fixture is 17 KB; it replaces the 7 MB findings catalog as the initial Overview evidence document.
- A follow-up evidence-delivery pass added paged findings, direct finding locators, and a compact coverage projection. A corrected `390 x 844` mobile profile then ran every route three times. Representative runs scored Issues 94, deep-linked Issue Detail 93, Coverage 96, Overview 95, and Reports 95. Their transfers were approximately 265 KB, 311 KB, 228 KB, 233 KB, and 239 KB respectively. Accessibility, Best Practices, and SEO scored 100 on every route.
- Route-level axe checks now cover Overview, the fully hydrated Issues filters, Coverage, Reports, and the mobile Issue Detail dialog. The fixes remove conflicting picker accessible names, retain explicit dialog and progress names, preserve valid description-list grouping, and use theme-specific status colors that meet WCAG AA.

The fixes include a valid `robots.txt`, corrected ARIA roles and names, accessible action contrast, legible mobile Settings copy, metric-compatible font fallbacks, stable loading geometry, and bounded searchable suggestions.

These results measure a local production preview with deterministic fixture data. They do not substitute for a post-deployment Lighthouse run against GitHub Pages, where network and CDN behavior may differ.
