import { useEffect, useState } from 'react';
import { Alert, Button, Collapse, Space, Tag } from 'antd';
import {CloudOutlined,CodeOutlined,DatabaseOutlined,DeploymentUnitOutlined} from '@ant-design/icons';
import { applicationEndpoint } from './repositoryReports';
import type { useLaunchAuth } from './useLaunchAuth';

type Auth = ReturnType<typeof useLaunchAuth>;
type Configuration = { source_repository: string; analysis_repository: string; publishing_repository?: string; workflow_branch: string; workflow_state: string; configuration_matches: boolean; ready: boolean; enabled_scanners: string[]; checked_at: string; report_budget_bytes?: number; report_storage?: { compressed_bytes: number|null; remaining_bytes: number|null; history_points: number }; storage_backend?: string };
type ChannelReadiness = { channel: string; status: 'profile_declared' | 'deferred' | 'setup_required' | 'not_available'; reason: string; last_observed: {status:string;reason:string|null;findings:number|null;checked_at:string|null}|null };
type ProjectReadiness = { channels: ChannelReadiness[]; checked_at: string };

export function Connections({ auth, source, host, publisher, endpoint, start, repository, project, canLaunch=true }: { repository?:string; project?:string; auth: Auth; source?: string; host?: string; publisher?: string; endpoint?: string; start: () => void; canLaunch?:boolean }) {
  const [configuration, setConfiguration] = useState<Configuration>();
  const [readiness, setReadiness] = useState<ProjectReadiness>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setConfiguration(undefined); setReadiness(undefined); setError(''); setBusy(!!auth.session);
    if (auth.session) {
      const integration = auth.api<Configuration>(repository && project ? `project-integration?${new URLSearchParams({project_id:project})}` : 'integration');
      const channels = repository && project ? auth.api<ProjectReadiness>(`project-readiness?${new URLSearchParams({project_id:project})}`) : Promise.resolve(undefined);
      Promise.all([integration, channels]).then(([value, channelReadiness]) => {
        if (!active) return;
        const mismatch = (source && value.source_repository !== source) || (host && value.analysis_repository !== host) || (publisher && value.publishing_repository !== publisher);
        if (mismatch) throw Error('Published dashboard and live service configuration disagree. Check the repository configuration before launching.');
        setConfiguration(value);
        setReadiness(channelReadiness);
      }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    }
    return () => { active = false; };
  }, [auth.session, source, host, publisher, repository, project, refresh]);
  const humanBytes=(n?:number|null)=>typeof n==='number'&&n>=0? (n>950_000_000? (n/1_000_000_000).toFixed(2)+' GB' : (n/1_000_000).toFixed(1)+' MB') : 'Unavailable';
  const launchBlocked=!auth.session?'Sign in to choose a revision.':busy?'Connection verification is still running.':!configuration?.ready?'Resolve the workflow or profile warning before starting analysis.':'';
  const readinessGroups=readiness?[
    {key:'completed',label:'Completed evidence',channels:readiness.channels.filter(channel=>channel.last_observed?.status==='completed')},
    {key:'attention',label:'Needs attention',channels:readiness.channels.filter(channel=>(channel.last_observed&&channel.last_observed.status!=='completed')||channel.status==='setup_required'||channel.status==='not_available')},
    {key:'awaiting',label:'Awaiting evidence',channels:readiness.channels.filter(channel=>!channel.last_observed&&channel.status==='profile_declared')},
    {key:'deferred',label:'Deferred adapters',channels:readiness.channels.filter(channel=>channel.status==='deferred')},
  ].filter(group=>group.channels.length):[];
  const readinessItem=(channel:ChannelReadiness)=><li key={channel.channel}><div><strong>{channel.channel}</strong><p>{channel.reason}</p>{channel.last_observed?.reason&&<small>{channel.last_observed.reason}</small>}</div><div><Tag color={channel.status==='profile_declared'?'blue':channel.status==='deferred'?'default':'orange'}>{channel.status.replaceAll('_',' ')}</Tag><Tag color={channel.last_observed?.status==='completed'?'green':channel.last_observed?'orange':'default'}>{channel.last_observed?`Last observed: ${channel.last_observed.status.replaceAll('_',' ')}`:'Not observed'}</Tag></div></li>;
  return <section className="connections-panel">
    <div className="connection-flow" aria-label="Analysis trust boundary"><div><CodeOutlined/><span>Source</span><strong>{source||'Unavailable'}</strong></div><i/><div><CloudOutlined/><span>Access gateway</span><strong>{auth.session?`@${auth.session.login}`:'Not signed in'}</strong></div><i/><div><DeploymentUnitOutlined/><span>Isolated scanners</span><strong>{host||'Unavailable'}</strong></div><i/><div><DatabaseOutlined/><span>Report storage</span><strong>{configuration?.storage_backend||(publisher?'GitHub Releases':'Unavailable')}</strong></div></div>
    <div className="connections-grid"><article className="connections-group"><span>Execution identity</span><dl><div><dt>Source codebase</dt><dd><code>{source||'Unavailable'}</code></dd></div><div><dt>Workflow repository</dt><dd>{host?<a href={`https://github.com/${host}/actions`} target="_blank" rel="noreferrer"><code>{host}</code></a>:'Unavailable'}</dd></div><div><dt>Trusted branch</dt><dd><code>{configuration?.workflow_branch||'Not verified'}</code></dd></div><div><dt>Workflow state</dt><dd>{configuration?.workflow_state||'Not verified'}</dd></div></dl></article><article className="connections-group"><span>Gateway and storage</span><dl><div><dt>Authentication gateway</dt><dd><code>{endpoint||applicationEndpoint||'Not configured'}</code></dd></div><div><dt>Storage backend</dt><dd>{configuration?.storage_backend||(publisher?'GitHub Releases':'Unavailable')}</dd></div>{configuration?.report_budget_bytes&&<div><dt>Storage budget</dt><dd>{humanBytes(configuration.report_budget_bytes)}</dd></div>}{configuration?.report_storage&&<div><dt>Used / remaining</dt><dd>{humanBytes(configuration.report_storage.compressed_bytes)} / {humanBytes(configuration.report_storage.remaining_bytes??(configuration.report_budget_bytes!=null&&configuration.report_storage.compressed_bytes!=null?Math.max(0,configuration.report_budget_bytes-configuration.report_storage.compressed_bytes):null))}</dd></div>}</dl></article></div>
    {configuration&&<Alert
      showIcon
      type={configuration.ready?'success':'warning'}
      title={configuration.ready?'Connection verified':'Connection needs attention'}
      description={configuration.ready?`The trusted workflow is reachable and ${configuration.enabled_scanners.length} scanner channels are declared. This does not mean those scanners completed. Checked ${new Date(configuration.checked_at).toLocaleString()}.`:`The configured project identity or workflow is not ready. Profile identity match: ${configuration.configuration_matches?'yes':'no'}. Workflow state: ${configuration.workflow_state}.`}
    />}
    {(error||auth.error)&&<Alert showIcon type="error" title="Connections could not be verified" description={`${error||auth.error} Check the selected project and try again.`}/>}
    <div className="connection-actions"><Space wrap>{auth.session?<><Button loading={busy} onClick={()=>setRefresh(n=>n+1)}>Verify connections</Button><Button onClick={auth.signOut}>Sign out</Button></>:<Button disabled={!auth.available} onClick={auth.signIn}>Sign in to verify</Button>}{canLaunch&&<Button type="primary" disabled={Boolean(launchBlocked)} onClick={start}>Run analysis</Button>}</Space>{canLaunch&&launchBlocked&&<p>{launchBlocked}</p>}</div>
    {readiness&&<section className="channel-readiness" aria-label="Scanner channel readiness"><header><div><span>Scanner readiness</span><h3>Declared profile and observed evidence</h3></div><small>Checked {new Date(readiness.checked_at).toLocaleString()}</small></header>{readinessGroups.length?<><div className="readiness-summary">{readinessGroups.map(group=><div key={group.key}><strong>{group.channels.length}</strong><span>{group.label}</span></div>)}</div><Collapse className="readiness-groups" ghost items={readinessGroups.map(group=>({key:group.key,label:<><strong>{group.label}</strong><span>{group.channels.length}</span></>,children:<ul>{group.channels.map(readinessItem)}</ul>}))}/></>:<p>No scanner channels are declared or deferred for this project.</p>}<footer>Workflow reachability does not prove that vendor credentials are valid or that every scanner completed. The published report remains the evidence of record.</footer></section>}
  </section>;
}

