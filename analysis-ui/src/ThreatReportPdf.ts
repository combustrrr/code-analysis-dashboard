import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import trustLabLogo from './assets/trustlab-logo.jpg';
import mphasisLogo from './assets/mphasis-logo.jpg';
import { buildPdfModels, safeExportBaseName, sourceLocationUrl, type ExportScope, type PdfExportModel, type ReportFilterSnapshot, type ThreatReportData } from './threatReportExportModel';

async function dataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Brand asset could not be loaded (${response.status}).`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

function render(model: PdfExportModel, trustLogo: string, mphasisLogoData: string): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const { report } = model; const width = doc.internal.pageSize.getWidth(); const bottom = 786; let y = 44;
  const text = (value: unknown, options: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; link?: string } = {}) => {
    const indent = options.indent || 0; doc.setFont('helvetica', options.bold ? 'bold' : 'normal'); doc.setFontSize(options.size || 8.5); doc.setTextColor(...(options.color || [23, 43, 59]));
    const lines = doc.splitTextToSize(String(value ?? 'Unavailable'), width - 84 - indent);
    for (const line of lines) { if (y > bottom) { doc.addPage(); y = 44; } options.link ? doc.textWithLink(line, 42 + indent, y, { url: options.link }) : doc.text(line, 42 + indent, y); y += (options.size || 8.5) * 1.35; }
  };
  const field = (label: string, value: unknown) => { text(`${label}:`, { bold: true, color: [82, 103, 121] }); text(value, { indent: 105 }); y += 2; };
  const heading = (value: string, pageBreak = false) => { if (pageBreak) { doc.addPage(); y = 44; } else y += 10; text(value, { size: 13, bold: true }); doc.setDrawColor(213, 224, 231); doc.line(42, y, width - 42, y); y += 8; };
  doc.addImage(trustLogo, 'JPEG', 42, 38, 64, 36); doc.addImage(mphasisLogoData, 'JPEG', width - 152, 40, 110, 30); doc.setFontSize(7); doc.setTextColor(82, 103, 121); doc.text('Prepared by TrustLab', 42, 84); doc.text('Prepared for Mphasis', width - 42, 84, { align: 'right' }); y = 114;
  text('SECURITY EVIDENCE BRIEF', { size: 8, bold: true, color: [8, 127, 120] }); text('Threat Report', { size: 28, bold: true }); text(`Immutable findings for one analyzed revision · Volume ${model.volume} of ${model.volumeCount}`, { size: 10, color: [82, 103, 121] }); text(report.status, { bold: true, color: [8, 127, 120] });
  heading('Report identity and provenance'); field('Repository', report.source_repository); field('Target', report.ref || (report.pr ? `PR #${report.pr}` : 'Exact commit')); field('Exact SHA', report.target_sha); field('Analysis ID', report.analysis_id); field('Report ID', report.report_id); field('Analyzed', report.analysis_timestamp || report.generated_at); field('Report generated', report.report_generation_timestamp || report.generated_at); field('PDF exported', model.exportedAt); field('Tooling SHA', report.tooling_sha); field('Catalog / generator', `${report.guidance_catalog_version} / ${report.generator_version}`);
  heading('Scope and coverage'); field('Export scope', model.scope === 'complete' ? `Complete (${model.totalSelected} findings)` : `Filtered (${model.totalSelected} of ${report.findings.length} findings)`); if (model.scope === 'filtered') field('Frozen filters', Object.entries(model.filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'None'); field('Coverage status', report.coverage.status); field('Expected channels', report.coverage.expected_channels.join(', ') || 'None declared'); field('Available channels', report.coverage.available_channels.join(', ') || 'None');
  if (report.coverage.positioning_statement) text(report.coverage.positioning_statement); if (report.coverage.incomplete_channels.length) text(`Incomplete channels: ${report.coverage.incomplete_channels.join(', ')}`, { bold: true, color: [198, 77, 64] }); if (report.truncated || report.truncation_notice || report.findings_omitted) text(report.truncation_notice || report.truncation_reason || `${report.findings_omitted || 'Some'} findings were omitted upstream.`, { bold: true, color: [198, 77, 64] });
  heading('Limitations'); (report.limitations.length ? report.limitations : ['None declared.']).forEach(item => text(`• ${item}`, { indent: 8 })); heading(`Findings · ${model.totalSelected} selected`, true); if (!model.findings.length) text('No findings are included in this export scope.');
  model.findings.forEach((finding, index) => { const global = (model.volume - 1) * 250 + index + 1; const source = sourceLocationUrl(report, finding); if (y > 650) { doc.addPage(); y = 44; } text(`${global}. ${finding.title}`, { size: 11, bold: true }); text(`${finding.severity} · ${finding.category} · ${finding.finding_id}`, { bold: true, color: [198, 77, 64] }); text(`${finding.file}:${finding.line}`, { link: source }); text(`Scanner message: ${finding.message}`); text(`Explanation: ${finding.explanation}`); text(`Potential impact: ${finding.impact}`); text('Remediation', { bold: true }); (finding.remediation_steps.length ? finding.remediation_steps : ['No remediation supplied.']).forEach(step => text(`• ${step}`, { indent: 8 })); text(`Evidence and guidance: ${finding.evidence_sources.join(', ') || 'Unavailable'} · ${finding.guidance_source}${finding.guidance_match ? ` (${finding.guidance_match})` : ''}`); if (finding.evidence_provenance?.length) text(`Provenance: ${finding.evidence_provenance.map(item => `${item.scanner || 'scanner'}${item.workflow_run_id ? ` run ${item.workflow_run_id}` : ''}${item.attempt ? ` attempt ${item.attempt}` : ''}`).join('; ')}`); if (finding.uncertainty_notice) text('Developer validation required: retained evidence does not prove a root cause or exploitable defect.', { bold: true, color: [198, 77, 64] }); y += 12; });
  const pages = doc.getNumberOfPages(); for (let page = 1; page <= pages; page += 1) { doc.setPage(page); doc.setDrawColor(213, 224, 231); doc.line(42, 807, width - 42, 807); doc.setFontSize(7); doc.setTextColor(82, 103, 121); doc.text(`${report.report_id} · ${report.target_sha?.slice(0, 12) || 'unavailable'} · volume ${model.volume}/${model.volumeCount}`, 42, 822); doc.text(`Page ${page} of ${pages}`, width - 42, 822, { align: 'right' }); }
  return doc.output('blob');
}

export async function createThreatReportDownload(report: ThreatReportData, scope: ExportScope, filters: ReportFilterSnapshot): Promise<{ blob: Blob; filename: string }> {
  const models = buildPdfModels(report, scope, filters); const base = safeExportBaseName(report, scope); const [trustLogo, mphasisLogoData] = await Promise.all([dataUrl(trustLabLogo), dataUrl(mphasisLogo)]); const rendered: Array<{ name: string; blob: Blob }> = [];
  for (const model of models) { const suffix = models.length > 1 ? `-volume-${String(model.volume).padStart(2, '0')}-of-${String(model.volumeCount).padStart(2, '0')}` : ''; rendered.push({ name: `${base}${suffix}.pdf`, blob: render(model, trustLogo, mphasisLogoData) }); }
  if (rendered.length === 1) return { blob: rendered[0].blob, filename: rendered[0].name }; const zip = new JSZip(); for (const item of rendered) zip.file(item.name, item.blob); return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), filename: `${base}-${rendered.length}-volumes.zip` };
}
