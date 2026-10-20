import {useEffect,useState} from 'react';
import {Alert,Button,Empty,Progress,Select,Tag} from 'antd';
import {ArrowRightOutlined,BranchesOutlined,ClockCircleOutlined,FileProtectOutlined,PlayCircleOutlined,SafetyCertificateOutlined} from '@ant-design/icons';
import type {useLaunchAuth} from './useLaunchAuth';
import {routeHash} from './appRoutes';

type Lifecycle='Preparing'|'Analyzing'|'Ready'|'Needs attention';
type Limitation={channel:string;status:string;reason:string};
export type ConfiguredProject={id:string;source_repository:string;source_repository_id:number;relationship:'observer'|'connected';preferred_branch:string;native_feedback_enabled:boolean;lifecycle?:Lifecycle;attention_reason?:string|null;active_analysis?:{request_id:string;status:string;target_sha?:string|null;created_at:string}|null;readiness_summary?:{profile_mode:'agentic-soc'|'portable';configured_channels:number;selectable_channels:number;vendor_channels:number;deferred_channels:number;unavailable_channels:number};current_report?:{source_sha?:string;analyzed_sha?:string;generated_at?:string|null;status:string;scanner_summary?:{completed:number;total:number;incomplete:number};limitations?:Limitation[]}|null;current_overlay?:{overlay_key:string;status:string;head_sha?:string;checked_at?:string;pr_context:{number:number;title?:string;head_repository:string;head_branch:string;base_repository:string;base_branch:string;base_sha:string};channel:{status:string;reason?:string}}|null};
type Registry={checked_at?:string;summary?:{projects:number;preparing:number;analyzing:number;needs_attention:number};execution_repository:{id:number;full_name:string};can_launch:boolean;can_configure:boolean;projects:ConfiguredProject[]};
type Auth=ReturnType<typeof useLaunchAuth>;