export function RequestStatus({ auth, runId }: { auth: Auth; runId?: number }) {
  const [run, setRun] = useState<{status: string; conclusion: string | null; attempt: number; checked_at: string}>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; let timer: number | undefined;
    setRun(undefined); setError('');
    async function update() {
      try {
        const value = await auth.api<NonNullable<typeof run>>(`runs/${runId}`);
        if (!active) return;
        if (typeof value.status !== 'string') throw Error('Request status is unavailable. Use the GitHub request link.');
        setRun(value); setError('');
        if (value.status !== 'completed') timer = window.setTimeout(update, 20000);
      } catch(e) { if (active) setError(e instanceof Error ? e.message : 'Request status unavailable.'); }
    }
    if (auth.session && runId) void update();
    return () => { active = false; window.clearTimeout(timer); };
  }, [auth.session, runId]);
  if (!runId) return null;
  return <div className="request-status" role="status">{!auth.session ? 'Sign in to check the request workflow directly.' : error || !run ? error || 'Checking request workflow…' : <><Tag color={run.conclusion === 'success' ? 'green' : run.conclusion ? 'orange' : 'blue'}>Request workflow: {run.conclusion || run.status}</Tag><span>Attempt {run.attempt}. Checked {new Date(run.checked_at).toLocaleTimeString()}.</span><p>{run.conclusion === 'success' ? 'Discovery completed. Scanner execution and report publication are separate stages; check the target status and producing runs below.' : run.status === 'completed' ? 'The request workflow did not succeed. Inspect its GitHub log before retrying; a new report is not confirmed.' : 'GitHub is processing the request. This is not a scanner completion status.'}</p></>}</div>;
}
