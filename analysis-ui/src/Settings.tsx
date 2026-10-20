import {useEffect,useMemo,useState} from 'react';
import {Alert,Button,Descriptions,Empty,Select,Tabs,Tag,Typography} from 'antd';
import {Connections} from './Integration';
import {AppearanceToggle} from './Appearance';
import {applicationEndpoint} from './repositoryReports';
import {parseAppRoute,routeHash,type SettingsSection} from './appRoutes';
import trustLabLogo from './assets/trustlab-logo.jpg';
import mphasisLogo from './assets/mphasis-logo.jpg';
import type {useLaunchAuth} from './useLaunchAuth';

type Auth=ReturnType<typeof useLaunchAuth>;
type Project={id:string;source_repository:string;preferred_branch:string;relationship:string;readiness_summary?:{configured_channels:number;vendor_channels:number};current_report?:{status:string;analyzed_sha?:string;generated_at?:string|null}|null};
type Registry={execution_repository:{full_name:string};can_launch:boolean;can_configure:boolean;projects:Project[]};

export function Settings({auth,onRun}:{auth:Auth;onRun:(projectId:string)=>void}){
 const current=parseAppRoute();const route=current.kind==='settings'?current:{kind:'settings' as const,section:'general' as const};
 const [registry,setRegistry]=useState<Registry>();const [error,setError]=useState('');
 useEffect(()=>{let active=true;auth.api<Registry>('projects').then(value=>{if(active)setRegistry(value)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Settings are unavailable.')});return()=>{active=false}},[auth.session?.token]);
 const selected=useMemo(()=>registry?.projects.find(project=>project.id===route.projectId)||registry?.projects[0],[registry,route.projectId]);
 const selectSection=(section:string)=>location.hash=routeHash({kind:'settings',section:section as SettingsSection,projectId:selected?.id});
 const projectControl=registry&&<Select aria-label="Settings project" value={selected?.id} options={registry.projects.map(project=>({value:project.id,label:project.source_repository}))} onChange={projectId=>location.hash=routeHash({kind:'settings',section:route.section,projectId})}/>;
 return <main className="settings-workspace">
  <header className="settings-heading"><div><span className="eyebrow">SETTINGS</span><Typography.Title>Workspace configuration</Typography.Title><Typography.Paragraph>Manage appearance, project readiness, connections, and evidence details without leaving the workspace.</Typography.Paragraph></div>{route.section!=='general'&&projectControl}</header>
  {error&&<Alert type="error" showIcon title="Settings unavailable" description={error}/>}
  <Tabs tabPosition="left" activeKey={route.section} onChange={selectSection} items={[
   {key:'general',label:'General',children:<section className="settings-section"><div className="partner-lockup"><div><img src={trustLabLogo} alt="IIT Bombay Trust Lab"/><span>×</span><img src={mphasisLogo} alt="Mphasis"/></div><p>Code Analysis is a co-branded evidence workspace for traceable, read-only source analysis.</p></div><article className="settings-card"><h2>Appearance</h2><p>Dark mode is the production default. Your choice is kept in this browser.</p><AppearanceToggle/></article><article className="settings-card"><h2>Account</h2><Descriptions column={1} items={[{key:'login',label:'GitHub account',children:auth.session?.login||'Not signed in'},{key:'access',label:'Workspace access',children:'Authorized collaborator'}]}/><Button onClick={auth.signOut}>Sign out</Button></article></section>},
   {key:'projects',label:'Projects',children:<section className="settings-section"><h2>Trusted project registry</h2><p>These identities and preferred branches are centrally managed and read-only in the dashboard.</p>{registry?.projects.map(project=><article className="settings-project" key={project.id}><div><strong>{project.source_repository}</strong><small>Preferred branch <code>{project.preferred_branch}</code> · {project.relationship}</small></div><div>{project.readiness_summary&&<Tag>{project.readiness_summary.configured_channels} channels</Tag>}<Button href={routeHash({kind:'project',projectId:project.id,view:'overview'})}>Open project</Button></div></article>)||<Empty description="Loading projects…"/>}{registry?.can_configure&&<Alert type="info" showIcon title="Configuration is version controlled" description={<span>Review registry changes in <a href={`https://github.com/${registry.execution_repository.full_name}/commits/main/.github/code-analysis/projects.json`} target="_blank" rel="noreferrer">GitHub history</a>.</span>}/>}</section>},
   {key:'connections',label:'Connections & readiness',children:selected&&registry?<Connections auth={auth} repository={registry.execution_repository.full_name} project={selected.id} source={selected.source_repository} host={registry.execution_repository.full_name} endpoint={applicationEndpoint} canLaunch={registry.can_launch} start={()=>onRun(selected.id)}/>:<Empty description="Choose a project to inspect readiness."/>},
   {key:'provenance',label:'Evidence provenance',children:<section className="settings-section"><h2>Evidence and execution boundary</h2><p>Reports remain bound to immutable source and tooling revisions. Scanner execution cannot publish reports or write to analyzed repositories.</p>{selected?<Descriptions bordered column={1} items={[{key:'project',label:'Source project',children:selected.source_repository},{key:'branch',label:'Preferred branch',children:selected.preferred_branch},{key:'report',label:'Current report',children:selected.current_report?<><Tag>{selected.current_report.status}</Tag> <code>{selected.current_report.analyzed_sha||'Unavailable'}</code></>:'No retained report'},{key:'execution',label:'Execution repository',children:registry?.execution_repository.full_name||'Unavailable'},{key:'gateway',label:'Authentication and report gateway',children:applicationEndpoint||'Fixture mode'}]}/>:<Empty description="No configured project is available."/>}<Alert type="info" showIcon title="Detailed report provenance" description="Exact workflow runs, attempts, tooling revision, channel evidence, and limitations remain available inside each immutable report."/></section>}
  ]}/>
 </main>;
}
