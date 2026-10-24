import { Alert, Button, Card, Col, Empty, Input, List, Modal, Pagination, Row, Select, Space, Statistic, Table, Tag, Typography } from './ui';
import { CopyOutlined, DownloadOutlined, FilePdfOutlined } from './icons';
import { useEffect, useMemo, useState } from 'react';
import { refreshRepositoryReports, repositoryJson } from './repositoryReports';
import {parseAppRoute,routeHash} from './appRoutes';
import { safeGithubUrl } from './safeUrls';
import trustLabLogo from './assets/trustlab-logo.jpg';
import mphasisLogo from './assets/mphasis-logo.jpg';
import { filterThreatFindings, hasActiveFilters, sourceLocationUrl, type ExportScope, type ReportFilterSnapshot } from './threatReportExportModel';
import './report-preview.css';
import type { ThreatReportData } from './threatReportExportModel';
export type { ThreatFinding, ThreatReportData } from './threatReportExportModel';

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ThreatReport({ reportPath, targetSha }: { reportPath: string; targetSha?: string }) {
  const [report, setReport] = useState<ThreatReportData>();
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [guidance, setGuidance] = useState('');
  const [findingsPage, setFindingsPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [pdfScope, setPdfScope] = useState<ExportScope>();
  const [previewScope, setPreviewScope] = useState<ExportScope>();
  const [exportError, setExportError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setReport(undefined); setMarkdown(''); setError('');
    repositoryJson<ThreatReportData>(`data/${reportPath}/threat-report.json`, controller.signal)
      .then(json => setReport(json))
      .catch(e => { if (e.name !== 'AbortError') setError(e.message || 'Threat report unavailable.'); });
    repositoryJson<string>(`data/${reportPath}/threat-report.md`, controller.signal)
      .then(setMarkdown)
      .catch(() => {});
    return () => controller.abort();
  }, [reportPath, retry]);
  useEffect(() => setFindingsPage(1), [query, severity, category, guidance, reportPath]);
  const filters = useMemo<ReportFilterSnapshot>(() => ({ query, severity, category, guidance }), [query, severity, category, guidance]);
  const filtered = useMemo(() => report ? filterThreatFindings(report.findings, filters) : [], [report, filters]);
  if (error) { const detail = error.toLowerCase(); const expired = detail.includes('expired') || detail.includes('freshness'); const missing = detail.includes('not found') || detail.includes('unavailable'); return <Alert showIcon type="warning" title={expired ? 'Report expired' : missing ? 'Report temporarily unavailable' : 'Threat report could not be retrieved'} description={<>{error} <Space><Button type="link" onClick={() => { refreshRepositoryReports(); setRetry(n => n + 1); }}>Refresh report</Button><Button type="link" onClick={() => { const route=parseAppRoute();if(route.kind==='project')location.hash=routeHash({kind:'project',projectId:route.projectId,view:'overview',target:route.target}); }}>Return to overview</Button></Space></>} />; }
  if (!report) return <div className="empty" role="status"><Empty description="Loading the threat report…" /></div>;
  const pageSize = 25;
  const visibleFindings = filtered.slice((findingsPage - 1) * pageSize, findingsPage * pageSize);
  const exportPdf = async (scope: ExportScope) => {
    const frozenFilters = { ...filters };
    setPdfScope(scope); setExportError('');
    try {
      const { createThreatReportDownload } = await import('./ThreatReportPdf');
      const result = await createThreatReportDownload(report, scope, frozenFilters);
      downloadBlob(result.filename, result.blob);
      setPreviewScope(undefined);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'The PDF could not be generated. No partial download was created.');
    } finally { setPdfScope(undefined); }
  };
  return <section className="threat-report" aria-label="Threat report">
    <Space className="report-actions" wrap>
      <Button icon={<CopyOutlined />} onClick={() => navigator.clipboard?.writeText(location.href)}>Copy private report link</Button>
      <Button icon={<DownloadOutlined />} onClick={() => download('threat-report.json', JSON.stringify(report, null, 2), 'application/json')}>Download JSON</Button>
      <Button icon={<DownloadOutlined />} disabled={!markdown} loading={!markdown} onClick={() => download('threat-report.md', markdown, 'text/markdown')}>Download Markdown</Button>
      <Button type="primary" icon={<FilePdfOutlined />} disabled={Boolean(pdfScope)} onClick={() => setPreviewScope('complete')}>Preview PDF</Button>
      <Button icon={<FilePdfOutlined />} disabled={Boolean(pdfScope) || !hasActiveFilters(filters)} onClick={() => setPreviewScope('filtered')}>Preview filtered PDF</Button>
    </Space>
    <Modal className="pdf-preview-modal" width={820} open={Boolean(previewScope)} title="Preview PDF export" onCancel={() => setPreviewScope(undefined)} footer={<><Button onClick={() => setPreviewScope(undefined)}>Cancel</Button><Button type="primary" icon={<FilePdfOutlined />} loading={Boolean(pdfScope)} onClick={() => previewScope && exportPdf(previewScope)}>Download PDF</Button></>}>
      {previewScope && (() => { const selected = previewScope === 'complete' ? report.findings : filtered; return <div className="pdf-preview-sheet">
        <div className="pdf-preview-cover"><span>CODE ANALYSIS EVIDENCE</span><h2>Security Analysis Report</h2><p>{report.source_repository || 'Repository unavailable'}</p><code>{report.target_sha}</code></div>
        <div className="pdf-preview-metrics"><div><strong>{selected.length.toLocaleString()}</strong><span>Findings</span></div><div><strong>{report.coverage.available_channels.length}</strong><span>Complete channels</span></div><div><strong>{report.coverage.incomplete_channels.length}</strong><span>Incomplete channels</span></div><div><strong>One</strong><span>PDF document</span></div></div>
        <div className="pdf-preview-body"><div><h3>{previewScope === 'complete' ? 'Complete report' : 'Filtered report'}</h3><p>{previewScope === 'complete' ? 'Every retained finding for this immutable revision will be included.' : `The active filters are frozen into this export. ${selected.length} of ${report.findings.length} findings will be included.`}</p>{previewScope === 'filtered' && <p className="pdf-preview-filters">{Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' / ')}</p>}</div><div><h3>Included sections</h3><ul><li>Executive summary and distributions</li><li>Scanner coverage and limitations</li><li>Immutable analysis provenance</li><li>Detailed findings with source links</li><li>Explanation, impact, and remediation</li></ul></div></div>
        {report.coverage.incomplete_channels.length > 0 && <Alert showIcon type="warning" title="The PDF will identify incomplete coverage" description="Unavailable scanner evidence remains explicit and is not treated as zero findings." />}
      </div>; })()}
    </Modal>
    {exportError && <Alert showIcon type="error" title="PDF export failed" description={`${exportError} JSON and Markdown downloads remain available.`} />}
     <Card className="threat-identity report-hero">
       <div className="report-brand-masthead"><div><img src={trustLabLogo} alt="TrustLab" /><span>Prepared by TrustLab</span></div><div><img src={mphasisLogo} alt="Mphasis" /><span>Prepared for Mphasis</span></div></div>
       <div className="report-kicker">SECURITY EVIDENCE BRIEF</div>
       <div className="report-hero-line"><div><Typography.Title level={1} className="report-title">Threat Report</Typography.Title><Typography.Text className="report-subtitle">Immutable findings for a single analyzed revision</Typography.Text></div><Tag className={`report-status report-status-${report.status.toLowerCase().replaceAll(' ', '-')}`}>{report.status}</Tag></div>
       <Typography.Paragraph>{report.coverage.positioning_statement}</Typography.Paragraph>
      <Typography.Paragraph><strong>What was analyzed:</strong> {report.source_repository || 'Unavailable'} · {report.ref || (report.pr ? `PR #${report.pr}` : 'exact commit')} · read-only analysis</Typography.Paragraph>
      <Typography.Paragraph><strong>Analyzed commit:</strong> <code>{report.target_sha || targetSha || 'Unavailable'}</code></Typography.Paragraph>
       <Typography.Paragraph><strong>Analyzed:</strong> {new Date(report.analysis_timestamp || report.generated_at).toLocaleString()} · <strong>Report generated:</strong> {new Date(report.report_generation_timestamp || report.generated_at).toLocaleString()} · <strong>Status:</strong> <Tag>{report.status}</Tag></Typography.Paragraph>
      <Typography.Paragraph><strong>Tooling:</strong> <code>{report.tooling_sha || 'Unavailable'}</code></Typography.Paragraph>
       <Typography.Paragraph><strong>Analysis:</strong> <code>{report.analysis_id || 'Unavailable'}</code> · <strong>Report:</strong> <code>{report.report_id}</code> · <strong>Catalog:</strong> <code>{report.guidance_catalog_version}</code> · <strong>Generator:</strong> <code>{report.generator_version}</code></Typography.Paragraph>
    </Card>
     <Row gutter={[12, 12]} className="threat-summary">
       <Col xs={12} md={6}><Card className="report-metric metric-findings"><Statistic title="Findings" value={report.metrics.findings_total} /></Card></Col>
       <Col xs={12} md={6}><Card className="report-metric"><Statistic title="Catalog guidance" value={report.metrics.guidance_matched} /></Card></Col>
       <Col xs={12} md={6}><Card className="report-metric"><Statistic title="Fallback guidance" value={report.metrics.guidance_fallback} /></Card></Col>
       <Col xs={12} md={6}><Card className="report-metric metric-incomplete"><Statistic title="Incomplete channels" value={report.coverage.incomplete_channels.length} /></Card></Col>
     </Row>
     {report.coverage.summary && <Card className="report-section coverage-summary" title={<span className="report-card-title">Coverage summary <small>Evidence state by channel</small></span>}><Space wrap>{Object.entries(report.coverage.summary).map(([key, value]) => <Tag className={`coverage-tag coverage-${key}`} key={key}>{key.replaceAll('_', ' ')} <strong>{value}</strong></Tag>)}</Space></Card>}
     {report.coverage.channel_matrix && <Card className="report-section channel-coverage" title={<span className="report-card-title">Channel coverage <small>Raw evidence is retained beside reader-facing status</small></span>}><Table size="small" pagination={{ pageSize: 20 }} rowKey="channel" dataSource={report.coverage.channel_matrix} columns={[{ title: 'Channel', dataIndex: 'name' }, { title: 'Raw status', dataIndex: 'raw_status', render: value => <code>{value}</code> }, { title: 'Report status', dataIndex: 'normalized_status', render: value => <Tag className={`coverage-status coverage-status-${String(value).toLowerCase()}`}>{String(value).replaceAll('_', ' ')}</Tag> }, { title: 'Findings', dataIndex: 'finding_count', render: (value: number | null) => value === null ? <span className="muted">N/A</span> : value }, { title: 'Reason', dataIndex: 'reason' }]} /></Card>}
    {report.coverage.incomplete_channels.length > 0 && <Alert showIcon type="warning" title="Analysis coverage is partial" description={`Incomplete channels: ${report.coverage.incomplete_channels.join(', ')}`} />}
    <Card title={<span className="report-card-title">Limitations <small>Read before interpreting results</small></span>} className="threat-limitations report-section"><List dataSource={report.limitations} split={false} renderItem={item => <List.Item><div className="report-list-item">{item}</div></List.Item>} /></Card>
    <section className="threat-findings report-section"><div className="findings-heading"><div><div className="report-kicker">EVIDENCE REGISTER</div><h2>Highest-severity findings</h2><p>Ordered by retained scanner severity and deterministic source identity. No subjective risk score is applied.</p></div><div className="findings-count">{filtered.length.toLocaleString()}<small>shown</small></div></div>
      <Space wrap className="threat-filters"><Input aria-label="Search threat findings" placeholder="Search title, message, file, rule, or scanner" allowClear value={query} onChange={e => setQuery(e.target.value)} /><Select aria-label="Threat severity" value={severity} onChange={setSeverity} options={[{value:'',label:'All severities'}, ...[...new Set(report.findings.map(f => f.severity))].map(value => ({value,label:value}))]} /><Select aria-label="Threat category" value={category} onChange={setCategory} options={[{value:'',label:'All categories'}, ...[...new Set(report.findings.map(f => f.category))].map(value => ({value,label:value}))]} /><Select aria-label="Guidance source" value={guidance} onChange={setGuidance} options={[{value:'',label:'All guidance'}, {value:'catalog',label:'Catalog guidance'}, {value:'fallback',label:'Fallback guidance'}]} /><Typography.Text>{filtered.length.toLocaleString()} findings</Typography.Text></Space>
       {visibleFindings.map(finding => <Card key={finding.finding_id} className={`threat-finding finding-${finding.severity.toLowerCase()}`} title={<Space><Tag className={`severity-tag severity-${finding.severity.toLowerCase()}`}>{finding.severity}</Tag><span>{finding.title}</span></Space>}>
        <Typography.Paragraph><strong>Category:</strong> {finding.category} · <strong>Location:</strong> {sourceLocationUrl(report, finding) ? <a href={sourceLocationUrl(report, finding)} target="_blank" rel="noreferrer"><code>{finding.file}:{finding.line}</code></a> : <code>{finding.file}:{finding.line}</code>} · <strong>Evidence:</strong> {finding.evidence_sources.join(', ')}</Typography.Paragraph>
         <Typography.Paragraph><strong>Scanner message:</strong> {finding.message}</Typography.Paragraph>
         {finding.evidence_provenance?.length ? <Typography.Paragraph><strong>Evidence provenance:</strong> {finding.evidence_provenance.map(source => `${source.scanner || 'scanner'}${source.workflow_run_id ? ` run ${source.workflow_run_id}` : ''}${source.attempt ? ` attempt ${source.attempt}` : ''}`).join('; ')}</Typography.Paragraph> : null}
        <Typography.Paragraph><strong>Explanation:</strong> {finding.explanation}</Typography.Paragraph>
        <Typography.Paragraph><strong>Potential impact:</strong> {finding.impact}</Typography.Paragraph>
         <Typography.Paragraph><strong>Remediation:</strong></Typography.Paragraph><List dataSource={finding.remediation_steps} split={false} renderItem={step => <List.Item><div className="report-list-item">{step}</div></List.Item>} />
        {finding.uncertainty_notice && <Alert type="info" showIcon message="Developer validation required" description="The retained evidence does not by itself prove a root cause or exploitable defect." />}
        {finding.references.length > 0 && <Typography.Paragraph><strong>References:</strong> {finding.references.map(reference => { const url = safeGithubUrl(reference); return url ? <a key={reference} href={url} target="_blank" rel="noreferrer">{reference}</a> : <span key={reference}>{reference}</span>; })}</Typography.Paragraph>}
      </Card>)}
      {filtered.length > pageSize && <Pagination current={findingsPage} pageSize={pageSize} total={filtered.length} showSizeChanger={false} showTotal={total => `${total.toLocaleString()} findings`} onChange={setFindingsPage} />}
    </section>
  </section>;
}
