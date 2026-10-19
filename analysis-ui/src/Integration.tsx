import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Space, Steps, Tag } from 'antd';
import { applicationEndpoint } from './repositoryReports';
import type { useLaunchAuth } from './useLaunchAuth';

type Auth = ReturnType<typeof useLaunchAuth>;
type Configuration = { source_repository: string; analysis_repository: string; publishing_repository?: string; workflow_branch: string; workflow_state: string; configuration_matches: boolean; ready: boolean; enabled_scanners: string[]; checked_at: string; report_budget_bytes?: number; report_storage?: { compressed_bytes: number|null; remaining_bytes: number|null; history_points: number }; storage_backend?: string };
type ChannelReadiness = { channel: string; status: 'profile_declared' | 'deferred' | 'setup_required'; reason: string; last_observed: {status:string;reason:string|null;findings:number|null;checked_at:string|null}|null };
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
  return <section className="connections-panel">
    <h2>Application connections</h2><p>Verify the selected source project, GitHub authorization, scanner workflows, and current-report storage.</p>
    <Steps responsive={false} titlePlacement="vertical" items={[{title:'Git repository'}, {title:'Cloudflare login'}, {title:'GitHub Actions'}, {title:'Dashboard'}]} current={-1}/>
    <Descriptions column={1} bordered items={[
      {key:'source',label:'Source codebase',children:source || 'Unavailable'},
      {key:'gateway',label:'Authentication and launch gateway',children:endpoint || applicationEndpoint || 'Not configured'},
      {key:'analysis',label:'Scanner execution repository',children:host ? <a href={`https://github.com/${host}/actions`} target="_blank" rel="noreferrer">{host}</a> : 'Unavailable'},
      {key:'reports',label:'Current report storage',children:configuration?.storage_backend ? `${configuration.storage_backend}` : (publisher ? 'GitHub Releases' : 'Unavailable')},
      configuration?.report_budget_bytes ? {key:'budget',label:'Report storage budget',children:humanBytes(configuration.report_budget_bytes)} : undefined,
       configuration?.report_storage ? {key:'usage',label:'Storage used / remaining',children:`${humanBytes(configuration.report_storage.compressed_bytes)} / ${humanBytes(configuration.report_storage.remaining_bytes ?? (configuration.report_budget_bytes != null && configuration.report_storage.compressed_bytes != null ? Math.max(0, configuration.report_budget_bytes - configuration.report_storage.compressed_bytes) : null))}`} : undefined,
      {key:'identity',label:'GitHub session',children:auth.session ? `Signed in as ${auth.session.login}` : 'Not signed in'},
    ].filter(Boolean) as any}/>
     <Space wrap>{auth.session ? <><Button loading={busy} onClick={() => setRefresh(n => n + 1)}>Verify connections</Button><Button onClick={auth.signOut}>Sign out</Button></> : <Button disabled={!auth.available} onClick={auth.signIn}>Sign in to verify connections</Button>}{canLaunch&&<Button type="primary" disabled={!auth.session || busy || !configuration?.ready} onClick={start}>Choose revision to analyze</Button>}</Space>
    {(error || auth.error) && <Alert showIcon type="error" title="Connection check unavailable" description={error || auth.error}/>}
     {configuration && <Alert showIcon type={configuration.ready ? 'success' : 'warning'} title={configuration.ready ? 'Trusted workflow reachable' : 'Workflow or profile needs attention'} description={<><p>Profile identity match: {configuration.configuration_matches ? 'yes' : 'no'}. Workflow state: {configuration.workflow_state}. Trusted workflow branch: {configuration.workflow_branch}. Checked {new Date(configuration.checked_at).toLocaleString()}.</p><p>{configuration.enabled_scanners.length} profile-declared channels: {configuration.enabled_scanners.join(', ')}.</p><p>Reachability does not verify vendor credentials or prove that any scanner completed. Use the last-observed evidence and current report completeness below.</p></>}/>}
     {readiness && <section className="channel-readiness" aria-label="Scanner channel readiness"><h3>Profile and observed evidence</h3><p>Profile declaration, workflow reachability, and scanner evidence are separate states.</p>{readiness.channels.length ? <ul>{readiness.channels.map(channel => <li key={channel.channel}><Tag color={channel.status === 'profile_declared' ? 'blue' : channel.status === 'deferred' ? 'default' : 'orange'}>{channel.status.replaceAll('_', ' ')}</Tag><strong>{channel.channel}</strong> {channel.reason} <Tag color={channel.last_observed?.status==='completed'?'green':channel.last_observed?'orange':'default'}>{channel.last_observed?`last observed: ${channel.last_observed.status.replaceAll('_',' ')}`:'last observed: not verified'}</Tag>{channel.last_observed?.reason&&<span> {channel.last_observed.reason}</span>}</li>)}</ul> : <p>No scanner channels are declared or deferred for this project.</p>}<p>Checked {new Date(readiness.checked_at).toLocaleString()}.</p></section>}
    <h3>How analysis reaches this application</h3><ol><li>Sign in and select a branch, PR, or full commit SHA.</li><li>Cloudflare checks your GitHub permissions and submits the request to the configured workflow.</li><li>GitHub resolves the source revision and queues the scanners. Source execution has no publishing credentials.</li><li>The publisher validates current evidence, updates the target report, and the dashboard fetches it. Superseded assets are cleaned after successful publication; report changes do not rebuild the UI.</li></ol>
     <p>Project identities and scanner profiles come from the versioned execution-repository registry. Only repository administrators can change that registry; source code remains read-only to analysis workflows.</p>
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
