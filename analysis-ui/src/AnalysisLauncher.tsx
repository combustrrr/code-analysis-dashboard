import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Input, Modal, Segmented, Select, Space, Tag, Typography } from 'antd';
import { GithubOutlined, PlayCircleOutlined } from '@ant-design/icons';

type Target = { id: string; repository: string; source_repository: string; kind: string; branch: string; pr?: number; label: string; head_sha: string; base_branch?: string; checked_at: string };
export type LaunchRequest = { kind: string; ref: string; url: string; submittedAt: string; runId?: number };
type Auth = ReturnType<typeof import('./useLaunchAuth').useLaunchAuth>;
type Props = { onSubmitted: (request: LaunchRequest) => void; auth: Auth; open: boolean; close: () => void; repository?: string; host?: string; workflowBranch?: string; preferredBranch?: string; targets: Target[]; initial?: Target; follow: (target: string) => void; channelCount?: number; completedChannels?: number; queued?: number; scanning?: number };

export function AnalysisLauncher({ onSubmitted, auth, open, close, repository, host, workflowBranch, preferredBranch, targets, initial, follow, queued, scanning }: Props) {
  const [kind, setKind] = useState(initial?.kind || 'branch');
  const [value, setValue] = useState(initial?.kind === 'commit' ? initial.head_sha : initial?.kind === 'pr' ? String(initial.pr) : initial?.branch || preferredBranch || '');
  const [liveTargets, setLiveTargets] = useState<Target[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [submitted, setSubmitted] = useState<{ url: string; run_id?: number }>();

  useEffect(() => {
    let active = true;
    setLiveTargets(undefined);
    if (auth.session) auth.api<{ repository: string; analysis_repository: string; targets: Target[] }>('targets').then(data => {
      if (!active) return;
      if (data.repository !== repository || data.analysis_repository !== host) throw new Error('Launcher configuration does not match this dashboard.');
      setLiveTargets(data.targets); setError('');
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [auth.session, repository, host, refresh]);

  const choices = auth.session ? liveTargets || [] : targets;
  const input = value.trim();
  const selected = choices.find(target => target.kind === kind && (kind === 'pr' ? String(target.pr) === input : kind === 'commit' ? target.head_sha.toLowerCase() === input.toLowerCase() : target.branch === input));
  const valid = !!repository && !!host && (kind === 'commit' ? /^[a-fA-F0-9]{40}$/.test(input) : kind === 'pr' ? /^[1-9][0-9]*$/.test(input) : !!selected);
  const ref = kind === 'commit' ? input.toLowerCase() : input;

  const reset = (next: string) => { setValue(next); setError(''); setSubmitted(undefined); };
  const launch = async () => {
    if (!valid || busy || submitted) return;
    setBusy(true); setError('');
    const submittedAt = new Date().toISOString();
    try {
      const result = await auth.api<{ url: string; run_id?: number }>('launch', { repository, kind, ref });
      setSubmitted(result);
      onSubmitted({ kind, ref, url: result.url, submittedAt, runId: result.run_id });
    } catch (e) { setError(e instanceof Error ? e.message : 'Launch failed.'); }
    finally { setBusy(false); }
  };
  const viewResults = () => {
    const current = targets.find(target => target.kind === kind && (kind === 'pr' ? String(target.pr) === ref : kind === 'commit' ? target.head_sha.toLowerCase() === ref : target.branch === ref));
    if (current) follow(current.id);
    close();
  };

  return <Modal className="launch-modal" title={<div className="launch-title"><span>RUN ANALYSIS</span><strong>Choose a revision and start</strong><p>Run the configured scanners against a branch, pull request, or exact commit.</p></div>} open={open} onCancel={busy ? undefined : close} closable={!busy} maskClosable={!busy} keyboard={!busy} footer={null} width={700}>
    <div className="analysis-launcher direct-launcher">
      <section className="launch-section">
        <h3>Repository</h3>
        <div className="project-choice" role="group" aria-label="Analysis repository"><GithubOutlined/><div><small>CONFIGURED CODEBASE</small><strong>{repository || 'Configuration unavailable'}</strong><p>Scanners run read-only against the selected revision.</p></div></div>
        <div className="launch-meta"><span>Execution repository <Typography.Text code>{host || 'Unavailable'}</Typography.Text></span><span>Workflow branch <Typography.Text code>{workflowBranch || 'Unavailable'}</Typography.Text></span></div>
      </section>

      <section className="launch-section">
        <div className="launch-section-heading"><h3>Revision</h3>{auth.session && <Button size="small" onClick={() => setRefresh(n => n + 1)}>Refresh GitHub</Button>}</div>
        <Segmented block aria-label="Revision type" value={kind} options={[{ label: 'Branch', value: 'branch' }, { label: 'Pull request', value: 'pr' }, { label: 'Full commit SHA', value: 'commit' }]} onChange={next => { setKind(next); reset(next === 'branch' ? preferredBranch || '' : ''); }}/>
        {kind !== 'commit' && <Select className="revision-picker" aria-label="Available analysis targets" loading={!!auth.session && !liveTargets} showSearch optionFilterProp="label" placeholder={kind === 'branch' ? 'Select a branch' : 'Select an open pull request'} value={selected ? input : undefined} options={choices.filter(target => target.kind === kind).map(target => ({ value: kind === 'pr' ? String(target.pr) : target.branch, label: target.label }))} onChange={reset}/>} 
        {kind !== 'branch' && <Input aria-label="Analysis target" value={value} onChange={event => reset(event.target.value)} placeholder={kind === 'commit' ? 'Paste the full 40-character commit SHA' : 'Enter a pull request number'}/>} 
        {kind === 'commit' && input && !valid && <Alert type="warning" title="Enter the full 40-character commit SHA."/>}
        {kind === 'pr' && input && !valid && <Alert type="warning" title="Enter a positive pull request number."/>}
        {(selected || kind === 'commit' && valid) && <div className="revision-preview"><Descriptions column={1} size="small" items={[
          { key: 'source', label: 'Source repository', children: selected?.source_repository || repository },
          { key: 'sha', label: kind === 'commit' ? 'Commit SHA' : 'Current head', children: <Typography.Text copyable code>{kind === 'commit' ? ref : selected?.head_sha}</Typography.Text> },
          ...(kind === 'pr' ? [{ key: 'base', label: 'PR target branch', children: selected?.base_branch || 'Resolved by GitHub' }] : []),
        ]}/></div>}
      </section>

      {!auth.session && auth.available && <Alert type="info" showIcon title="Sign in with GitHub to start analysis" description="Authentication is required before the dashboard can dispatch the analysis workflow." action={<Button type="primary" icon={<GithubOutlined/>} onClick={auth.signIn}>Sign in</Button>}/>} 
      {!auth.available && <Alert type="info" title="Direct launching is unavailable" description="Use the configured GitHub Actions workflow to launch this analysis."/>}
      {auth.session && <section className="launch-section launch-action"><Space direction="vertical" size="small" style={{width: '100%'}}><Tag color="green">Signed in as {auth.session.login}</Tag><Button block size="large" icon={<PlayCircleOutlined aria-hidden="true"/>} type="primary" loading={busy} disabled={!valid || !liveTargets || !!submitted} onClick={launch}>Run analysis</Button><small>{queued ?? 'Unavailable'} queued / {scanning ?? 'Unavailable'} scanning. A fresh report replaces the selected target after validation.</small></Space></section>}
      {submitted && <Alert type="success" showIcon title="Analysis started" description={<><p>GitHub accepted the analysis request. Results will appear after scanning and publication.</p><Space><Button href={submitted.url} target="_blank" rel="noreferrer">Track workflow</Button><Button onClick={viewResults}>View dashboard results</Button></Space></>}/>} 
      {(error || auth.error) && <Alert type="error" title="Analysis launcher" description={error || auth.error}/>} 
    </div>
  </Modal>;
}
