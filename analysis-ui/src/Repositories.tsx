import {useEffect,useState} from 'react';
import {Alert,Button,Empty,Select,Space,Tag} from 'antd';
import type {useLaunchAuth} from './useLaunchAuth';

export type ConfiguredProject={id:string;source_repository:string;source_repository_id:number;relationship:'observer'|'connected';preferred_branch:string;native_feedback_enabled:boolean};
type Registry={execution_repository:{id:number;full_name:string};can_launch:boolean;can_configure:boolean;projects:ConfiguredProject[]};
type Auth=ReturnType<typeof useLaunchAuth>;

function useRegistry(auth:Auth){
 const [registry,setRegistry]=useState<Registry>();
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  setRegistry(undefined);
  setError('');
  if(!auth.session){setLoading(false);return;}
  setLoading(true);
  auth.api<Registry>('projects').then(value=>{
   if(active){setRegistry(value);setError('');}
  }).catch(reason=>{
   if(active)setError(reason instanceof Error?reason.message:'Configured projects are unavailable.');
  }).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[auth.session?.token]);
 return {registry,loading,error};
}

function openProject(registry:Registry,project:ConfiguredProject){
 location.hash=new URLSearchParams({repository:registry.execution_repository.full_name,project:project.id,tab:'overview'}).toString();
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
   <div className="target-card-content"><div className="target-card-kicker">{project.relationship==='connected'?'CONNECTED · SELF-ANALYSIS':'OBSERVER · READ-ONLY SOURCE'}</div><h3>{project.source_repository}</h3><Space wrap><Tag>{project.relationship}</Tag><span>Preferred branch <code>{project.preferred_branch}</code></span>{project.native_feedback_enabled&&<Tag color="cyan">Native feedback</Tag>}</Space></div>
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
