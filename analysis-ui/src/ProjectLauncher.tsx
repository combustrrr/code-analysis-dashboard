import {useEffect,useState} from 'react';
import {Alert,Button,Descriptions,Input,Modal,Radio,Select,Space,Collapse,Table,Tag} from 'antd';
import {useLaunchAuth} from './useLaunchAuth';
import type {ProjectRunRequest} from './ProjectRunTracker';
type Auth=ReturnType<typeof useLaunchAuth>;
type Inventory={repository:string;checked_at:string;branches:{name:string;sha:string}[];prs:{number:number;title:string;head_branch:string;head_sha:string;base_sha:string;head_repository:string;base_branch:string}[]};
export function ProjectLauncher({auth,repository,project,close,onSubmitted}:{auth:Auth;repository:string;project:string;close:()=>void;onSubmitted:(request:ProjectRunRequest)=>void}) {
 const [readiness,setReadiness]=useState<{channels:{channel:string;status:string;reason:string}[];tooling_sha:string}>();
 const [inventory,setInventory]=useState<Inventory>();const [kind,setKind]=useState('branch');const [ref,setRef]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{if(!auth.session)return;let active=true;auth.api<Inventory>(`project-targets?repository=${encodeURIComponent(repository)}&project_id=${project}`).then(r=>{if(active)setInventory(r);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[auth.session,repository,project]);
 useEffect(()=>{if(!auth.session)return;let active=true;setReadiness(undefined);auth.api<{channels:{channel:string;status:string;reason:string}[];tooling_sha:string}>(`project-readiness?repository=${encodeURIComponent(repository)}&project_id=${project}`).then(r=>{if(active)setReadiness(r);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[auth.session,repository,project]);
 const valid=kind==='commit'?/^[a-fA-F0-9]{40}$/.test(ref):!!ref;
 return <Modal open title="Run analysis" onCancel={close} footer={null} width={760}>
  {!auth.session&&<Button onClick={auth.signIn}>Sign in with GitHub</Button>}
   {error&&<Alert type="error" title={error.includes('Evaluation dispatch budget')?'Analysis temporarily unavailable':'Analysis setup unavailable'} description={error.includes('Evaluation dispatch budget')?'The evaluation dispatch limit has been reached. An operator reset is required before another analysis can be started.':error} showIcon/>}
  <Descriptions column={1} items={[{key:'execution',label:'Execution repository',children:repository},{key:'source',label:'Source',children:inventory?.repository||'Loading…'}]}/>
   <>
    <Radio.Group value={kind} onChange={e=>{setKind(e.target.value);setRef('');}} options={[{label:'Branch',value:'branch'},{label:'Pull request',value:'pr'},{label:'Commit SHA',value:'commit'}]}/>
    {kind==='commit'?<Input aria-label="Full commit SHA" value={ref} onChange={e=>setRef(e.target.value.trim())} placeholder="Full 40-character commit SHA"/>:<Select style={{width:'100%'}} showSearch aria-label="Revision" value={ref||undefined} onChange={setRef} options={kind==='branch'?inventory?.branches.map(b=>({value:b.name,label:`${b.name} · ${b.sha.slice(0,12)}`})):inventory?.prs.map(p=>({value:String(p.number),label:`PR #${p.number} ${p.title ? ' · ' + p.title.slice(0,40) : ''} · ${p.head_branch} → ${p.base_branch}`}))}/>}
    <Collapse items={[{key:'readiness',label:'Scanner readiness (optional)',children:<><p>Tooling: {readiness?.tooling_sha || 'Loading'}. Unavailable scanners remain explicit in the report.</p><Table rowKey="channel" loading={!readiness} dataSource={readiness?.channels} pagination={{pageSize:8}} columns={[{title:'Scanner',dataIndex:'channel'},{title:'Readiness',dataIndex:'status',render:value=><Tag>{value}</Tag>},{title:'Details',dataIndex:'reason'}]}/></>}]} />
    <p>Branches resolve to their latest head when queued. PRs retain their head and base context. A commit scan analyzes exactly the full SHA entered.</p>
    <Button type="primary" disabled={!valid||!auth.session} loading={busy} onClick={async()=>{
      setBusy(true);setError('');let submitted=false;
      try {
        const normalizedRef=kind==='commit'?ref.toLowerCase():ref;
        const receipt=await auth.api<{run_id:number|null;request_id:string}>('project-launch',{repository,project_id:project,kind,ref:normalizedRef});
        onSubmitted({...receipt,repository,project,kind,ref:normalizedRef,submittedAt:new Date().toISOString()});
        submitted=true;
      } catch(e) { setError(String(e)); }
      finally { if(!submitted)setBusy(false); }
    }}>Run analysis</Button>
   </>
 </Modal>;
}
