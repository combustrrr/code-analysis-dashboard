import {useEffect,useState} from 'react';
import {Alert,Button,Checkbox,Descriptions,Input,Modal,Radio,Select,Space,Collapse,Table,Tag,Typography} from 'antd';
import {useLaunchAuth} from './useLaunchAuth';
import type {ProjectRunRequest} from './ProjectRunTracker';
type Auth=ReturnType<typeof useLaunchAuth>;
type Selection={kind:'branch'|'pr'|'commit';ref:string};
type Channel={id:string;mode:'portable'|'vendor';group:string;status:string;reason:string;default_selected:boolean;selectable:boolean};
type Inventory={repository:string;checked_at:string;inventory_complete:boolean;inventory_warning?:string|null;branches:{name:string;sha:string}[];prs:{number:number;title:string;draft:boolean;available:boolean;unavailable_reason?:string;head_branch:string;head_sha:string;head_repository:string|null;base_sha:string;base_branch:string}[]};
type Preview={preview_id:string;preview_token:string;previewed_at:string;project_id:string;source_repository:string;source_repository_id:number;selection:Selection;target_sha:string;pr_context:{number:number;title:string;draft:boolean;head_repository:string;head_branch:string;head_sha:string;base_repository:string;base_branch:string;base_sha:string}|null;tooling_sha:string;profile_digest:string;channels:Channel[];cached_channels:string[]};

