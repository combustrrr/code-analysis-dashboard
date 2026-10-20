# Page dependency trees

## Public landing `/`
Entry: `analysis-ui/src/LandingPage.tsx`
- `analysis-ui/src/landing.css`
- `analysis-ui/src/Appearance.tsx`
- `analysis-ui/src/brand.ts`
- `analysis-ui/src/useLaunchAuth.ts`
- `analysis-ui/src/assets/trustlab-logo.jpg`
- `analysis-ui/src/assets/mphasis-logo.jpg`

## Projects `#/projects`
Entry: `analysis-ui/src/Repositories.tsx`
- `analysis-ui/src/AppShell.tsx`
  - `analysis-ui/src/Appearance.tsx`
  - `analysis-ui/src/appRoutes.ts`
  - `analysis-ui/src/assets/trustlab-logo.jpg`
  - `analysis-ui/src/assets/mphasis-logo.jpg`
- `analysis-ui/src/workspace.css`
- `analysis-ui/src/brand.ts`
- `analysis-ui/src/useLaunchAuth.ts`

## Project overview `#/projects/:id/overview`
Entry: `analysis-ui/src/main.tsx` project render branch
- `analysis-ui/src/AppShell.tsx`
- `analysis-ui/src/RevisionRibbon.tsx`
- `analysis-ui/src/FastPathRunAction.tsx`
- `analysis-ui/src/ProjectRunTracker.tsx`
- `analysis-ui/src/Repositories.tsx`
- `analysis-ui/src/workspace.css`
- `analysis-ui/src/style.css`

## Issues `#/projects/:id/issues`
Entry: `analysis-ui/src/main.tsx` findings branch
- `analysis-ui/src/AppShell.tsx`
- `analysis-ui/src/RevisionRibbon.tsx`
- `analysis-ui/src/style.css`
- `analysis-ui/src/workspace.css`

## Report `#/projects/:id/report`
Entry: `analysis-ui/src/main.tsx` report branch
- `analysis-ui/src/ThreatReport.tsx`
- `analysis-ui/src/ThreatReportPdf.ts`
- `analysis-ui/src/RevisionRibbon.tsx`
- `analysis-ui/src/AppShell.tsx`
- `analysis-ui/src/style.css`
- `analysis-ui/src/workspace.css`

## Settings `#/settings/*`
Entry: `analysis-ui/src/Settings.tsx`
- `analysis-ui/src/AppShell.tsx`
- `analysis-ui/src/Appearance.tsx`
- `analysis-ui/src/Repositories.tsx`
- `analysis-ui/src/workspace.css`
