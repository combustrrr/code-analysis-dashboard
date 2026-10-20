import {useEffect,useMemo,useState} from 'react';
import {Alert,Button,Empty,Input,Space,Tag} from 'antd';
import {SearchOutlined} from '@ant-design/icons';
import type {useLaunchAuth} from './useLaunchAuth';
import {routeHash} from './appRoutes';

type Auth=ReturnType<typeof useLaunchAuth>;
type ProjectSummary={id:string;source_repository:string;preferred_branch:string;current_report?:{status:string;analyzed_sha?:string;generated_at?:string|null}|null;queued_requests?:number};
type RecentRequest={request_id:string;project_id:string;source_repository:string;ref_type:string;ref:string;target_sha?:string;status:string;created_at:string;updated_at?:string;run_url?:string};
type Dashboard={checked_at:string;freshness:'fresh'|'stale'|'unavailable';health:{status:'healthy'|'degraded'|'unknown';message:string};alerts:{id:string;project_id?:string;severity:'info'|'warning'|'error';title:string;message:string}[];projects:ProjectSummary[];recent_requests:RecentRequest[];execution_repository:{full_name:string};can_launch:boolean;can_configure:boolean};

const short=(value?:string)=>value?value.slice(0,12):'Unavailable';
export function ActivityPage({auth}:{auth:Auth}){
 const [data,setData]=useState<Dashboard>();const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [query,setQuery]=useState('');
 useEffect(()=>{let active=true;setLoading(true);auth.api<Dashboard>('dashboard').then(value=>{if(active){setData(value);setError('');}}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Dashboard summary is unavailable.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[auth.session?.token]);
 const results=useMemo(()=>{const needle=query.trim().toLowerCase();if(!needle)return[];return[
  ...(data?.projects||[]).filter(p=>`${p.source_repository} ${p.preferred_branch}`.toLowerCase().includes(needle)).map(p=>({key:`project-${p.id}`,label:p.source_repository,meta:`Project · preferred ${p.preferred_branch}`,href:routeHash({kind:'project',projectId:p.id,view:'overview'})})),
  ...(data?.recent_requests||[]).filter(r=>`${r.source_repository} ${r.ref} ${r.target_sha||''} ${r.request_id}`.toLowerCase().includes(needle)).map(r=>({key:`request-${r.request_id}`,label:r.source_repository,meta:`${r.ref_type} ${r.ref} · ${short(r.target_sha)} · ${r.status}`,href:routeHash({kind:'project',projectId:r.project_id,view:'overview'})}))
 ];},[data,query]);
 return <main className="workspace-home dashboard-home">
  <section className="workspace-intro dashboard-home-heading"><div><div className="eyebrow">ACTIVITY</div><h1>Analysis in motion</h1><p>Follow queued work, published reports, and service signals without leaving the developer workflow.</p></div><Button type="primary" href={routeHash({kind:'projects'})}>Open projects</Button></section>
  <Input className="global-search" size="large" prefix={<SearchOutlined/>} aria-label="Search projects and recent requests" placeholder="Search project, branch, pull request, SHA, or request ID" value={query} onChange={event=>setQuery(event.target.value)}/>
  {query&&<section className="search-results" aria-label="Global search results">{results.length?results.map(item=><a key={item.key} href={item.href}><strong>{item.label}</strong><span>{item.meta}</span></a>):<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No configured project or recent request matches this search."/>}</section>}
  {error&&<Alert type="error" showIcon title="Dashboard data unavailable" description={`${error} Project reports have not been labelled healthy.`}/>} {loading&&<p role="status">Loading system health and recent requests…</p>}
  {data&&<><section className="health-strip" aria-label="System health"><div><span>Service</span><strong>{data.health.status}</strong><small>{data.health.message}</small></div><div><span>Summary checked</span><strong>{new Date(data.checked_at).toLocaleString()}</strong><small>{data.freshness==='stale'?'This summary is stale.':'Current server observation.'}</small></div><div><span>Configured projects</span><strong>{data.projects.length}</strong><small>{data.projects.filter(p=>p.queued_requests).length} with queued or active requests</small></div></section>
   {data.freshness!=='fresh'&&<Alert type="warning" showIcon title="Dashboard summary is not current" description="Project reports remain available, but system-wide health cannot be treated as current."/>}
   <section className="dashboard-columns"><article className="panel"><div className="panel-heading"><div><div className="eyebrow">ATTENTION</div><h2>Service alerts</h2></div><Tag color={data.alerts.length?'orange':'green'}>{data.alerts.length||'None'}</Tag></div>{data.alerts.length?data.alerts.map(alert=><Alert key={alert.id} type={alert.severity} showIcon title={alert.title} description={<>{alert.message}{alert.project_id&&<><br/><a href={routeHash({kind:'project',projectId:alert.project_id,view:'overview'})}>Open affected project</a></>}</>}/>):<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No current service alerts."/>}</article>
   <article className="panel"><div className="panel-heading"><div><div className="eyebrow">RECENT WORK</div><h2>Analysis requests</h2></div></div>{data.recent_requests.length?data.recent_requests.map(request=><a className="recent-request" key={request.request_id} href={routeHash({kind:'project',projectId:request.project_id,view:'overview'})}><div><strong>{request.source_repository}</strong><small>{request.ref_type} <code>{request.ref}</code> · {new Date(request.created_at).toLocaleString()}</small></div><Tag>{request.status}</Tag></a>):<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recent analysis requests."/>}</article></section>
   <section className="project-glance"><div className="panel-heading"><div><div className="eyebrow">CURRENT REPORTS</div><h2>Projects at a glance</h2></div><a href={routeHash({kind:'projects'})}>View all projects</a></div>{data.projects.map(project=><a key={project.id} href={routeHash({kind:'project',projectId:project.id,view:'overview'})}><strong>{project.source_repository}</strong><span>Preferred <code>{project.preferred_branch}</code></span><span>{project.current_report?<>Report <Tag>{project.current_report.status}</Tag> <code>{short(project.current_report.analyzed_sha)}</code></>:'No retained report'}</span></a>)}</section>
  </>}
 </main>;
}
