import { safeGithubUrl } from './safeUrls';

export type ThreatFinding = {
  finding_id: string; category: string; severity: string; evidence_sources: string[]; guidance_source: string;
  guidance_match: string; title: string; explanation: string; impact: string; remediation_steps: string[];
  references: string[]; message: string; file: string; line: number; rule: string; scanners: string[];
  observation_ids?: string[];
  evidence_provenance?: Array<{ observation_id: string; scanner?: string; workflow_run_id?: string | number; attempt?: number; source_sha?: string; artifact?: string }>;
  uncertainty_notice?: boolean;
};

export type ThreatReportData = {
  schema_version: string; report_id: string; analysis_id?: string; immutable: boolean; source_repository?: string; ref?: string; pr?: number; target_sha: string; analysis_timestamp?: string; report_generation_timestamp?: string; tooling_sha?: string; generated_at: string;
  guidance_catalog_version: string; generator_version: string; status: string; limitations: string[];
  coverage: { status: string; expected_channels: string[]; available_channels: string[]; incomplete_channels: string[]; positioning_statement?: string; summary?: Record<string, number>; channel_matrix?: Array<{ channel: string; name: string; raw_status: string; normalized_status: string; reason: string; finding_count: number | null }> };
  metrics: { findings_total: number; findings_by_category: Record<string, number>; findings_by_severity: Record<string, number>; advisories_total: number; guidance_matched: number; guidance_fallback: number };
  findings: ThreatFinding[];
  truncated?: boolean; truncation_notice?: string; truncation_reason?: string; findings_retained?: number; findings_omitted?: number;
};

export type ReportFilterSnapshot = { query: string; severity: string; category: string; guidance: string };
export type ExportScope = 'complete' | 'filtered';
export type PdfExportModel = {
  report: ThreatReportData; findings: ThreatFinding[]; scope: ExportScope; filters: ReportFilterSnapshot;
  exportedAt: string; sourceUrl?: string; totalSelected: number;
};

export function hasActiveFilters(filters: ReportFilterSnapshot): boolean {
  return Object.values(filters).some(value => value.trim().length > 0);
}

export function filterThreatFindings(findings: ThreatFinding[], filters: ReportFilterSnapshot): ThreatFinding[] {
  const needle = filters.query.trim().toLowerCase();
  return findings.filter(finding =>
    (!filters.severity || finding.severity === filters.severity) &&
    (!filters.category || finding.category === filters.category) &&
    (!filters.guidance || finding.guidance_source === filters.guidance) &&
    (!needle || `${finding.title} ${finding.message} ${finding.file} ${finding.rule} ${finding.scanners.join(' ')}`.toLowerCase().includes(needle))
  );
}

export function sourceLocationUrl(report: ThreatReportData, finding: ThreatFinding): string | undefined {
  if (!report.source_repository || !/^[0-9a-f]{40}$/i.test(report.target_sha) || !finding.file) return undefined;
  const repo = report.source_repository.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return undefined;
  const safePath = finding.file.split('/').map(encodeURIComponent).join('/');
  return safeGithubUrl(`https://github.com/${repo}/blob/${report.target_sha}/${safePath}${finding.line > 0 ? `#L${finding.line}` : ''}`);
}

export function safeExportBaseName(report: ThreatReportData, scope: ExportScope): string {
  const repo = (report.source_repository || 'threat-report').split('/').pop() || 'threat-report';
  const clean = repo.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'threat-report';
  const sha = /^[0-9a-f]{7,40}$/i.test(report.target_sha) ? report.target_sha.slice(0, 12) : 'unknown-sha';
  return `${clean}-${sha}-${scope}`;
}

export function buildPdfModel(report: ThreatReportData, scope: ExportScope, filters: ReportFilterSnapshot, exportedAt = new Date().toISOString()): PdfExportModel {
  const selected = scope === 'complete' ? [...report.findings] : filterThreatFindings(report.findings, filters);
  return { report, scope, filters: { ...filters }, exportedAt, sourceUrl: undefined, findings: selected, totalSelected: selected.length };
}
