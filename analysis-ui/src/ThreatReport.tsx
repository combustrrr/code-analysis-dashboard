import { Alert, Button, Card, Empty, Input, Select, Space, Tag } from './ui';
import { DownloadOutlined, FilePdfOutlined } from './icons';
import { useEffect, useState } from 'react';
import { refreshRepositoryReports, repositoryJson } from './repositoryReports';
import { parseAppRoute, routeHash } from './appRoutes';
import { filterThreatFindings, hasActiveFilters, type ExportScope, type ReportFilterSnapshot, type ThreatReportData } from './threatReportExportModel';

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
  const [filters,setFilters]=useState<ReportFilterSnapshot>({});

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

  const exportPdf = async (scope:ExportScope) => {
    setExporting(true); setExportError('');
    try {
      const { createThreatReportDownload } = await import('./ThreatReportPdf');
      const result = await createThreatReportDownload(report, scope, filters);
      downloadBlob(result.filename, result.blob);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'The PDF could not be generated. No partial download was created.');
    } finally { setExporting(false); }
  };

  const selected=filterThreatFindings(report.findings,filters),active=hasActiveFilters(filters);
  const values=(items:string[])=>[...new Set(items.filter(Boolean))].sort().map(value=>({value,label:value}));
  const locations=values(report.findings.map(f=>f.file&&f.line>0?`${f.file}#L${f.line}`:''));
  const setFilter=(key:keyof ReportFilterSnapshot,value:string)=>setFilters(current=>({...current,[key]:value}));

  return <section className="report-download-center" aria-label="Report downloads">
    {exportError && <Alert showIcon type="error" title="PDF export failed" description={`${exportError} JSON and Markdown downloads remain available.`} />}
    {report.coverage.incomplete_channels.length > 0 && <Alert showIcon type="warning" title="This report has incomplete scanner coverage" description="The downloaded PDF identifies unavailable evidence explicitly and does not treat it as zero findings." />}
    <Card className="report-download-card">
      <div className="report-download-main">
        <div><span className="eyebrow">ISSUES REPORT · PDF</span><h3>Complete issues report</h3><p>A portable document containing all {report.findings.length.toLocaleString()} retained findings, source locations, scanner attribution, remediation guidance, limitations, and immutable provenance.</p></div>
        <Button type="primary" icon={<FilePdfOutlined />} loading={exporting} onClick={()=>exportPdf('complete')}>{exporting ? 'Building PDF…' : 'Download complete PDF'}</Button>
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
    <Card className="report-filter-export" title="Build a filtered issues report">
      <p>Select the evidence scope to include. The PDF records these filters, the selected finding count, and the immutable report identity.</p>
      <div className="report-export-filters">
        <Input aria-label="Report search" placeholder="Search title, message, file, rule, or scanner" allowClear value={filters.query} onChange={event=>setFilter('query',event.target.value)}/>
        <Select aria-label="Report severity" value={filters.severity||''} onChange={value=>setFilter('severity',value)} options={[{value:'',label:'All severities'},...values(report.findings.map(f=>f.severity))]}/>
        <Select aria-label="Report category" showSearch optionFilterProp="label" value={filters.category||''} onChange={value=>setFilter('category',value)} options={[{value:'',label:'All categories'},...values(report.findings.map(f=>f.category))]}/>
        <Select aria-label="Report scanner" showSearch optionFilterProp="label" value={filters.scanner||''} onChange={value=>setFilter('scanner',value)} options={[{value:'',label:'All scanners'},...values(report.findings.flatMap(f=>f.scanners))]}/>
        <Select aria-label="Report rule" showSearch optionFilterProp="label" value={filters.rule||''} onChange={value=>setFilter('rule',value)} options={[{value:'',label:'All rules'},...values(report.findings.map(f=>f.rule))]}/>
        <Select aria-label="Report file" showSearch optionFilterProp="label" value={filters.file||''} onChange={value=>setFilter('file',value)} options={[{value:'',label:'All files'},...values(report.findings.map(f=>f.file))]}/>
        <Select aria-label="Report location" showSearch optionFilterProp="label" value={filters.location||''} onChange={value=>setFilter('location',value)} options={[{value:'',label:'All locations'},{value:'located',label:'Any file and line'},{value:'unlocated',label:'Missing file or line'},...locations.map(option=>({...option,label:option.label.replace('#L',':')}))]}/>
      </div>
      <div className="report-filter-actions"><strong>{selected.length.toLocaleString()} of {report.findings.length.toLocaleString()} findings selected</strong><Space wrap><Button onClick={()=>setFilters({})} disabled={!active}>Clear report filters</Button><Button type="primary" icon={<FilePdfOutlined/>} loading={exporting} disabled={!active||!selected.length} onClick={()=>exportPdf('filtered')}>Download filtered PDF</Button></Space></div>
      {!active&&<small>Choose at least one filter to create a scoped report. The complete PDF remains available above.</small>}
    </Card>
    <Card className="report-machine-exports" title="Machine-readable exports">
      <p>Use these source artifacts for audit, automation, or offline review.</p>
      <Space wrap><Button icon={<DownloadOutlined />} onClick={() => download('threat-report.json', JSON.stringify(report, null, 2), 'application/json')}>Download JSON</Button><Button icon={<DownloadOutlined />} disabled={!markdown} loading={!markdown} onClick={() => download('threat-report.md', markdown, 'text/markdown')}>Download Markdown</Button></Space>
    </Card>
    <p className="report-investigation-link">Need to search, filter, or inspect source evidence? <Button type="link" onClick={() => { const route = parseAppRoute(); if (route.kind === 'project') location.hash = routeHash({ kind: 'project', projectId: route.projectId, view: 'issues', target: route.target }); }}>Open Issues</Button></p>
  </section>;
}
