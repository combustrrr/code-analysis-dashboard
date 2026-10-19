import { Alert,Descriptions, Tabs, Typography } from 'antd';
import {parseAppRoute,routeHash} from './appRoutes';
import { Connections } from './Integration';
import type { useLaunchAuth } from './useLaunchAuth';

type Auth = ReturnType<typeof useLaunchAuth>;
type Props = { auth: Auth; repository?: string; project?: string; source?: string; host?: string; publisher?: string; endpoint?: string; start: () => void; canLaunch?:boolean; canConfigure?:boolean; report?: any; target?: any; index?: any };

export function Settings({ auth, repository, project, source, host, publisher, endpoint, start, canLaunch, canConfigure, report, target, index }: Props) {
  const current=parseAppRoute();
  const section=current.kind==='settings'&&current.section||'connections';
  const select = (key: string) => { if(project)location.hash=routeHash({kind:'settings',projectId:project,repository,section:key}); };
  return <section className="settings-panel" aria-label="Settings">
     <Typography.Title level={2}>Connections and readiness</Typography.Title>
     <Typography.Paragraph>Inspect the trusted execution host, configured project profile, and workflow readiness. These values are centrally managed and read-only here.</Typography.Paragraph>
     <Alert type="info" showIcon title="Configuration is version controlled" description={canConfigure&&host?<span>Maintainers can <a href={`https://github.com/${host}/commits/main/.github/code-analysis/projects.json`} target="_blank" rel="noreferrer">review configuration history on GitHub</a> and propose changes through the repository workflow.</span>:'Dashboard settings cannot change the trusted project registry or scanner policy.'}/>
     <Tabs activeKey={section} onChange={select} items={[
       { key: 'connections', label: 'Connections', children: <Connections repository={repository} project={project} auth={auth} source={source} host={host} publisher={publisher} endpoint={endpoint} start={start} canLaunch={canLaunch} /> },
      { key: 'provenance', label: 'Provenance', children: <div className="insights-grid"><article className="panel"><h2>Analysis identity</h2><Descriptions column={1} items={[{key:'source',label:'Source repository',children:target?.source_repository || source || 'Unavailable'},{key:'target',label:'Branch or pull request',children:target?.label || 'Unavailable'},{key:'sha',label:'Analyzed revision',children:<code>{report?.analyzed_sha || target?.head_sha || 'Unavailable'}</code>},{key:'tooling',label:'Trusted tooling revision',children:<code>{report?.tooling_sha || 'Unavailable'}</code>},{key:'attempt',label:'Producer attempt',children:report?.producer_run_attempt ?? 'Unavailable'},{key:'schema',label:'Collection schema',children:index?.schema_version || 'Unavailable'}]} /></article><article className="panel"><h2>Producing workflows</h2><p>These exact runs produced the displayed report.</p>{(report?.producer_runs || []).map((run: any) => <div className="origin" key={run.id}><a href={run.url} target="_blank" rel="noreferrer">Run #{run.id}</a></div>)}<h3>Evidence gate</h3><p>{report?.publication_gate?.satisfied ? 'Passed' : 'Not satisfied or unavailable'}</p></article></div> }
    ]} />
  </section>;
}
