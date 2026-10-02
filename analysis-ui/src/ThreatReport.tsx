import { Alert, Button, Card, Col, Empty, Input, List, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { CopyOutlined, DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { repositoryJson } from './repositoryReports';

export type ThreatFinding = {
  finding_id: string; category: string; severity: string; evidence_sources: string[]; guidance_source: string;
  guidance_match: string; title: string; explanation: string; impact: string; remediation_steps: string[];
  references: string[]; message: string; file: string; line: number; rule: string; scanners: string[];
  observation_ids?: string[]; evidence_provenance?: Array<{ observation_id: string; scanner?: string; workflow_run_id?: string | number; attempt?: number; source_sha?: string; artifact?: string }>;
  uncertainty_notice?: boolean;
};
export type ThreatReportData = {
  schema_version: string; report_id: string; immutable: boolean; source_repository?: string; ref?: string; pr?: number; target_sha: string; analysis_timestamp?: string; tooling_sha?: string; generated_at: string;
  guidance_catalog_version: string; generator_version: string; status: string; limitations: string[];
  coverage: { status: string; expected_channels: string[]; available_channels: string[]; incomplete_channels: string[]; positioning_statement?: string; summary?: Record<string, number>; channel_matrix?: Array<{ channel: string; name: string; raw_status: string; normalized_status: string; reason: string; finding_count: number | null }> };
  metrics: { findings_total: number; findings_by_category: Record<string, number>; findings_by_severity: Record<string, number>; advisories_total: number; guidance_matched: number; guidance_fallback: number };
  findings: ThreatFinding[];
};

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

export function ThreatReport({ reportPath, targetSha }: { reportPath: string; targetSha?: string }) {
  const [report, setReport] = useState<ThreatReportData>();
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [guidance, setGuidance] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setReport(undefined); setMarkdown(''); setError('');
    Promise.all([repositoryJson<ThreatReportData>(`data/${reportPath}/threat-report.json`, controller.signal), repositoryJson<string>(`data/${reportPath}/threat-report.md`, controller.signal)])
      .then(([json, md]) => { setReport(json); setMarkdown(md); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message || 'Threat report unavailable.'); });
    return () => controller.abort();
  }, [reportPath]);
  if (error) return <Alert showIcon type="warning" title="Threat report unavailable" description={<>{error} <Button type="link" onClick={() => { const params = new URLSearchParams(location.hash.slice(1)); params.set('tab', 'overview'); location.hash = params.toString(); }}>Rerun analysis</Button></>} />;
  if (!report) return <div className="empty" role="status"><Empty description="Loading threat report..." /></div>;
  const json = JSON.stringify(report, null, 2);
  const legacy = !report.immutable;
  const filtered = report.findings.filter(f => (!severity || f.severity === severity) && (!category || f.category === category) && (!guidance || f.guidance_source === guidance) && `${f.title} ${f.message} ${f.file} ${f.rule} ${f.scanners.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="threat-report" aria-label="Threat report">
    {legacy && <Alert showIcon type="warning" title="Legacy runtime report" description="This report was generated from an older stored analysis and is not an immutable publication artifact. Rerun analysis for a provenance-bound report." />}
    <Space className="report-actions" wrap>
      <Button icon={<CopyOutlined />} onClick={() => navigator.clipboard?.writeText(location.href)}>Copy private report link</Button>
      <Button icon={<DownloadOutlined />} onClick={() => download('threat-report.json', json, 'application/json')}>Download JSON</Button>
      <Button icon={<DownloadOutlined />} onClick={() => download('threat-report.md', markdown, 'text/markdown')}>Download Markdown</Button>
      <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print / Save as PDF</Button>
    </Space>
     <Card className="threat-identity report-hero">
       <div className="report-kicker">SECURITY EVIDENCE BRIEF</div>
       <div className="report-hero-line"><div><Typography.Title level={1} className="report-title">Threat Report</Typography.Title><Typography.Text className="report-subtitle">Immutable findings for a single analyzed revision</Typography.Text></div><Tag className={`report-status report-status-${report.status.toLowerCase().replaceAll(' ', '-')}`}>{report.status}</Tag></div>
       <Typography.Paragraph>{report.coverage.positioning_statement}</Typography.Paragraph>
      <Typography.Paragraph><strong>What was analyzed:</strong> {report.source_repository || 'Unavailable'} · {report.ref || (report.pr ? `PR #${report.pr}` : 'exact commit')} · read-only analysis</Typography.Paragraph>
      <Typography.Paragraph><strong>Analyzed commit:</strong> <code>{report.target_sha || targetSha || 'Unavailable'}</code></Typography.Paragraph>
      <Typography.Paragraph><strong>Analyzed:</strong> {new Date(report.analysis_timestamp || report.generated_at).toLocaleString()} · <strong>Status:</strong> <Tag>{report.status}</Tag></Typography.Paragraph>
      <Typography.Paragraph><strong>Tooling:</strong> <code>{report.tooling_sha || 'Unavailable'}</code></Typography.Paragraph>
      <Typography.Paragraph><strong>Report:</strong> <code>{report.report_id}</code> · <strong>Catalog:</strong> <code>{report.guidance_catalog_version}</code> · <strong>Generator:</strong> <code>{report.generator_version}</code></Typography.Paragraph>
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
    <Card title={<span className="report-card-title">Limitations <small>Read before interpreting results</small></span>} className="threat-limitations report-section"><List size="small" dataSource={report.limitations} renderItem={item => <List.Item>{item}</List.Item>} /></Card>
    <section className="threat-findings report-section"><div className="findings-heading"><div><div className="report-kicker">EVIDENCE REGISTER</div><h2>Highest-severity findings</h2><p>Ordered by retained scanner severity and deterministic source identity. No subjective risk score is applied.</p></div><div className="findings-count">{filtered.length.toLocaleString()}<small>shown</small></div></div>
      <Space wrap className="threat-filters"><Input aria-label="Search threat findings" placeholder="Search title, message, file, rule, or scanner" allowClear value={query} onChange={e => setQuery(e.target.value)} /><Select aria-label="Threat severity" value={severity} onChange={setSeverity} options={[{value:'',label:'All severities'}, ...[...new Set(report.findings.map(f => f.severity))].map(value => ({value,label:value}))]} /><Select aria-label="Threat category" value={category} onChange={setCategory} options={[{value:'',label:'All categories'}, ...[...new Set(report.findings.map(f => f.category))].map(value => ({value,label:value}))]} /><Select aria-label="Guidance source" value={guidance} onChange={setGuidance} options={[{value:'',label:'All guidance'}, {value:'catalog',label:'Catalog guidance'}, {value:'fallback',label:'Fallback guidance'}]} /><Typography.Text>{filtered.length.toLocaleString()} findings</Typography.Text></Space>
       {filtered.map(finding => <Card key={finding.finding_id} className={`threat-finding finding-${finding.severity.toLowerCase()}`} title={<Space><Tag className={`severity-tag severity-${finding.severity.toLowerCase()}`}>{finding.severity}</Tag><span>{finding.title}</span></Space>}>
        <Typography.Paragraph><strong>Category:</strong> {finding.category} · <strong>Location:</strong> <code>{finding.file}:{finding.line}</code> · <strong>Evidence:</strong> {finding.evidence_sources.join(', ')}</Typography.Paragraph>
         <Typography.Paragraph><strong>Scanner message:</strong> {finding.message}</Typography.Paragraph>
         {finding.evidence_provenance?.length ? <Typography.Paragraph><strong>Evidence provenance:</strong> {finding.evidence_provenance.map(source => `${source.scanner || 'scanner'}${source.workflow_run_id ? ` run ${source.workflow_run_id}` : ''}${source.attempt ? ` attempt ${source.attempt}` : ''}`).join('; ')}</Typography.Paragraph> : null}
        <Typography.Paragraph><strong>Explanation:</strong> {finding.explanation}</Typography.Paragraph>
        <Typography.Paragraph><strong>Potential impact:</strong> {finding.impact}</Typography.Paragraph>
        <Typography.Paragraph><strong>Remediation:</strong></Typography.Paragraph><List size="small" dataSource={finding.remediation_steps} renderItem={step => <List.Item>{step}</List.Item>} />
        {finding.uncertainty_notice && <Alert type="info" showIcon message="Developer validation required" description="The retained evidence does not by itself prove a root cause or exploitable defect." />}
        {finding.references.length > 0 && <Typography.Paragraph><strong>References:</strong> {finding.references.map(reference => <a key={reference} href={reference} target="_blank" rel="noreferrer">{reference}</a>)}</Typography.Paragraph>}
      </Card>)}
    </section>
  </section>;
}
