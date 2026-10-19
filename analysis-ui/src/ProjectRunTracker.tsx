import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Space } from 'antd';
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
  queued: 'Analysis queued — the previous report is still being shown.',
  scanning: 'Analysis is running against the selected revision.',
  running: 'Analysis is running against the selected revision.',
  collecting: 'Collecting scanner results.',
  publishing: 'Analysis finished; validating and publishing the report.',
  published: 'New report published for this request.',
  reused: 'Matching retained channel evidence was reused; no new scan was launched.',
  failed: 'Analysis failed. The previous published report is unchanged.',
  superseded: 'This request was superseded by a newer analysis request.',
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
  const title = phase ? phaseCopy[phase] || `Analysis status: ${phase}` : error ? 'Could not refresh analysis status' : auth.session ? 'Checking analysis status…' : 'Sign in to resume analysis tracking';
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
      <p><strong>{request.source_repository||request.repository}</strong> · {request.kind} <code>{request.ref}</code>{request.target_sha&&<> · pinned <code>{request.target_sha}</code></>} · execution <code>{request.repository}</code> · submitted {new Date(request.submittedAt).toLocaleString()} · request <code>{request.request_id}</code></p>
      {request.pr_context&&<p>PR head {request.pr_context.head_repository}:{request.pr_context.head_branch} at <code>{request.pr_context.head_sha}</code>; base {request.pr_context.base_repository}:{request.pr_context.base_branch} at <code>{request.pr_context.base_sha}</code>.</p>}
      {request.requested_channels&&<p>Requested channels: {request.requested_channels.join(', ')}</p>}
      {(activity?.queue_position||request.queue_position)&&<p>FIFO queue position: <strong>{activity?.queue_position||request.queue_position}</strong>. One source-revision request is active globally.</p>}
      <p>{activity?.message || activity?.error || previousReportNote}</p>
      {activity?.source_sha && <p>Resolved source commit: <code>{activity.source_sha}</code></p>}
      {activity?.producer && <p>Scanner workflow, attempt {activity.producer.attempt}: {activity.producer.status}</p>}
      {!!activity?.channel_progress?.length&&<div className="channel-progress"><strong>Channel progress</strong>{activity.channel_progress.map(channel=><span key={channel.channel} className={`channel-progress-item channel-${channel.status}`}>{channel.channel}: {channel.status.replaceAll('_',' ')}{channel.evidence_reused?' · retained evidence reused':''}{channel.last_attempt_status?` · latest attempt ${channel.last_attempt_status.toLowerCase()}`:''}{channel.reason?` · ${channel.reason}`:''}</span>)}</div>}
      {activity?.completeness && <p>Published report completeness: {activity.completeness}</p>}
      {error && <p>{error}. The request remains recorded; retrying the status check will not launch another scan.</p>}
      <Space wrap>
        {request.run_id && <a href={`https://github.com/${request.repository}/actions/runs/${request.run_id}`} target="_blank" rel="noreferrer">Request workflow #{request.run_id}</a>}
        {activity?.producer?.url && <a href={activity.producer.url} target="_blank" rel="noreferrer">Scanner workflow attempt {activity.producer.attempt}</a>}
        {publishedTargetId && <Button size="small" type="primary" onClick={() => onOpenReport(publishedTargetId)}>Open published report</Button>}
        {!terminal && auth.session && <Button size="small" loading={checking} onClick={() => setRetry(value => value + 1)}>Check status now</Button>}
        {terminal && <Button size="small" onClick={onDismiss}>Dismiss</Button>}
      </Space>
    </>}
  />;
}