export function ProjectLauncher({auth,repository,project,close,onSubmitted}:{auth:Auth;repository:string;project:string;close:()=>void;onSubmitted:(request:ProjectRunRequest)=>void}) {
 const [readiness,setReadiness]=useState<{channels:Channel[];tooling_sha:string}>();
 const [inventory,setInventory]=useState<Inventory>();
 const [kind,setKind]=useState<Selection['kind']>();
 const [ref,setRef]=useState('');
 const [channels,setChannels]=useState<string[]>([]);
 const [preview,setPreview]=useState<Preview>();
 const [idempotencyKey,setIdempotencyKey]=useState('');
 const [runAgain,setRunAgain]=useState(false);
 const [review,setReview]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
 useEffect(()=>{if(!auth.session)return;let active=true;auth.api<Inventory>(`project-targets?project_id=${project}`).then(value=>{if(active)setInventory(value);}).catch(reason=>{if(active)setError(String(reason));});return()=>{active=false;};},[auth.session?.token,project]);
 useEffect(()=>{if(!auth.session)return;let active=true;auth.api<{channels:Channel[];tooling_sha:string}>(`project-readiness?project_id=${project}`).then(value=>{if(active){setReadiness(value);setChannels(value.channels.filter(channel=>channel.default_selected).map(channel=>channel.id));}}).catch(reason=>{if(active)setError(String(reason));});return()=>{active=false;};},[auth.session?.token,project]);
  const channelChoices=preview?.channels||readiness?.channels||[];
  const valid=!!kind&&!!ref&&(kind!=='commit'||/^[a-fA-F0-9]{40}$/.test(ref))&&channels.length>0&&channels.every(id=>channelChoices.some(channel=>channel.id===id&&channel.selectable));
 const selectedPr=kind==='pr'?inventory?.prs.find(pr=>String(pr.number)===ref):undefined;
 const selection=kind&&ref?{kind,ref:kind==='commit'?ref.toLowerCase():ref} as Selection:undefined;
  const selectedChannels=channelChoices.filter(channel=>channels.includes(channel.id));
  const toggleChannel=(channel:Channel,checked:boolean)=>setChannels(previous=>{
   const group=channelChoices.filter(value=>value.group===channel.group&&value.selectable).map(value=>value.id);
  const next=new Set(previous);for(const value of group)checked?next.add(value):next.delete(value);return [...next];
 });
 const showPreview=async()=>{
  if(!selection)return;
   setBusy(true);setError('');setNotice('');
   try {
    const result=await auth.api<Preview>('project-preview',{project_id:project,selection});
    const unavailable=channels.filter(id=>!result.channels.some(channel=>channel.id===id&&channel.selectable));
    const available=channels.filter(id=>result.channels.some(channel=>channel.id===id&&channel.selectable));
    setPreview(result);setChannels(available);
    if(unavailable.length)setNotice('CodeRabbit evidence is only available for an open pull request; unavailable selections were removed.');
    if(!available.length){setError('This revision has no selectable scanner channels. Choose another channel or an open pull request for CodeRabbit.');return;}
    setIdempotencyKey(crypto.randomUUID());setReview(true);
  } catch(reason) {setError(reason instanceof Error?reason.message:'Could not resolve this revision.');}
  finally {setBusy(false);}
 };
 const confirm=async()=>{
  if(!preview)return;
  setBusy(true);setError('');
  try {
   const receipt=await auth.api<{run_id:number|null;request_id:string}>('project-launch',{project_id:project,preview_token:preview.preview_token,requested_channels:channels,idempotency_key:idempotencyKey,run_again:runAgain});
   onSubmitted({...receipt,repository,source_repository:preview.source_repository,project,kind:preview.selection.kind,ref:preview.selection.ref,target_sha:preview.target_sha,requested_channels:channels,pr_context:preview.pr_context||undefined,submittedAt:new Date().toISOString()});
  } catch(reason) {setError(reason instanceof Error?reason.message:'Could not queue this analysis request.');setBusy(false);}
 };
 return <Modal open title={review?'Review analysis request':'Choose revision and scanners'} onCancel={busy?undefined:close} footer={null} width={760}>
  {!auth.session&&<Button onClick={auth.signIn}>Sign in with GitHub</Button>}
   {error&&<Alert type="error" title={error.includes('stale')||error.includes('expired')?'Revision preview needs refreshing':'Analysis request unavailable'} description={error} showIcon/>}
   {notice&&<Alert type="warning" showIcon title="Scanner selection adjusted for this revision" description={notice}/>}
  {inventory?.inventory_warning&&<Alert type="warning" showIcon title="Some pull requests are unavailable" description={`${inventory.inventory_warning} Available branches and other pull requests remain selectable.`}/>}
  <Descriptions column={1} items={[{key:'execution',label:'Execution repository',children:repository},{key:'source',label:'Source',children:inventory?.repository||'Loading…'}]}/>
  {!review&&<>
    <Radio.Group aria-label="Revision type" value={kind} onChange={event=>{setKind(event.target.value);setRef('');setPreview(undefined);setNotice('');}} options={[{label:'Branch',value:'branch'},{label:'Pull request',value:'pr'},{label:'Commit SHA',value:'commit'}]}/>
   {kind==='commit'?<Input aria-label="Full commit SHA" value={ref} onChange={event=>setRef(event.target.value.trim())} placeholder="Full 40-character commit SHA"/>:kind&&<Select style={{width:'100%'}} showSearch optionFilterProp="label" aria-label="Revision" value={ref||undefined} onChange={setRef} placeholder={kind==='branch'?'Select a branch':'Select an open pull request'} options={kind==='branch'?inventory?.branches.map(branch=>({value:branch.name,label:`${branch.name} · ${branch.sha.slice(0,12)}`})):inventory?.prs.map(pr=>({value:String(pr.number),disabled:!pr.available,label:`PR #${pr.number}${pr.draft?' · Draft':''} · ${pr.title} · ${pr.head_branch} → ${pr.base_branch}`}))}/>}
   {kind==='commit'&&ref&&!/^[a-fA-F0-9]{40}$/.test(ref)&&<Alert type="warning" title="Enter a full 40-character commit SHA."/>}
   {selectedPr&&<Typography.Paragraph>Head: <code>{selectedPr.head_repository}:{selectedPr.head_branch}</code> at <code>{selectedPr.head_sha}</code>; base: <code>{inventory?.repository}:{selectedPr.base_branch}</code> at <code>{selectedPr.base_sha}</code>{selectedPr.draft?' · Draft pull request':''}</Typography.Paragraph>}
   <section aria-label="Scanner channel selection">
    <h3>Scanner channels</h3><p>Portable channels are selected by default. Vendor-backed channels are opt-in; usage may incur GitHub Actions or vendor costs.</p>
    {!readiness&&<p role="status">Loading trusted scanner choices…</p>}
     {channelChoices.map(channel=><div key={channel.id} className="scanner-choice"><Checkbox disabled={!channel.selectable} checked={channels.includes(channel.id)} onChange={event=>toggleChannel(channel,event.target.checked)}>{channel.id} <Tag>{channel.mode}</Tag> <Tag>{channel.status.replaceAll('_',' ')}</Tag>{channel.group!==channel.id&&<small> Shared lane: {channel.group}</small>}</Checkbox>{channel.reason&&<small>{channel.reason}</small>}</div>)}
   </section>
   <Button type="primary" disabled={!valid||!auth.session} loading={busy} onClick={showPreview}>Review exact revision</Button>
  </>}
  {review&&preview&&<>
   <Alert type="info" showIcon title="Exact revision resolved" description="No scan has been submitted yet. Final confirmation will queue a read-only request against this immutable commit."/>
   <Descriptions bordered size="small" column={1} items={[
    {key:'project',label:'Project',children:preview.source_repository},
    {key:'selection',label:'Selection',children:<>{preview.selection.kind} <code>{preview.selection.ref}</code></>},
    {key:'sha',label:'Resolved full SHA',children:<Typography.Text copyable code>{preview.target_sha}</Typography.Text>},
    ...(preview.pr_context?[{key:'head',label:'PR head',children:<>{preview.pr_context.head_repository}:{preview.pr_context.head_branch} <code>{preview.pr_context.head_sha}</code></>},{key:'base',label:'PR base',children:<>{preview.pr_context.base_repository}:{preview.pr_context.base_branch} <code>{preview.pr_context.base_sha}</code>{preview.pr_context.draft?' · Draft':''}</>}]:[]),
    {key:'tooling',label:'Trusted tooling',children:<code>{preview.tooling_sha}</code>},
   ]}/>
   <Collapse items={[{key:'channels',label:`Selected channels (${channels.length})`,children:<Table<Channel> size="small" rowKey="id" pagination={false} dataSource={selectedChannels} columns={[{title:'Channel',dataIndex:'id'},{title:'Mode',dataIndex:'mode',render:value=><Tag>{value}</Tag>},{title:'Readiness',dataIndex:'status'},{title:'Retained evidence',dataIndex:'id',render:value=>preview.cached_channels.includes(value)?<Tag color="green">Will reuse</Tag>:<span>New scan</span>},{title:'Details',dataIndex:'reason'}]}/>}]} />
   <Checkbox checked={runAgain} onChange={event=>setRunAgain(event.target.checked)}>Run again, even if matching retained evidence exists</Checkbox>
   <p>Source jobs use a read-only checkout and do not write findings, comments, checks, commits, or pull requests back to the source repository.</p>
   <Space><Button disabled={busy} onClick={()=>{setReview(false);setPreview(undefined);}}>Back to selection</Button><Button type="primary" loading={busy} onClick={confirm}>Confirm and queue analysis</Button></Space>
  </>}
 </Modal>;
}
