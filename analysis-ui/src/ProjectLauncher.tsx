import {useEffect,useState} from 'react';
import {Alert,Button,Descriptions,Input,Modal,Radio,Select,Space,Steps,Table,Tag} from 'antd';
import {useLaunchAuth} from './useLaunchAuth';
type Auth=ReturnType<typeof useLaunchAuth>;
type Inventory={repository:string;checked_at:string;branches:{name:string;sha:string}[];prs:{number:number;head_sha:string;base_sha:string;head_repository:string;base_branch:string}[]};
export function ProjectLauncher({auth,repository,project,close}:{auth:Auth;repository:string;project:string;close:()=>void}) {
 const [readiness,setReadiness]=useState<{channels:{channel:string;status:string;reason:string}[];tooling_sha:string}>();
 const [inventory,setInventory]=useState<Inventory>();const [kind,setKind]=useState('branch');const [ref,setRef]=useState('');
 const [step,setStep]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const [request,setRequest]=useState<{run_id:number|null;request_id:string}>();const [status,setStatus]=useState('');
 useEffect(()=>{if(!auth.session)return;let active=true;auth.api<Inventory>(`project-targets?repository=${encodeURIComponent(repository)}&project_id=${project}`).then(r=>{if(active)setInventory(r);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[auth.session,repository,project]);
 useEffect(()=>{if(!request?.run_id)return;let active=true;let timer:number;let delay=15000;
 const poll=async()=>{try{if(document.visibilityState==='visible'){const r=await auth.api<{status:string;conclusion:string}>(`project-runs/${request.run_id}?repository=${encodeURIComponent(repository)}`);if(active)setStatus(`${r.status}${r.conclusion?' — '+r.conclusion:''}`);if(r.status==='completed')return;}delay=15000;}catch{delay=Math.min(delay*2,120000);}if(active)timer=window.setTimeout(poll,delay);};void poll();return()=>{active=false;window.clearTimeout(timer);};},[request?.run_id,auth.session]);
 useEffect(()=>{if(!auth.session)return;let active=true;setReadiness(undefined);auth.api<{channels:{channel:string;status:string;reason:string}[];tooling_sha:string}>(`project-readiness?repository=${encodeURIComponent(repository)}&project_id=${project}`).then(r=>{if(active)setReadiness(r);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[auth.session,repository,project]);
 const valid=kind==='commit'?/^[a-fA-F0-9]{40}$/.test(ref):!!ref;
 return <Modal open title="Run analysis" onCancel={close} footer={null} width={760}>
  <Steps current={request?3:step} items={[{title:'Revision'},{title:'Readiness'},{title:'Review'},{title:'Activity'}]}/>
  {!auth.session&&<Button onClick={auth.signIn}>Sign in with GitHub</Button>}
  {error&&<Alert type="error" title="Analysis request needs attention" description={error} showIcon/>}
  <Descriptions column={1} items={[{key:'execution',label:'Execution repository',children:repository},{key:'source',label:'Source',children:inventory?.repository||'Loading…'}]}/>
  {!request&&<>
   {step===0&&<><Radio.Group value={kind} onChange={e=>{setKind(e.target.value);setRef('');}} options={[{label:'Branch',value:'branch'},{label:'Pull request',value:'pr'},{label:'Commit SHA',value:'commit'}]}/>
    {kind==='commit'?<Input aria-label="Full commit SHA" value={ref} onChange={e=>setRef(e.target.value.trim())} placeholder="Full 40-character commit SHA"/>:<Select style={{width:'100%'}} showSearch aria-label="Revision" value={ref||undefined} onChange={setRef} options={kind==='branch'?inventory?.branches.map(b=>({value:b.name,label:`${b.name} · ${b.sha.slice(0,12)}`})):inventory?.prs.map(p=>({value:String(p.number),label:`PR #${p.number} · ${p.head_sha.slice(0,12)} → ${p.base_branch}`}))}/>}
   </>}
   {step===1&&<><Alert type="info" showIcon title="Configured scanner readiness" description="Configuration does not prove a successful scan or vendor entitlement. The Scanners section shows actual evidence from the published report. Missing adapters remain explicit."/><p>Tooling revision: {readiness?.tooling_sha || 'Loading?'}</p><Table rowKey="channel" loading={!readiness} dataSource={readiness?.channels} pagination={{pageSize:8}} columns={[{title:'Scanner',dataIndex:'channel'},{title:'Readiness',dataIndex:'status',render:value=><Tag>{value}</Tag>},{title:'Details',dataIndex:'reason'}]}/></>}
   {step===2&&<Alert type="warning" showIcon title={`Analyze ${kind}: ${ref}`} description="This starts GitHub Actions on the execution repository. Source installation and tests run in isolated jobs. Published findings retain their exact source revision."/>}
   <Space>{step>0&&<Button onClick={()=>setStep(step-1)}>Back</Button>}{step<2?<Button type="primary" disabled={!valid||!auth.session} onClick={()=>setStep(step+1)}>Continue</Button>:<Button type="primary" loading={busy} onClick={async()=>{setBusy(true);setError('');try{setRequest(await auth.api('project-launch',{repository,project_id:project,kind,ref}));}catch(e){setError(String(e));}finally{setBusy(false);}}}>Start analysis</Button>}</Space>
  </>}
  {request&&<Alert type="success" title="Request submitted" description={<><p>{status||'GitHub accepted the scheduling request. Scanner completion is not yet confirmed.'}</p><p>Request {request.request_id}</p><a href={`https://github.com/${repository}/actions${request.run_id?`/runs/${request.run_id}`:''}`} target="_blank" rel="noreferrer">Track in GitHub Actions</a><p>Workflow status and current published results update separately.</p></>}/>}
 </Modal>;
}
