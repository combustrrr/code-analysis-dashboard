# Developer Analysis PDF Export Plan

## Goal and current state

Add a real, professionally templated PDF download for developers. The existing
Threat Report already has immutable JSON/Markdown exports and report provenance;
its current “Print / Save as PDF” action only opens the browser print dialog. Keep
the scanner evidence and source-repository read-only boundary unchanged.

## Agreed behavior

- Generate on demand in the browser from the selected, verified immutable Threat
  Report JSON. Do not generate during scans/publication, upload/store PDF assets, or
  add an API route.
- Offer both **Complete report** and **Filtered findings** exports. The complete
  export ignores UI filters. The filtered export snapshots the active search,
  severity, category, and guidance filters at click time, names/displays the scope,
  and states the matched count relative to the whole report. Disable it when no
  filters are active.
- Download a single `.pdf` when the selected scope fits one document. For larger
  exports, split in existing severity-first order into bounded sequential volumes,
  splitting only between findings, then package all volumes into one `.zip`.
  Preserve global finding numbers and label each volume `Volume X of Y`.
- If PDF or ZIP generation fails or exceeds browser capacity, show a clear failure
  and leave the existing JSON/Markdown exports available. Do not emit a partial
  PDF/archive and do not offer individual-volume fallback downloads.
- Finding locations link to the source repository at the exact analyzed SHA and
  line; include no source-code snippets. Invalid/unavailable source identities fall
  back to plain `file:line` text.

## Implementation steps

1. **Define export inputs and completeness.** Extend the UI report type for existing
   truncation metadata (`findings_truncated`, retained/total counts). Build a pure
   export model from the report plus a frozen filter snapshot. Distinguish report
   totals from filtered-export totals; preserve partial coverage, limitations, and
   truncation warnings. Never imply omitted or unavailable findings are zero.
2. **Add a client-side PDF template.** Select a browser-compatible PDF layout
   library (and ZIP support if needed) that supports flowing text, clickable links,
   predictable pagination, and bounded volume creation. Lazy-load the generator
   when an export is requested. Use a restrained, high-contrast version of the
   dashboard’s evidence-brief palette—not a screenshot or print stylesheet.
   Include:
   - report title, export scope, status, source repository, target/ref, exact SHA,
     report/analysis IDs, analysis and report timestamps, and tooling/catalog/
     generator versions;
   - severity summary, finding counts, coverage/channel status, incomplete-channel
     warnings, limitations, and source-report truncation state;
   - severity-ordered finding entries with title/rule/category, exact file/line link,
     scanner message and provenance, explanation, impact, remediation steps, and
     references;
   - consistent typography/spacing, legible severity labels that do not rely on
     color alone, repeated headers/footers, page numbers, and volume identifiers.
   Identify the PDF export time separately from the immutable report timestamps.
3. **Add export controls to `ThreatReport`.** Replace the print-to-PDF action with
   a dedicated download flow for complete and filtered output. Show generation
   progress and prevent duplicate concurrent exports. Name files using sanitized
   repository/target/short-SHA/scope fields. Revoke object URLs and release buffers
   after download or failure. Keep JSON and Markdown downloads unchanged.
4. **Bound and verify large exports.** Establish a tested per-volume page/byte
   target through representative browser fixtures. Chunk deterministically between
   findings; retain one finding intact even if it makes a volume exceed the target,
   or fail explicitly if the renderer cannot represent it. Create the ZIP only after
   all volumes succeed. Ensure export generation never changes report state,
   filters, provenance, or server data.
5. **Document and release.** Update `docs/current/THREAT_REPORTS.md` and the relevant
   UI/root README descriptions to distinguish generated PDF/ZIP downloads from the
   former browser print behavior, including browser-capacity failure behavior. No
   scanner rerun, report backfill, schema migration, R2 change, or upstream change is
   required; this is a static UI release.

## Security and correctness constraints

- Use only the already-fetched report payload; preserve its existing redaction and
  do not fetch or embed source code. Treat scanner-controlled text as untrusted,
  render it as text, and validate/encode GitHub source/reference URLs.
- Do not expand report access or put credentials, detected secret values, raw
  scanner artifacts, or session data in the document, filename, ZIP metadata, or
  logs. Keep incomplete channels and uncertainty statements explicit.
- PDFs are generated locally on demand and are not byte-identical immutable stored
  artifacts; identify the immutable input report by report ID and exact SHA.

## Validation

- Unit-test complete vs filtered selection, immutable filter snapshots, stable
  severity ordering, global numbering, source-link construction/escaping, coverage
  and truncation disclosures, and all-or-nothing volume/ZIP creation.
- Validate generated PDFs contain expected report identity and all selected finding
  IDs exactly once; check page/volume boundaries, clickable links, Unicode/long text,
  and single-finding-over-target behavior. Exercise empty, partial, truncated,
  filtered, and representative large reports.
- Browser-test both export choices, disabled filtered export with no active filters,
  direct single-PDF download, multi-volume ZIP download, progress, and explicit
  failure without a partial archive while JSON/Markdown remain available.
- Run UI build and Playwright tests plus the repository-required service tests,
  workflow audit, and launcher tests. No live scan is needed for this UI-only change.
