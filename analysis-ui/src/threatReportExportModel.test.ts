import { describe, expect, test } from 'vitest';
import { buildPdfModel, filterThreatFindings, hasActiveFilters, safeExportBaseName, sourceLocationUrl, type ThreatReportData } from './threatReportExportModel';

const report: ThreatReportData = {
  schema_version: '1', report_id: 'report-1', immutable: true, source_repository: 'owner/repo', ref: 'main', target_sha: 'a'.repeat(40), generated_at: '2026-10-20T00:00:00Z', guidance_catalog_version: 'cat-1', generator_version: 'gen-1', status: 'completed', limitations: [],
  coverage: { status: 'complete', expected_channels: [], available_channels: [], incomplete_channels: [] },
  metrics: { findings_total: 1, findings_by_category: {}, findings_by_severity: {}, advisories_total: 0, guidance_matched: 1, guidance_fallback: 0 },
  findings: [{ finding_id: 'f-1', category: 'security', severity: 'HIGH', evidence_sources: ['scanner'], guidance_source: 'catalog', guidance_match: 'rule', title: 'Unicode café 漢字', explanation: 'explanation', impact: 'impact', remediation_steps: ['fix'], references: [], message: 'message', file: 'src/a b.ts', line: 12, rule: 'rule', scanners: ['scanner'] }],
};

describe('threat report export model', () => {
  test('complete scope ignores filters while filtered scope freezes the selection', () => {
    const filters = { query: 'does-not-match', severity: 'HIGH', category: '', guidance: '' };
    expect(buildPdfModel(report, 'complete', filters).totalSelected).toBe(1);
    expect(buildPdfModel(report, 'filtered', filters).totalSelected).toBe(0);
    filters.query = '';
    expect(buildPdfModel(report, 'filtered', { query: 'café', severity: '', category: '', guidance: '' }).findings[0].finding_id).toBe('f-1');
  });

  test('detects filters and builds safe exact-SHA links and filenames', () => {
    expect(hasActiveFilters({ query: ' ', severity: '', category: '', guidance: '' })).toBe(false);
    expect(hasActiveFilters({ query: '', severity: 'HIGH', category: '', guidance: '' })).toBe(true);
    expect(sourceLocationUrl(report, report.findings[0])).toBe(`https://github.com/owner/repo/blob/${'a'.repeat(40)}/src/a%20b.ts#L12`);
    expect(safeExportBaseName(report, 'complete')).toBe(`repo-${'a'.repeat(12)}-complete`);
    expect(filterThreatFindings(report.findings, { query: '', severity: 'LOW', category: '', guidance: '' })).toHaveLength(0);
  });

  test('keeps every selected finding in one PDF model', () => {
    const many = { ...report, findings: Array.from({ length: 251 }, (_, index) => ({ ...report.findings[0], finding_id: `f-${index}` })) };
    const model = buildPdfModel(many, 'complete', { query: '', severity: '', category: '', guidance: '' }, '2026-10-20T01:00:00Z');
    expect(model.findings).toHaveLength(251);
    expect(model.exportedAt).toBe('2026-10-20T01:00:00Z');
  });
});
