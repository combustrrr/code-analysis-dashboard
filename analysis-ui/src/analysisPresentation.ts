export type AnalysisStatus = 'Preparing' | 'Analyzing' | 'Preparing report' | 'Ready' | 'Needs attention';

const ready = new Set(['published', 'reused', 'superseded']);
const failed = new Set(['failed', 'cancelled_cutover']);

export function analysisStatus(phase?: string): AnalysisStatus {
  if (ready.has(phase || '')) return 'Ready';
  if (failed.has(phase || '')) return 'Needs attention';
  if (phase === 'collecting' || phase === 'publishing') return 'Preparing report';
  if (phase === 'scanning' || phase === 'running' || phase === 'analyzing') return 'Analyzing';
  return 'Preparing';
}

export function analysisStage(status: AnalysisStatus) {
  if (status === 'Ready' || status === 'Needs attention') return 4;
  if (status === 'Preparing report') return 3;
  if (status === 'Analyzing') return 2;
  return 1;
}

export function plainAnalysisIssue(detail?: string) {
  const value = String(detail || '').toLowerCase();
  if (value.includes('incomplete') || value.includes('partial')) return 'Some checks did not finish. Available results remain reviewable.';
  if (value.includes('report') || value.includes('asset') || value.includes('storage') || value.includes('delivery') || value.includes('publish')) return 'The report could not be prepared. Your previous report is still available; try the analysis again.';
  return 'The analysis did not finish. Your previous report is unchanged, and you can try again.';
}
