import {describe,expect,it} from 'vitest';
import {analysisStage,analysisStatus,plainAnalysisIssue} from './analysisPresentation';

describe('analysis presentation',()=>{
  it('maps backend phases to the five user-facing states',()=>{
    expect(analysisStatus('preparing')).toBe('Queued');
    expect(analysisStatus('scanning')).toBe('Analyzing');
    expect(analysisStatus('collecting')).toBe('Preparing report');
    expect(analysisStatus('published')).toBe('Ready');
    expect(analysisStatus('failed')).toBe('Needs attention');
    expect(analysisStage('Preparing report')).toBe(3);
  });
  it('does not expose report delivery internals in the primary error',()=>{
    expect(plainAnalysisIssue('Report asset missing or exceeds the delivery limit.')).toBe('The report could not be prepared. Your previous report is still available; try the analysis again.');
  });
});
