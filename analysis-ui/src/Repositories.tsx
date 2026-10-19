import {useEffect,useState} from 'react';
import {Alert,Button,Empty,Select,Space,Tag} from 'antd';
import type {useLaunchAuth} from './useLaunchAuth';
import {routeHash} from './appRoutes';

export type ConfiguredProject={id:string;source_repository:string;source_repository_id:number;relationship:'observer'|'connected';preferred_branch:string;native_feedback_enabled:boolean;readiness_summary?:{configured_channels:number;vendor_channels:number};current_report?:{source_sha?:string;analyzed_sha?:string;generated_at?:string|null;status:string}|null;current_overlay?:{overlay_key:string;status:string;head_sha?:string;checked_at?:string;pr_context:{number:number;title?:string;head_repository:string;head_branch:string;base_repository:string;base_branch:string;base_sha:string};channel:{status:string;reason?:string}}|null;queued_requests?:number};
type Registry={execution_repository:{id:number;full_name:string};can_launch:boolean;can_configure:boolean;projects:ConfiguredProject[]};
type Auth=ReturnType<typeof useLaunchAuth>;

let registryToken='';
let registryValue:Registry|undefined;
let registryRequest:Promise<Registry>|undefined;

function shortSha(value:unknown){return typeof value==='string'&&value?value.slice(0,12):'Unavailable';}

function useRegistry(auth:Auth){
 const token=auth.session?.token||'';
 const [registry,setRegistry]=useState<Registry|undefined>(()=>token===registryToken?registryValue:undefined);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  setError('');
  if(!auth.session){setLoading(false);return;}
  if(token!==registryToken){registryToken=token;registryValue=undefined;registryRequest=undefined;setRegistry(undefined);}
  if(registryValue){setRegistry(registryValue);setLoading(false);return;}
  setLoading(true);
  registryRequest ||= auth.api<Registry>('projects');
  registryRequest.then(value=>{
   registryValue=value;
   if(active){setRegistry(value);setError('');}
  }).catch(reason=>{
   registryRequest=undefined;
   if(active)setError(reason instanceof Error?reason.message:'Configured projects are unavailable.');
  }).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[token]);
 return {registry,loading,error};
}

function openProject(registry:Registry,project:ConfiguredProject){
 location.hash=routeHash({kind:'project',repository:registry.execution_repository.full_name,projectId:project.id,view:'overview'});
}

export function Repositories({auth}:{auth:Auth}){
 const {registry,loading,error}=useRegistry(auth);
 return <section className="connections-panel target-catalog" aria-label="Configured analysis targets">
  <div className="target-catalog-heading"><span>TRUSTED PROJECT REGISTRY</span><h2>Choose a codebase</h2><p>These projects are configured on the analysis service. Opening a project only reads its current report; it does not start a scan.</p></div>
  {error&&<Alert type="error" showIcon title="Project registry unavailable" description={error}/>}
  {!error&&loading&&<p role="status">Loading configured projects…</p>}
  {!error&&!loading&&registry?.projects.length===0&&<Empty description="No configured projects are available."/>}
  {registry&&<div className="target-cards">{registry.projects.map((project,index)=><article className="target-card" key={project.id}>
   <div className="target-card-index" aria-hidden="true">{String(index+1).padStart(2,'0')}</div>
     <div className="target-card-content"><div className="target-card-kicker">{project.relationship==='connected'?'CONNECTED · SELF-ANALYSIS':'OBSERVER · READ-ONLY SOURCE'}</div><h3>{project.source_repository}</h3><Space wrap><Tag>{project.relationship}</Tag><span>Preferred branch <code>{project.preferred_branch}</code></span>{project.readiness_summary&&<Tag>{project.readiness_summary.configured_channels} configured channels · {project.readiness_summary.vendor_channels} vendor lanes</Tag>}{project.queued_requests? <Tag color="blue">{project.queued_requests} request{project.queued_requests===1?'':'s'} active or queued</Tag>:null}</Space><p className="target-report-summary">{project.current_report?<>Last completed source report: <Tag>{project.current_report.status}</Tag> analyzed <code>{shortSha(project.current_report.analyzed_sha)}</code> {project.current_report.source_sha&&project.current_report.analyzed_sha&&project.current_report.source_sha!==project.current_report.analyzed_sha&&<>· selected head <code>{shortSha(project.current_report.source_sha)}</code></>} · {project.current_report.generated_at?new Date(project.current_report.generated_at).toLocaleString():'time unavailable'}</>:'No completed source report is retained yet.'}</p>{project.current_overlay&&<p className="target-report-summary"><Tag color="purple">Separate PR overlay · #{project.current_overlay.pr_context.number}</Tag> <code>{project.current_overlay.pr_context.head_repository}@{shortSha(project.current_overlay.head_sha)}</code> → <code>{project.current_overlay.pr_context.base_repository}:{project.current_overlay.pr_context.base_branch}</code> · {project.current_overlay.channel.status.replaceAll('_',' ')}</p>}</div>
   <Button type="primary" onClick={()=>openProject(registry,project)}>Open report</Button>
  </article>)}</div>}
  {registry&&<p className="target-catalog-footer">Execution and reports: <code>{registry.execution_repository.full_name}</code>. {registry.can_launch?'Your account can submit an analysis request explicitly.':'Read-only access; write permission is required to launch.'} {registry.can_configure?'Your account can manage the trusted project registry.':'Admin permission is required to change the project registry.'}</p>}
 </section>;
}

export function ProjectPicker({auth,project}:{auth:Auth;project:string}){
 const {registry,loading,error}=useRegistry(auth);
 if(!registry)return <span role="status">{loading?'Loading configured projects…':error||'Configured project list unavailable.'}</span>;
 const selected=registry.projects.find(value=>value.id===project);
 return <Select aria-label="Configured project" showSearch optionFilterProp="label" value={selected?.id} placeholder="Choose a configured project" options={registry.projects.map(value=>({value:value.id,label:value.source_repository}))} onChange={id=>{
  const target=registry.projects.find(value=>value.id===id);
  if(target)openProject(registry,target);
 }}/>
}
