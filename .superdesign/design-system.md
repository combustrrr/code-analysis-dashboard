# Code Analysis design system

## Product and audience
Code Analysis is an access-controlled evidence workspace for engineers, security reviewers, and program stakeholders across three trusted repositories. Its job is to make scanner evidence reviewable and defensible: exact source SHA, tooling provenance, workflow attempts, coverage boundaries, findings, and publication state.

## Visual direction
Avoid sparse minimalism and generic SaaS cards. The interface should feel like a sophisticated engineering instrument: information-rich, composed, confident, and calm. Use meaningful density, layered evidence surfaces, structured metadata, and visible relationships. The signature element is a live-style evidence register or provenance rail—not a decorative flowchart.

## Typography
- Sora 600–700 for product headlines, workspace titles, and important numeric/status statements.
- Manrope 400–700 for interface copy, navigation, buttons, descriptions, and tables.
- IBM Plex Mono 400 for SHAs, branches, rule IDs, workflow runs, and immutable identifiers.
- Preserve generous line height for body copy while keeping technical metadata compact.

## Color
- Dark default: `#0B141E` page depth, `#101923` paper, `#1A2632` panels, `#202F3B` raised evidence surfaces.
- Primary text `#F1F5F6`; secondary `#A8B6BE`; structural lines `#34424D`.
- Trust blue `#3B82A0`; evidence teal `#31A89A`; attention amber `#D89A3D`.
- Light mode uses `#F5F7F8`, white panels, `#101923` text, `#D7DEE2` lines, and darker accessible blue/teal.
- Do not introduce purple, neon, warm beige, decorative pink gradients, or unrelated brand colors.

## Composition
- Public landing: substantial product header, strong two-column hero, useful evidence preview with the three configured projects, capability proof strip, three-stage evidence method, assurance CTA, institutional footer.
- Projects: authoritative workspace context in the shell; summary strip; three rich project records with lifecycle, branch, immutable SHA, coverage, publication age, limitations, and clear Review evidence / Run analysis / View progress actions.
- Use 8–16px radii selectively, layered shadows, subtle grid texture, controlled teal light, and structured dividers. The result must feel complete rather than empty.
- Institutional logos are visually separate from the product wordmark. Never concatenate `Code AnalysisIIT Bombay Trust Lab × Mphasis` into one text link.

## Interaction and states
- Public lifecycle vocabulary is only Preparing, Analyzing, Ready, and Needs attention.
- Errors explain the recovery action. Auth failure uses “Sign-in interrupted” and offers Try again.
- Never expose cutover/reset implementation notices in the public UI.
- Dark/light persistence, keyboard focus, reduced motion, and responsive mobile composition are mandatory.

## Component language
- Buttons are purposeful, medium-weight, and 38–50px high depending on hierarchy.
- Status tags use compact pills; project and evidence surfaces are rectangular with restrained rounding.
- Evidence rails and technical registers use mono identifiers, directional connectors, coverage values, and honest limitations.
- Use Ant Design behavior but make the visual treatment distinctly Code Analysis.
