import { jsPDF } from 'jspdf';
import trustLabLogo from './assets/trustlab-logo.jpg';
import mphasisLogo from './assets/mphasis-logo.jpg';
import { buildPdfModel, safeExportBaseName, sourceLocationUrl, type ExportScope, type PdfExportModel, type ReportFilterSnapshot, type ThreatFinding, type ThreatReportData } from './threatReportExportModel';

type RGB = [number, number, number];
const INK: RGB = [16,25,35], SLATE: RGB = [68,86,100], RULE: RGB = [213,224,231], TEAL: RGB = [24,133,123], BLUE: RGB = [54,119,148], AMBER: RGB = [190,126,37], RED: RGB = [180,65,57], PAPER: RGB = [247,249,250];

async function dataUrl(url: string): Promise<string> {
  const response = await fetch(url); if (!response.ok) throw new Error(`Brand asset could not be loaded (${response.status}).`);
  const blob = await response.blob(); return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

async function render(model: PdfExportModel, trustLogo: string, mphasisLogo: string, onProgress: (percent:number)=>void): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const { report } = model, width = doc.internal.pageSize.getWidth(), margin = 44, contentWidth = width - margin * 2, bottom = 786; let y = 48;
  const addPage = () => { doc.addPage(); y = 48; }; const ensure = (height: number) => { if (y + height > bottom) addPage(); };
  const lines = (value: unknown, maxWidth = contentWidth) => doc.splitTextToSize(String(value ?? 'Unavailable'), maxWidth) as string[];
  const write = (value: unknown, options: { size?: number; bold?: boolean; color?: RGB; indent?: number; link?: string; gap?: number } = {}) => {
    const size = options.size || 8.5, indent = options.indent || 0, output = lines(value, contentWidth - indent); ensure(output.length * size * 1.35 + (options.gap || 0));
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...(options.color || INK));
    output.forEach(line => { if(options.link)doc.textWithLink(line, margin + indent, y, { url: options.link });else doc.text(line, margin + indent, y); y += size * 1.35; }); y += options.gap || 0;
  };
  const section = (title: string, subtitle?: string, newPage = false) => {
    if (newPage) addPage(); else ensure(54); y += 12; doc.setFillColor(...TEAL); doc.roundedRect(margin, y - 8, 4, 25, 2, 2, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(...INK); doc.text(title, margin + 14, y + 3); y += 19;
    if (subtitle) write(subtitle, { color: SLATE, size: 8.2, indent: 14, gap: 5 }); doc.setDrawColor(...RULE); doc.line(margin, y, width-margin, y); y += 14;
  };
  const pair = (label: string, value: unknown, mono = false) => {
    const output = lines(value, contentWidth - 116); ensure(Math.max(18, output.length * 11 + 5)); doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...SLATE); doc.text(label.toUpperCase(), margin, y);
    doc.setFont(mono ? 'courier' : 'helvetica','normal'); doc.setFontSize(8.4); doc.setTextColor(...INK); output.forEach((line,index) => doc.text(line,margin+116,y+index*11)); y += Math.max(18, output.length*11+5);
  };
  const metric = (x: number, label: string, value: string, color: RGB) => { doc.setFillColor(...PAPER); doc.setDrawColor(...RULE); doc.roundedRect(x,y,119,61,5,5,'FD'); doc.setFillColor(...color); doc.rect(x,y,4,61,'F'); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.setTextColor(...INK); doc.text(value,x+14,y+27); doc.setFontSize(7); doc.setTextColor(...SLATE); doc.text(label.toUpperCase(),x+14,y+45); };
  const distribution = (title: string, values: Record<string,number>) => {
    const entries = Object.entries(values).sort((a,b)=>b[1]-a[1]).slice(0,12), max = Math.max(1,...entries.map(([,count])=>count)); ensure(35+entries.length*20); write(title,{size:10,bold:true,gap:5});
    if (!entries.length) return write('No values were reported.',{color:SLATE,gap:5}); entries.forEach(([label,count])=>{ doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...INK); doc.text(label || 'Uncategorized',margin,y); doc.setFillColor(229,235,239); doc.roundedRect(margin+118,y-7,240,7,3,3,'F'); doc.setFillColor(...BLUE); doc.roundedRect(margin+118,y-7,Math.max(3,240*count/max),7,3,3,'F'); doc.setFont('helvetica','bold'); doc.text(String(count),width-margin,y,{align:'right'}); y+=20; }); y+=4;
  };
  const finding = (item: ThreatFinding, number: number) => {
    ensure(118); const top=y, accent:RGB=/critical|high/i.test(item.severity)?RED:/medium/i.test(item.severity)?AMBER:BLUE; doc.setFillColor(...PAPER); doc.setDrawColor(...RULE); doc.roundedRect(margin,top,contentWidth,32,4,4,'FD'); doc.setFillColor(...accent); doc.rect(margin,top,4,32,'F'); doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.setTextColor(...INK); doc.text(lines(`${number}. ${item.title}`,contentWidth-130)[0],margin+13,top+20); doc.setFontSize(7); doc.setTextColor(...accent); doc.text(item.severity.toUpperCase(),width-margin-12,top+20,{align:'right'}); y+=46;
    pair('Category / rule',`${item.category || 'Uncategorized'} / ${item.rule || 'Not supplied'}`,true); const url=sourceLocationUrl(report,item); const location=`${item.file || 'Unavailable'}:${item.line || 0}`; ensure(20); doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...SLATE); doc.text('SOURCE',margin,y); doc.setFont('courier','normal'); doc.setFontSize(8); doc.setTextColor(...BLUE); if(url)doc.textWithLink(location,margin+116,y,{url});else doc.text(location,margin+116,y); y+=18;
    pair('Reported by',item.scanners?.join(', ') || item.evidence_sources?.join(', ') || 'Unavailable'); write('Scanner observation',{bold:true,color:SLATE}); write(item.message,{gap:5}); write('Why it matters',{bold:true,color:SLATE}); write(item.explanation,{gap:3}); write(item.impact,{color:SLATE,gap:5}); write('Recommended action',{bold:true,color:SLATE}); (item.remediation_steps.length?item.remediation_steps:['No remediation guidance was supplied.']).forEach(step=>write(`- ${step}`,{indent:9,gap:2}));
    if(item.evidence_provenance?.length) pair('Workflow evidence',item.evidence_provenance.map(p=>`${p.scanner||'scanner'}${p.workflow_run_id?` run ${p.workflow_run_id}`:''}${p.attempt?` attempt ${p.attempt}`:''}`).join('; '),true); if(item.uncertainty_notice) write('Developer review required: this observation does not by itself prove a root cause or exploitable defect.',{bold:true,color:AMBER}); y+=10;
  };

  doc.setFillColor(...INK); doc.rect(0,0,width,225,'F'); doc.setFillColor(255,255,255); doc.roundedRect(margin,34,82,45,5,5,'F'); doc.addImage(trustLogo,'JPEG',margin+9,39,64,35); doc.roundedRect(width-margin-128,34,128,45,5,5,'F'); doc.addImage(mphasisLogo,'JPEG',width-margin-118,43,108,28);
  y=112; write('CODE ANALYSIS EVIDENCE',{size:8,bold:true,color:[101,214,200],gap:16}); write('Security Analysis Report',{size:27,bold:true,color:[255,255,255],gap:8}); write(report.source_repository||'Repository unavailable',{size:12,color:[218,229,235],gap:3}); write(`${report.target_sha?.slice(0,12)||'SHA unavailable'} / ${model.scope==='complete'?'Complete report':'Filtered report'}`,{size:8,color:[167,188,199]});
  y=260; const complete=report.coverage.available_channels.length,incomplete=report.coverage.incomplete_channels.length; metric(margin,'Retained findings',String(model.totalSelected),BLUE); metric(margin+128,'Complete channels',String(complete),TEAL); metric(margin+256,'Incomplete channels',String(incomplete),incomplete?AMBER:TEAL); metric(margin+384,'Report status',report.status||'Unknown',/ready|complete/i.test(report.status)?TEAL:AMBER); y+=84; write(report.coverage.positioning_statement||'Retained scanner evidence for one immutable source revision.',{size:10,color:SLATE});
  section('Executive summary','Factual retained evidence. Counts are not a quality score.'); distribution('Findings by severity',report.metrics.findings_by_severity); distribution('Findings by category',report.metrics.findings_by_category);
  section('Evidence scope and coverage','Unavailable evidence is never interpreted as zero findings.'); pair('Coverage status',report.coverage.status); pair('Expected channels',report.coverage.expected_channels.join(', ')||'None declared'); pair('Completed channels',report.coverage.available_channels.join(', ')||'None'); pair('Incomplete channels',report.coverage.incomplete_channels.join(', ')||'None'); report.coverage.channel_matrix?.forEach(c=>pair(c.name||c.channel,`${c.normalized_status.replaceAll('_',' ')} / ${c.finding_count===null?'Finding count unavailable':`${c.finding_count} findings`}${c.reason?` / ${c.reason}`:''}`));
  if(report.truncated||report.truncation_notice||report.findings_omitted) write(report.truncation_notice||report.truncation_reason||`${report.findings_omitted||'Some'} findings were omitted upstream.`,{bold:true,color:RED});
  section('Limitations and interpretation','Read these boundaries before making engineering or release decisions.'); (report.limitations.length?report.limitations:['No additional limitations were declared.']).forEach(item=>write(`- ${item}`,{indent:9,gap:3}));
  section('Immutable provenance','Identifiers bind this report to its source, analysis, tooling, and publication context.'); pair('Repository',report.source_repository||'Unavailable',true); pair('Revision',report.target_sha,true); pair('Target',report.ref||(report.pr?`Pull request #${report.pr}`:'Exact commit')); pair('Analysis ID',report.analysis_id||'Unavailable',true); pair('Report ID',report.report_id,true); pair('Tooling SHA',report.tooling_sha||'Unavailable',true); pair('Analyzed',report.analysis_timestamp||report.generated_at); pair('Published',report.report_generation_timestamp||report.generated_at); pair('PDF exported',model.exportedAt); pair('Catalog / generator',`${report.guidance_catalog_version} / ${report.generator_version}`,true); pair('Export scope',model.scope==='complete'?`All ${model.totalSelected} retained findings`:`${model.totalSelected} filtered findings from ${report.findings.length}`); if(model.scope==='filtered') pair('Frozen filters',Object.entries(model.filters).filter(([,v])=>Array.isArray(v)?v.length:Boolean(v)).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):v}`).join(' / ')||'None');
  section(`Detailed findings (${model.findings.length})`,'Source location, scanner attribution, explanation, impact, remediation, and workflow evidence.',true); if(!model.findings.length) write('No findings are included in this export scope.',{color:SLATE});
  for(let index=0;index<model.findings.length;index++){
    finding(model.findings[index],index+1);
    if(index%20===19){onProgress(20+Math.round((index+1)/Math.max(1,model.findings.length)*70));await new Promise(resolve=>setTimeout(resolve,0));}
  }
  const pages=doc.getNumberOfPages(); for(let page=1;page<=pages;page++){doc.setPage(page);doc.setDrawColor(...RULE);doc.line(margin,807,width-margin,807);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...SLATE);doc.text(`${report.report_id} / ${report.target_sha?.slice(0,12)||'unavailable'}`,margin,822);doc.text(`Page ${page} of ${pages}`,width-margin,822,{align:'right'});} return doc.output('blob');
}

export async function createThreatReportDownload(report: ThreatReportData, scope: ExportScope, filters: ReportFilterSnapshot,onProgress:(percent:number)=>void=()=>{}): Promise<{blob:Blob;filename:string}> {
  onProgress(5);
  const model=buildPdfModel(report,scope,filters),base=safeExportBaseName(report,scope),[trust,mphasis]=await Promise.all([dataUrl(trustLabLogo),dataUrl(mphasisLogo)]);
  onProgress(20);
  const blob=await render(model,trust,mphasis,onProgress);onProgress(100);
  return {blob,filename:`${base}.pdf`};
}
