import { Alert, Button, Card, Empty, Space, Tag } from './ui';
import { DownloadOutlined, FilePdfOutlined } from './icons';
import { useEffect, useState } from 'react';
import { refreshRepositoryReports, repositoryJson } from './repositoryReports';
import { parseAppRoute, routeHash } from './appRoutes';
import type { ThreatReportData } from './threatReportExportModel';

export type { ThreatFinding, ThreatReportData } from './threatReportExportModel';

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ThreatReport({ reportPath, targetSha }: { reportPath: string; targetSha?: string }) {
  const [report, setReport] = useState<ThreatReportData>();
  const [markdown, setMarkdown] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    const controller = new AbortController(); setReport(undefined); setMarkdown(''); setError('');
    repositoryJson<ThreatReportData>(`data/${reportPath}/threat-report.json`, controller.signal)
      .then(setReport)
      .catch(cause => { if (cause.name !== 'AbortError') setError(cause.message || 'Report unavailable.'); });
    repositoryJson<string>(`data/${reportPath}/threat-report.md`, controller.signal).then(setMarkdown).catch(() => {});
    return () => controller.abort();
  }, [reportPath, retry]);

  if (error) {
    const detail = error.toLowerCase(); const expired = detail.includes('expired') || detail.includes('freshness'); const missing = detail.includes('not found') || detail.includes('unavailable');
    return <Alert showIcon type="warning" title={expired ? 'Report expired' : missing ? 'Report temporarily unavailable' : 'Report could not be retrieved'} description={<>{error} <Space><Button type="link" onClick={() => { refreshRepositoryReports(); setRetry(value => value + 1); }}>Refresh report</Button><Button type="link" onClick={() => { const route = parseAppRoute(); if (route.kind === 'project') location.hash = routeHash({ kind: 'project', projectId: route.projectId, view: 'overview', target: route.target }); }}>Return to overview</Button></Space></>} />;
  }
  if (!report) return <div className="empty" role="status"><Empty description="Loading report downloads…" /></div>;

  const exportPdf = async () => {
    setExporting(true); setExportError('');
    try {
      const { createThreatReportDownload } = await import('./ThreatReportPdf');
      const result = await createThreatReportDownload(report, 'complete', { query: '', severity: '', category: '', guidance: '' });
      downloadBlob(result.filename, result.blob);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'The PDF could not be generated. No partial download was created.');
    } finally { setExporting(false); }
  };

  return <section className="report-download-center" aria-label="Report downloads">
    {exportError && <Alert showIcon type="error" title="PDF export failed" description={`${exportError} JSON and Markdown downloads remain available.`} />}
    {report.coverage.incomplete_channels.length > 0 && <Alert showIcon type="warning" title="This report has incomplete scanner coverage" description="The downloaded PDF identifies unavailable evidence explicitly and does not treat it as zero findings." />}
    <Card className="report-download-card">
      <div className="report-download-main">
        <div><span className="eyebrow">ISSUES REPORT · PDF</span><h3>Complete issues report</h3><p>A portable document containing all {report.findings.length.toLocaleString()} retained findings, source locations, scanner attribution, remediation guidance, limitations, and immutable provenance.</p></div>
        <Button type="primary" icon={<FilePdfOutlined />} loading={exporting} onClick={exportPdf}>{exporting ? 'Building PDF…' : 'Download issues PDF'}</Button>
      </div>
      <dl className="report-download-facts">
        <div><dt>Repository</dt><dd>{report.source_repository || 'Unavailable'}</dd></div>
        <div><dt>Revision</dt><dd><code>{report.target_sha || targetSha || 'Unavailable'}</code></dd></div>
        <div><dt>Report ID</dt><dd><code>{report.report_id}</code></dd></div>
        <div><dt>Status</dt><dd><Tag>{report.status}</Tag></dd></div>
        <div><dt>Generated</dt><dd>{new Date(report.report_generation_timestamp || report.generated_at).toLocaleString()}</dd></div>
        <div><dt>Findings</dt><dd>{report.metrics.findings_total.toLocaleString()}</dd></div>
      </dl>
    </Card>
    <Card className="report-machine-exports" title="Machine-readable exports">
      <p>Use these source artifacts for audit, automation, or offline review.</p>
      <Space wrap><Button icon={<DownloadOutlined />} onClick={() => download('threat-report.json', JSON.stringify(report, null, 2), 'application/json')}>Download JSON</Button><Button icon={<DownloadOutlined />} disabled={!markdown} loading={!markdown} onClick={() => download('threat-report.md', markdown, 'text/markdown')}>Download Markdown</Button></Space>
    </Card>
    <p className="report-investigation-link">Need to search, filter, or inspect source evidence? <Button type="link" onClick={() => { const route = parseAppRoute(); if (route.kind === 'project') location.hash = routeHash({ kind: 'project', projectId: route.projectId, view: 'issues', target: route.target }); }}>Open Issues</Button></p>
  </section>;
}
