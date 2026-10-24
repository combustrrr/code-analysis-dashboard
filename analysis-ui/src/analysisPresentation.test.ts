import {describe,expect,it} from 'vitest';
import {analysisStage,analysisStatus,displayFindingMessage,displayRuleId,isCompleteChannelStatus,plainAnalysisIssue} from './analysisPresentation';

describe('analysis presentation',()=>{
  it('maps backend phases to the five user-facing states',()=>{
    expect(analysisStatus('preparing')).toBe('Preparing');
    expect(analysisStatus('scanning')).toBe('Analyzing');
    expect(analysisStatus('collecting')).toBe('Preparing report');
    expect(analysisStatus('published')).toBe('Ready');
    expect(analysisStatus('failed')).toBe('Needs attention');
    expect(analysisStage('Preparing report')).toBe(3);
  });
  it('does not expose report delivery internals in the primary error',()=>{
    expect(plainAnalysisIssue('Report asset missing or exceeds the delivery limit.')).toBe('The report could not be prepared. Your previous report is still available; try the analysis again.');
  });
  it('removes runner paths and markdown URL syntax from display labels only',()=>{
    expect(displayRuleId('home.runner.work._temp.analysis-tooling..github.semgrep-rules.kavach-unrestricted-tool')).toBe('kavach-unrestricted-tool');
    expect(displayFindingMessage('Vulnerability CVE-2026-42561 Link: [CVE-2026-42561](https://example.test/cve)')).toBe('Vulnerability CVE-2026-42561 Link: CVE-2026-42561');
  });
  it('keeps coverage limitations distinct from completed evidence',()=>{
    expect(isCompleteChannelStatus('COMPLETED_OPTIONAL')).toBe(true);
    expect(isCompleteChannelStatus('DEFERRED')).toBe(false);
    expect(isCompleteChannelStatus('NOT_APPLICABLE')).toBe(false);
  });
});
