# Accessibility

The Code Analysis Dashboard aims to support keyboard and assistive-technology
users and to present scanner evidence without relying on color alone.

## Supported environments

The current versions of Chrome, Edge, Firefox, and Safari are the primary
supported browsers. The interface is designed for responsive desktop and mobile
layouts, keyboard navigation, browser zoom, and common screen readers.

## Current commitments

- Interactive controls use meaningful labels and visible focus states.
- Status, severity, and scanner coverage use text in addition to color.
- Tables, filters, dialogs, and navigation should remain keyboard operable.
- Reduced-motion preferences should be respected where animation is used.
- Downloaded reports should retain headings and readable contrast.

## Known limitations

Large evidence sets and complex visual summaries can require substantial
navigation. Generated PDF reports may not provide the same semantic structure
as the web interface. Third-party GitHub and authentication screens are outside
this project's direct control.

## Report an accessibility barrier

Open an accessibility issue using the repository issue form. Describe the page,
task, browser, assistive technology, and the result you expected. Do not include
private report data or credentials. If the barrier prevents private security
reporting, use the repository owner's private GitHub contact route.

