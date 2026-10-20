import {useEffect,useMemo,useState} from 'react';
import {Alert,Button,Empty,Input,Tag} from 'antd';
import {SearchOutlined} from '@ant-design/icons';
import type {useLaunchAuth} from './useLaunchAuth';
import {routeHash} from './appRoutes';

type Auth=ReturnType<typeof useLaunchAuth>;
type ProjectSummary={id:string;source_repository:string;preferred_branch:string;current_report?:{status:string;analyzed_sha?:string;generated_at?:string|null}|null;queued_requests?:number};
type RecentRequest={request_id:string;project_id:string;source_repository:string;ref_type:string;ref:string;target_sha?:string;status:string;created_at:string};
type Activity={checked_at:string;freshness:'fresh'|'stale'|'unavailable';health:{status:'healthy'|'degraded'|'unknown';message:string};alerts:{id:string;project_id?:string;severity:'info'|'warning'|'error';title:string;message:string}[];projects:ProjectSummary[];recent_requests:RecentRequest[]};
const short=(value?:string)=>value?value.slice(0,12):'Unavailable';
const statusLabel=(status:string)=>status==='queued'?'Preparing':status==='running'?'Analyzing':status==='published'||status==='reused'?'Ready':status==='failed'?'Needs attention':'Finished';

export function ActivityPage({auth}:{auth:Auth}){
 const [data,setData]=useState<Activity>();const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [query,setQuery]=useState('');
 useEffect(()=>{let active=true;setLoading(true);auth.api<Activity>('dashboard').then(value=>{if(active){setData(value);setError('');}}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Activity is unavailable.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[auth.session?.token]);
 const results=useMemo(()=>{const needle=query.trim().toLowerCase();if(!needle)return[];return[
  ...(data?.projects||[]).filter(project=>`${project.source_repository} ${project.preferred_branch}`.toLowerCase().includes(needle)).map(project=>({key:`project-${project.id}`,label:project.source_repository,meta:`Project · preferred ${project.preferred_branch}`,href:routeHash({kind:'project',projectId:project.id,view:'overview'})})),
  ...(data?.recent_requests||[]).filter(request=>`${request.source_repository} ${request.ref} ${request.target_sha||''} ${request.request_id}`.toLowerCase().includes(needle)).map(request=>({key:`request-${request.request_id}`,label:request.source_repository,meta:`${request.ref_type} ${request.ref} · ${short(request.target_sha)} · ${statusLabel(request.status)}`,href:routeHash({kind:'project',projectId:request.project_id,view:'overview'})}))
 ];},[data,query]);
 return <main className="workspace-home activity-view">
  <section className="workspace-intro activity-heading"><div><div className="eyebrow">ACTIVITY</div><h1>Analysis progress</h1><p>See what is being analyzed, review completed results, and act only when something needs attention.</p></div><Button type="primary" href={routeHash({kind:'projects'})}>Open projects</Button></section>
  <Input className="global-search" size="large" prefix={<SearchOutlined/>} aria-label="Search projects and recent requests" placeholder="Search project, branch, pull request, SHA, or request ID" value={query} onChange={event=>setQuery(event.target.value)}/>
  {query&&<section className="search-results" aria-label="Global search results">{results.length?results.map(item=><a key={item.key} href={item.href}><strong>{item.label}</strong><span>{item.meta}</span></a>):<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No configured project or recent request matches this search."/>}</section>}
  {error&&<Alert type="error" showIcon title="Activity unavailable" description={`${error} Project reports have not been labelled healthy.`}/>} {loading&&<p role="status">Loading system health and recent requests…</p>}
  {data&&<><section className="health-strip" aria-label="System health"><div><span>Service</span><strong>{data.health.status}</strong><small>{data.health.message}</small></div><div><span>Updated</span><strong>{new Date(data.checked_at).toLocaleString()}</strong><small>{data.freshness==='stale'?'Status may be delayed.':'Current status.'}</small></div><div><span>Projects</span><strong>{data.projects.length}</strong><small>{data.projects.filter(project=>project.queued_requests).length} analyses in progress</small></div></section>
   {data.freshness!=='fresh'&&<Alert type="warning" showIcon title="Activity summary is not current" description="Project reports remain available, but system-wide health cannot be treated as current."/>}
   <section className="activity-columns"><article className="panel"><div className="panel-heading"><div><div className="eyebrow">ATTENTION</div><h2>What needs action</h2></div><Tag color={data.alerts.length?'orange':'green'}>{data.alerts.length||'None'}</Tag></div>{data.alerts.length?data.alerts.map(alert=><Alert key={alert.id} type={alert.severity} showIcon title={alert.title} description={<>{alert.message}{alert.project_id&&<><br/><a href={routeHash({kind:'project',projectId:alert.project_id,view:'overview'})}>Open affected project</a></>}</>}/>):<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing needs your attention."/>}</article>
   <article className="panel"><div className="panel-heading"><div><div className="eyebrow">RECENT WORK</div><h2>Analyses</h2></div></div>{data.recent_requests.length?data.recent_requests.map(request=><a className="recent-request" key={request.request_id} href={routeHash({kind:'project',projectId:request.project_id,view:'overview'})}><div><strong>{request.source_repository}</strong><small>{request.ref_type} <code>{request.ref}</code> · {new Date(request.created_at).toLocaleString()}</small></div><Tag>{statusLabel(request.status)}</Tag></a>):<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recent analyses."/>}</article></section>
   <section className="project-glance"><div className="panel-heading"><div><div className="eyebrow">CURRENT REPORTS</div><h2>Projects at a glance</h2></div><a href={routeHash({kind:'projects'})}>View all projects</a></div>{data.projects.map(project=><a key={project.id} href={routeHash({kind:'project',projectId:project.id,view:'overview'})}><strong>{project.source_repository}</strong><span>Preferred <code>{project.preferred_branch}</code></span><span>{project.current_report?<>Report <Tag>{project.current_report.status}</Tag> <code>{short(project.current_report.analyzed_sha)}</code></>:'No retained report'}</span></a>)}</section>
  </>}
 </main>;
}
