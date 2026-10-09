import { Descriptions, Tabs, Typography } from 'antd';
import { Connections } from './Integration';
import { Repositories } from './Repositories';
import type { useLaunchAuth } from './useLaunchAuth';

type Auth = ReturnType<typeof useLaunchAuth>;
type Props = { auth: Auth; repository?: string; project?: string; source?: string; host?: string; publisher?: string; endpoint?: string; start: () => void; report?: any; target?: any; index?: any };

export function Settings({ auth, repository, project, source, host, publisher, endpoint, start, report, target, index }: Props) {
  const params = new URLSearchParams(location.hash.slice(1));
  const legacy = params.get('tab');
  const section = params.get('section') || (legacy && ['connections', 'repositories', 'provenance'].includes(legacy) ? legacy : 'connections');
  const select = (key: string) => { params.set('tab', 'settings'); params.set('section', key); location.hash = params.toString(); };
  return <section className="settings-panel" aria-label="Settings">
    <Typography.Title level={2}>Settings</Typography.Title>
    <Typography.Paragraph>Manage GitHub access, repository integrations, and evidence provenance. These checks describe verified configuration; they do not claim scanner completion.</Typography.Paragraph>
    <Tabs activeKey={section} onChange={select} items={[
      { key: 'connections', label: 'Connections', children: <Connections repository={repository} project={project} auth={auth} source={source} host={host} publisher={publisher} endpoint={endpoint} start={start} /> },
      { key: 'repositories', label: 'Repositories', children: <Repositories auth={auth} endpoint={endpoint} /> },
      { key: 'provenance', label: 'Provenance', children: <div className="insights-grid"><article className="panel"><h2>Analysis identity</h2><Descriptions column={1} items={[{key:'source',label:'Source repository',children:target?.source_repository || source || 'Unavailable'},{key:'target',label:'Branch or pull request',children:target?.label || 'Unavailable'},{key:'sha',label:'Analyzed revision',children:<code>{report?.analyzed_sha || target?.head_sha || 'Unavailable'}</code>},{key:'tooling',label:'Trusted tooling revision',children:<code>{report?.tooling_sha || 'Unavailable'}</code>},{key:'attempt',label:'Producer attempt',children:report?.producer_run_attempt ?? 'Unavailable'},{key:'schema',label:'Collection schema',children:index?.schema_version || 'Unavailable'}]} /></article><article className="panel"><h2>Producing workflows</h2><p>These exact runs produced the displayed report.</p>{(report?.producer_runs || []).map((run: any) => <div className="origin" key={run.id}><a href={run.url} target="_blank" rel="noreferrer">Run #{run.id}</a></div>)}<h3>Evidence gate</h3><p>{report?.publication_gate?.satisfied ? 'Passed' : 'Not satisfied or unavailable'}</p></article></div> }
    ]} />
  </section>;
}
