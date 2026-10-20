import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Collapse, Progress } from 'antd';
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
  channel_progress?: {channel:string;status:string;reason?:string;evidence_reused?:boolean;last_attempt_status?:string}[];
  producer?: { run_id?: number; url: string; attempt: number; status: string; conclusion?: string | null };
  checked_at?: string;
};

const terminalPhases = new Set(['published', 'reused', 'failed', 'superseded']);
const phaseCopy: Record<string, string> = {
  preparing: 'Preparing',
  scanning: 'Analyzing',
  running: 'Analyzing',
  analyzing: 'Analyzing',
  collecting: 'Preparing',
  publishing: 'Preparing',
  published: 'Ready',
  reused: 'Ready',
  failed: 'Needs attention',
  superseded: 'Ready',
  cancelled_cutover: 'Needs attention',
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
  const [now,setNow]=useState(Date.now());
  const publishedRequest = useRef('');
  const openedRequest = useRef('');
  const onPhaseRef = useRef(onPhase);
  const onOpenReportRef = useRef(onOpenReport);
  useEffect(() => { onPhaseRef.current = onPhase; }, [onPhase]);
  useEffect(() => { onOpenReportRef.current = onOpenReport; }, [onOpenReport]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),30000);return()=>window.clearInterval(timer);},[]);

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
        if (result.target_id && window.location.hash.includes(`/projects/${request.project}`) && openedRequest.current !== request.request_id) {
          openedRequest.current = request.request_id;
          window.setTimeout(() => onOpenReportRef.current(result.target_id!), 1500);
        }
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
  const title = phase ? phaseCopy[phase] || 'Analysis in progress' : error ? 'Could not refresh the analysis status' : auth.session ? 'Checking analysis status…' : 'Sign in to resume tracking this analysis';
  const previousReportNote = phase === 'published'
    ? `Results are ready${activity?.analyzed_sha ? ` for commit ${activity.analyzed_sha.slice(0, 12)}` : ''}. Opening the report now.`
    : request.previousReport
    ? `The currently displayed report is for ${request.previousTargetLabel || 'the previously selected target'}${request.previousAnalyzedSha ? ` at commit ${request.previousAnalyzedSha.slice(0, 12)}` : ''}${request.previousGeneratedAt ? `, published ${new Date(request.previousGeneratedAt).toLocaleString()}` : ''}. It will remain visible until this request publishes.`
    : 'No previous report is available for this target. Results will appear here after publication.';
  const elapsedMinutes=Math.max(0,Math.floor((now-new Date(request.submittedAt).getTime())/60000));
  const progress=activity?.channel_progress||request.channel_progress||[];
  const finished=progress.filter(channel=>['completed','failed','reused','not_applicable','deferred'].includes(channel.status.toLowerCase())).length;
  const activeChannels=progress.filter(channel=>['active','running','analyzing','claimed'].includes(channel.status.toLowerCase()));
  const percent=progress.length>0?Math.round((finished/progress.length)*100):(terminal?100:8);
  const journeyStep=phase==='published'||phase==='reused'||phase==='superseded'?2:1;

  return <Alert
    className="project-run-tracker"
    type={type}
    showIcon
    title={title}
    description={<>
      <div className="analysis-journey" aria-label="Analysis journey">
        {['Choose', 'Analyze', 'Review'].map((label,index)=><div key={label} className={index<journeyStep?'done':index===journeyStep?'current':''}><span>{index+1}</span><b>{label}</b></div>)}
      </div>
      <Progress percent={percent} status={type==='error'?'exception':type==='success'?'success':'active'} showInfo={progress.length>0} />
      {progress.length>0&&<div className="analysis-progress-summary"><strong>{finished} of {progress.length} checks complete</strong>{activeChannels.length>0&&<span>Analysis is in progress.</span>}</div>}
      <p>{activity?.error || previousReportNote}</p>
      {!terminal&&<p className="analysis-time-note">You can keep reviewing the current report or leave this page. New results will open automatically when they are ready.</p>}
      {error && <p>The status could not be refreshed. The analysis was not restarted.</p>}
      <div className="run-tracker-actions">
        {publishedTargetId && <Button size="small" type="primary" onClick={() => onOpenReport(publishedTargetId)}>Open report</Button>}
        {!terminal && auth.session && <Button size="small" loading={checking} onClick={() => setRetry(value => value + 1)}>Refresh</Button>}
        {terminal && <Button size="small" onClick={onDismiss}>Dismiss</Button>}
      </div>
      <Collapse ghost size="small" className="run-technical-details" items={[{key:'details',label:'Technical details',children:<>
        <p><strong>{request.source_repository||request.repository}</strong> · {request.kind} <code>{request.ref}</code>{request.target_sha&&<> · <code>{request.target_sha.slice(0,12)}</code></>}</p>
        <p>Started {new Date(request.submittedAt).toLocaleString()} · elapsed {elapsedMinutes<1?'less than a minute':`${elapsedMinutes} minute${elapsedMinutes===1?'':'s'}`}</p>
        {progress.length>0&&<p>{finished} of {progress.length} channels finished{activeChannels.length>0?` · active: ${activeChannels.map(channel=>channel.channel).join(', ')}`:''}</p>}
        {activity?.producer?.url&&<Button size="small" href={activity.producer.url} target="_blank" rel="noreferrer">Open GitHub Actions</Button>}
      </>}]} />
    </>}
  />;
}