let registryToken='',registryValue:Registry|undefined,registryRequest:Promise<Registry>|undefined;
const shortSha=(value?:string|null)=>value?value.slice(0,12):'Not available';
const date=(value?:string|null)=>value?new Date(value).toLocaleString(undefined,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not published';
const lifecycle=(project:ConfiguredProject):Lifecycle=>project.lifecycle||(project.active_analysis?.status==='analyzing'?'Analyzing':project.active_analysis?'Preparing':project.current_report?'Ready':'Needs attention');
const stateColor=(state:Lifecycle)=>state==='Ready'?'green':state==='Needs attention'?'orange':'blue';

function useRegistry(auth:Auth){
 const token=auth.session?.token||'';const [registry,setRegistry]=useState<Registry|undefined>(()=>token===registryToken?registryValue:undefined);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{let active=true;setError('');if(!auth.session){setLoading(false);return;}if(token!==registryToken){registryToken=token;registryValue=undefined;registryRequest=undefined;setRegistry(undefined);}if(registryValue){setRegistry(registryValue);setLoading(false);return;}setLoading(true);registryRequest||=auth.api<Registry>('projects');registryRequest.then(value=>{registryValue=value;if(active){setRegistry(value);setError('');}}).catch(reason=>{registryRequest=undefined;if(active)setError(reason instanceof Error?reason.message:'Configured projects are unavailable.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[token]);
 return{registry,loading,error};
}

const openProject=(project:ConfiguredProject)=>{location.hash=routeHash({kind:'project',projectId:project.id,view:'overview'});};

export function Repositories({auth}:{auth:Auth}){
 const {registry,loading,error}=useRegistry(auth),summary=registry?.summary||{projects:registry?.projects.length||0,preparing:registry?.projects.filter(value=>lifecycle(value)==='Preparing').length||0,analyzing:registry?.projects.filter(value=>lifecycle(value)==='Analyzing').length||0,needs_attention:registry?.projects.filter(value=>lifecycle(value)==='Needs attention').length||0};
 return <section className="portfolio" aria-label="Configured analysis projects">
  <header className="portfolio-heading"><div><span className="section-label">Evidence workspace</span><h1>Projects</h1><p>Review the latest published evidence for each configured codebase. Analysis begins only when you start it.</p></div><div className="portfolio-updated"><ClockCircleOutlined/><span>Last checked<strong>{registry?date(registry.checked_at):'Checking…'}</strong></span></div></header>
  {error&&<Alert type="error" showIcon title="Project evidence is unavailable" description={`${error} Refresh the page to try again.`}/>} {!error&&loading&&<div className="portfolio-loading" role="status">Loading project evidence…</div>}
  {registry&&<><section className="portfolio-summary" aria-label="Workspace summary"><div><span>Configured projects</span><strong>{summary.projects}</strong></div><div><span>Preparing</span><strong>{summary.preparing}</strong></div><div><span>Analyzing</span><strong>{summary.analyzing}</strong></div><div className={summary.needs_attention?'summary-attention':''}><span>Needs attention</span><strong>{summary.needs_attention}</strong></div></section>
   {registry.projects.length===0?<Empty description="No configured projects are available."/>:<div className="project-register">{registry.projects.map(project=>{
    const report=project.current_report,coverage=report?.scanner_summary,total=coverage?.total||project.readiness_summary?.configured_channels||0,completed=coverage?.completed||0,percent=total?Math.round(completed/total*100):0,state=lifecycle(project),active=state==='Preparing'||state==='Analyzing';
    return <article className={`project-record state-${state.toLowerCase().replace(' ','-')}`} key={project.id}>
     <div className="project-record-main"><div className="project-record-title"><span className="project-kind">{project.relationship==='connected'?'Connected project':'Read-only source'}</span><h2>{project.source_repository}</h2><div className="project-meta"><span><BranchesOutlined/> {project.preferred_branch}</span><span><SafetyCertificateOutlined/> {project.relationship}</span></div></div><Tag color={stateColor(state)} className="project-state">{state}</Tag></div>
     <dl className="evidence-rail" aria-label={`Evidence provenance for ${project.source_repository}`}>
      <div className="evidence-fact evidence-source"><dt>Source</dt><dd title={project.source_repository}>{project.source_repository}</dd></div>
      <div className="evidence-fact evidence-revision"><dt>Revision</dt><dd><code>{shortSha(report?.analyzed_sha||project.active_analysis?.target_sha)}</code></dd></div>
      <div className="evidence-fact evidence-coverage"><dt>Coverage</dt><dd>{total?`${completed} of ${total} scanners`:'Not available'}</dd></div>
      <div className="evidence-fact evidence-published"><dt>Published</dt><dd>{date(report?.generated_at)}</dd></div>
     </dl>
     <div className="project-record-detail"><div className="coverage-line"><div><span>Scanner evidence</span><small>{coverage?.incomplete?`${coverage.incomplete} incomplete channel${coverage.incomplete===1?'':'s'}`:report?'All reported channels are complete':'Waiting for the first report'}</small></div><Progress percent={percent} showInfo={false} strokeColor="#31A89A" trailColor="var(--workspace-line)"/></div><div className="project-guidance">{project.attention_reason||(active?`${state} analysis for the selected immutable revision.`:'The current evidence is ready for review.')}{report?.limitations?.[0]&&<small>{report.limitations[0].channel}: {report.limitations[0].reason}</small>}</div></div>
     <footer className="project-record-actions"><Button type="primary" icon={<FileProtectOutlined/>} onClick={()=>openProject(project)}>Review evidence</Button>{registry.can_launch&&(active?<Button icon={<ArrowRightOutlined/>} onClick={()=>openProject(project)}>View progress</Button>:<Button icon={<PlayCircleOutlined/>} href={routeHash({kind:'project-run',projectId:project.id})}>Run analysis</Button>)}</footer>
    </article>;
   })}</div>}
   <footer className="portfolio-footnote"><span>Execution and publication host</span><code>{registry.execution_repository.full_name}</code>{registry.can_configure&&<a href={routeHash({kind:'settings',section:'projects'})}>Manage registry settings</a>}</footer></>}
 </section>;
}

export function ProjectPicker({auth,project}:{auth:Auth;project:string}){
 const {registry,loading,error}=useRegistry(auth);if(!registry)return <span role="status">{loading?'Loading configured projects…':error||'The configured project list is unavailable.'}</span>;const selected=registry.projects.find(value=>value.id===project);
 return <Select aria-label="Configured project" showSearch optionFilterProp="label" value={selected?.id} placeholder="Choose a configured project" options={registry.projects.map(value=>({value:value.id,label:value.source_repository}))} onChange={id=>{const target=registry.projects.find(value=>value.id===id);if(target)openProject(target);}}/>;
}
