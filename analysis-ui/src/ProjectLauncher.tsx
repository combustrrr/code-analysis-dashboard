import {refreshRepositoryReports} from './repositoryReports';
﻿import {useEffect,useState} from 'react';
import {Alert,Button,Descriptions,Input,Modal,Radio,Select,Space,Collapse,Table,Tag} from 'antd';
import {useLaunchAuth} from './useLaunchAuth';
type Auth=ReturnType<typeof useLaunchAuth>;
type Inventory={repository:string;checked_at:string;branches:{name:string;sha:string}[];prs:{number:number;head_sha:string;base_sha:string;head_repository:string;base_branch:string}[]};
export function ProjectLauncher({auth,repository,project,close}:{auth:Auth;repository:string;project:string;close:()=>void}) {
 const [readiness,setReadiness]=useState<{channels:{channel:string;status:string;reason:string}[];tooling_sha:string}>();
 const [inventory,setInventory]=useState<Inventory>();const [kind,setKind]=useState('branch');const [ref,setRef]=useState('');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [request,setRequest]=useState<{run_id:number|null;request_id:string}>();const [status,setStatus]=useState<{phase:string;target_id?:string;source_sha?:string;analyzed_sha?:string;completeness?:string;error?:string;producer?:{url:string;attempt:number;status:string}}>();
 useEffect(()=>{if(!auth.session)return;let active=true;auth.api<Inventory>(`project-targets?repository=${encodeURIComponent(repository)}&project_id=${project}`).then(r=>{if(active)setInventory(r);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[auth.session,repository,project]);
 useEffect(()=>{if(!request?.request_id)return;let active=true;let timer:number;let delay=15000;
 const poll=async()=>{try{if(document.visibilityState==='visible'){const r=await auth.api<NonNullable<typeof status>>(`project-activity?repository=${encodeURIComponent(repository)}&project_id=${project}&request_id=${request.request_id}`);if(active){setStatus(r);setError('');}if(r.phase==='published' && r.target_id){refreshRepositoryReports();location.hash=new URLSearchParams({repository,project,target:r.target_id,tab:'overview'}).toString();window.dispatchEvent(new Event('analysis-report-published'));close();return;}if(['published','failed','superseded'].includes(r.phase))return;}delay=15000;}catch(e){if(active)setError(String(e));delay=Math.min(delay*2,120000);}if(active)timer=window.setTimeout(poll,delay);};void poll();return()=>{active=false;window.clearTimeout(timer);};},[request?.request_id,auth.session,repository,project]);
 useEffect(()=>{if(!auth.session)return;let active=true;setReadiness(undefined);auth.api<{channels:{channel:string;status:string;reason:string}[];tooling_sha:string}>(`project-readiness?repository=${encodeURIComponent(repository)}&project_id=${project}`).then(r=>{if(active)setReadiness(r);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[auth.session,repository,project]);
 const valid=kind==='commit'?/^[a-fA-F0-9]{40}$/.test(ref):!!ref;
 return <Modal open title="Run analysis" onCancel={close} footer={null} width={760}>
  {!auth.session&&<Button onClick={auth.signIn}>Sign in with GitHub</Button>}
  {error&&<Alert type="error" title="Analysis request needs attention" description={error} showIcon/>}
  <Descriptions column={1} items={[{key:'execution',label:'Execution repository',children:repository},{key:'source',label:'Source',children:inventory?.repository||'Loading…'}]}/>
  {!request&&<>
   <><Radio.Group value={kind} onChange={e=>{setKind(e.target.value);setRef('');}} options={[{label:'Branch',value:'branch'},{label:'Pull request',value:'pr'},{label:'Commit SHA',value:'commit'}]}/>
    {kind==='commit'?<Input aria-label="Full commit SHA" value={ref} onChange={e=>setRef(e.target.value.trim())} placeholder="Full 40-character commit SHA"/>:<Select style={{width:'100%'}} showSearch aria-label="Revision" value={ref||undefined} onChange={setRef} options={kind==='branch'?inventory?.branches.map(b=>({value:b.name,label:`${b.name} · ${b.sha.slice(0,12)}`})):inventory?.prs.map(p=>({value:String(p.number),label:`PR #${p.number} · ${p.head_sha.slice(0,12)} → ${p.base_branch}`}))}/>}
   </>
   <Collapse items={[{key:'readiness',label:'Scanner readiness (optional)',children:<><p>Tooling: {readiness?.tooling_sha || 'Loading'}. Unavailable scanners remain explicit in the report.</p><Table rowKey="channel" loading={!readiness} dataSource={readiness?.channels} pagination={{pageSize:8}} columns={[{title:'Scanner',dataIndex:'channel'},{title:'Readiness',dataIndex:'status',render:value=><Tag>{value}</Tag>},{title:'Details',dataIndex:'reason'}]}/></>}]} />
   <p>Branches resolve to their latest head when queued. PRs retain their head and base context. A commit scan analyzes exactly the full SHA entered.</p>
   <Button type="primary" disabled={!valid||!auth.session} loading={busy} onClick={async()=>{setBusy(true);setError('');try{setRequest(await auth.api('project-launch',{repository,project_id:project,kind,ref:kind==='commit'?ref.toLowerCase():ref}));}catch(e){setError(String(e));}finally{setBusy(false);}}}>Run analysis</Button>
  </>}
  {request&&<Alert type="success" title="Request submitted" description={<><p>{status?.phase || 'Request saved; awaiting scheduling'}</p><p>Request {request.request_id}</p>{status?.source_sha&&<p>Resolved commit: <code>{status.source_sha}</code></p>}{status?.producer&&<p><a href={status.producer.url} target="_blank" rel="noreferrer">Scanner workflow ? attempt {status.producer.attempt}</a> ? {status.producer.status}</p>}{status?.completeness&&<p>Report: {status.completeness} ? <a href={`#repository=${encodeURIComponent(repository)}&project=${project}&tab=overview`} onClick={close}>View results</a></p>}{status?.error&&<p>{status.error}</p>}<a href={`https://github.com/${repository}/actions${request.run_id?`/runs/${request.run_id}`:''}`} target="_blank" rel="noreferrer">Track in GitHub Actions</a><p>Workflow status and current published results update separately.</p></>}/>}
 </Modal>;
}
