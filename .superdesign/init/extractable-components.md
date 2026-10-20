# Extractable components

## AppShell
- Source: `analysis-ui/src/AppShell.tsx`
- Category: layout
- Description: Authenticated product header, workspace context, account actions, mobile navigation, and institutional lockup.
- Extractable props: active (string, default `projects`), userLogin (string), signedIn (boolean), mobileOpen (boolean).
- Hardcoded: Code Analysis identity, project-register label, settings label, scanner mark, Trust Lab and Mphasis logo positions.

## AppearanceToggle
- Source: `analysis-ui/src/Appearance.tsx`
- Category: basic
- Description: Dark/light segmented control.
- Extractable props: appearance (`dark` or `light`).
- Hardcoded: Dark and Light labels.

## EvidenceRail
- Source: `analysis-ui/src/Repositories.tsx`
- Category: basic
- Description: Repository → revision → coverage → publication provenance strip.
- Extractable props: repository, revision, coverage, publishedAt.
- Hardcoded: field labels and connector treatment.

## ProjectRecord
- Source: `analysis-ui/src/Repositories.tsx`
- Category: basic
- Description: Project evidence card with lifecycle, provenance, scanner completeness, limitations, and explicit CTAs.
- Extractable props: repository, relationship, branch, lifecycle, revision, coverage, publishedAt, guidance, canLaunch, active.
- Hardcoded: Review evidence, Run analysis, and View progress labels.
