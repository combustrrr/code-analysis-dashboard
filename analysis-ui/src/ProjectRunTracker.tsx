import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import type { useLaunchAuth } from './useLaunchAuth';
import { refreshRepositoryReports } from './repositoryReports';

type Auth = ReturnType<typeof useLaunchAuth>;
export type ProjectRunRequest = {
  repository: string;
  source_repository?: string;
  project: string;
  kind: string;
  ref: string;
  target_sha?: string;
  requested_channels?: string[];
  pr_context?: {head_repository:string;head_branch:string;head_sha:string;base_repository:string;base_branch:string;base_sha:string};
  channel_progress?: {channel:string;status:string;reason?:string;evidence_reused?:boolean;last_attempt_status?:string}[];
  request_id: string;
  run_id: number | null;
  queue_position?: number | null;
  submittedAt: string;
  previousReport?: string;
  previousTargetLabel?: string;
  previousAnalyzedSha?: string;
  previousGeneratedAt?: string;
  phase?: string;
};
type Activity = {
  phase: string;
  request_id?: string;
  target_id?: string;
  source_sha?: string;
  analyzed_sha?: string;
  completeness?: string;
  error?: string;
  message?: string;
  queue_position?: number | null;
  channel_progress?: {channel:string;status:string;reason?:string;evidence_reused?:boolean;last_attempt_status?:string}[];
  producer?: { url: string; attempt: number; status: string };
  checked_at?: string;
};

const terminalPhases = new Set(['published', 'reused', 'failed', 'superseded']);
const phaseCopy: Record<string, string> = {
  queued: 'Preparing analysis',
  scanning: 'Analyzing the selected revision',
  running: 'Analyzing the selected revision',
  collecting: 'Preparing your results',
  publishing: 'Preparing your results',
  published: 'Analysis ready',
  reused: 'Analysis ready',
  failed: 'Analysis needs attention',
  superseded: 'A newer analysis is available',
};

export function ProjectRunTracker({ auth, request, onDismiss, onOpenReport, onPhase }: {
  auth: Auth;
  request: ProjectRunRequest;
  onDismiss: () => void;
  onOpenReport: (targetId: string) => void;
  onPhase: (requestId: string, phase: string) => void;
}) {
  const [activity, setActivity] = useState<Activity>();
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [retry, setRetry] = useState(0);
  const publishedRequest = useRef('');
  const onPhaseRef = useRef(onPhase);
  useEffect(() => { onPhaseRef.current = onPhase; }, [onPhase]);

  const checkStatus = useCallback(async () => {
    if (!auth.session) return undefined;
    setChecking(true);
    try {
      const query = new URLSearchParams({
        project_id: request.project,
        request_id: request.request_id,
      });
      const result = await auth.api<Activity>(`project-activity?${query}`);
      setActivity(result);
      setError('');
      onPhaseRef.current(request.request_id, result.phase);
      if (result.phase === 'published' && publishedRequest.current !== request.request_id) {
        publishedRequest.current = request.request_id;
        refreshRepositoryReports();
        window.dispatchEvent(new Event('analysis-report-published'));
      }
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Analysis status is temporarily unavailable.');
      return undefined;
    } finally {
      setChecking(false);
    }
  }, [auth, request.repository, request.project, request.request_id]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let delay = 15000;
    const poll = async () => {
      if (!auth.session) return;
      if (document.visibilityState === 'visible') {
        const result = await checkStatus();
        if (!active) return;
        if (result && terminalPhases.has(result.phase)) return;
        delay = result ? 15000 : Math.min(delay * 2, 120000);
      }
      if (active) timer = window.setTimeout(poll, delay);
    };
    setActivity(undefined);
    setError('');
    void poll();
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [auth.session, checkStatus, request.request_id, retry]);

  const phase = activity?.phase;
  const terminal = !!phase && terminalPhases.has(phase);
  const publishedTargetId = phase === 'published' || phase === 'reused' ? activity?.target_id : undefined;
  const type = phase === 'published' || phase === 'reused' ? 'success' : phase === 'failed' ? 'error' : phase === 'superseded' ? 'warning' : 'info';
  const title = phase ? phaseCopy[phase] || 'Analysis in progress' : error ? 'Could not refresh analysis status' : auth.session ? 'Checking analysis status…' : 'Sign in to resume analysis tracking';
  const previousReportNote = phase === 'published'
    ? `This request published its report${activity?.analyzed_sha ? ` for commit ${activity.analyzed_sha.slice(0, 12)}` : ''}. Refreshing the selected report inventory now.`
    : request.previousReport
    ? `The currently displayed report is for ${request.previousTargetLabel || 'the previously selected target'}${request.previousAnalyzedSha ? ` at commit ${request.previousAnalyzedSha.slice(0, 12)}` : ''}${request.previousGeneratedAt ? `, published ${new Date(request.previousGeneratedAt).toLocaleString()}` : ''}. It will remain visible until this request publishes.`
    : 'No previous report was captured for this target. Results will appear here after publication.';

  return <Alert
    className="project-run-tracker"
    type={type}
    showIcon
    title={title}
    description={<>
      <p><strong>{request.source_repository||request.repository}</strong> · {request.kind} <code>{request.ref}</code>{request.target_sha&&<> · <code>{request.target_sha.slice(0,12)}</code></>} · started {new Date(request.submittedAt).toLocaleString()}</p>
      <p>{activity?.error || previousReportNote}</p>
      {error && <p>Status refresh is temporarily unavailable. Your analysis was not restarted.</p>}
      <div className="run-tracker-actions">
        {publishedTargetId && <Button size="small" type="primary" onClick={() => onOpenReport(publishedTargetId)}>Review issues</Button>}
        {!terminal && auth.session && <Button size="small" loading={checking} onClick={() => setRetry(value => value + 1)}>Refresh</Button>}
        {terminal && <Button size="small" onClick={onDismiss}>Dismiss</Button>}
      </div>
    </>}
  />;
}
