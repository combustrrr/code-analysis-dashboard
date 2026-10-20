# Theme summary

## Tokens
- Dark paper `#101923`, panel `#1A2632`, raised panel `#202F3B`, ink `#F1F5F6`, muted `#A8B6BE`, line `#34424D`.
- Light paper `#F5F7F8`, panel `#FFFFFF`, raised panel `#F0F3F4`, ink `#101923`, muted `#5D6972`, line `#D7DEE2`.
- Trust blue `#3B82A0`, evidence teal `#31A89A`, attention amber `#D89A3D`; red is reserved for actionable failure.
- Display: Sora 500/600/700. Interface/body: Manrope 400/500/600/700. Technical data: IBM Plex Mono 400.
- Radius scale: 6px controls, 8–12px evidence surfaces, 14–16px signature panels.
- Shadows are cool black at 8–12% for cards and 30–35% for the hero dossier.
- Main content widths: 1240–1320px. Responsive breaks: 1040px, 980px, 900px, 760px, 600px, 470px.
- Dark is the default; light is fully designed. Visible focus uses a 3px teal/amber outline. Reduced motion disables transitions and animations.

## Raw theme provider

```ts
export const brand={midnight:'#101923',slate:'#1A2632',trustBlue:'#3B82A0',evidenceCyan:'#31A89A',mphasisMagenta:'#9E3D69',signalAmber:'#D89A3D',paper:'#F5F7F8',ink:'#101923'} as const;
```

## Raw CSS token sources
- `analysis-ui/src/landing.css` contains the full public-page palette, typography, layout, signature evidence register, and responsive rules.
- `analysis-ui/src/workspace.css` contains the authenticated shell, project register, evidence rails, responsive workspace, and theme overrides.
- `analysis-ui/src/style.css` contains report/issues legacy foundations inherited by detailed project tools.
