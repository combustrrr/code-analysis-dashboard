import {useEffect,useState} from 'react';
import {Alert, Button, Collapse, Input, Modal, Select, Space, Steps, Table, Tag} from 'antd';
import {useLaunchAuth} from './useLaunchAuth';

type Repository = {id:number;full_name:string;can_configure:boolean};
type Preview = {confirmation:string;files:Record<string,string>;project:{relationship:string;source_repository:{full_name:string}};detection:{notice:string;detected_manifests:string[]}};
export function Repositories({auth,endpoint}:{endpoint?:string;auth:ReturnType<typeof useLaunchAuth>}) {
  const [editing,setEditing]=useState<{id:string;text:string}>();
  const [configurationPreview,setConfigurationPreview]=useState<{confirmation:string;files:Record<string,string>}>();
  const [installation,setInstallation]=useState<string>();
  useEffect(()=>{if(!endpoint)return;let active=true;fetch(endpoint+'/api/public/config').then(r=>r.json()).then(r=>{if(active && /^https:\/\/github\.com\/apps\/[a-z0-9-]+\/installations\/new$/.test(r.installation_url||''))setInstallation(r.installation_url);}).catch(()=>{});return()=>{active=false;};},[endpoint]);
  const [repositories,setRepositories]=useState<Repository[]>([]);
  const [projects,setProjects]=useState<{id:string;source_repository:{full_name:string};relationship:string;preferred_branch:string;enabled_scanners:string[];deferred_channels:Record<string,string>;report_budget_bytes:number}[]>([]);
  const [execution,setExecution]=useState('');
  const [source,setSource]=useState('');
  const [preview,setPreview]=useState<Preview>();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [installed,setInstalled]=useState('');
  const [page,setPage]=useState(1);
  const [more,setMore]=useState(false);
  async function act(operation:()=>Promise<void>) {setBusy(true);setError('');try{await operation();}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function list(next=1) {await act(async()=>{const result=await auth.api<{repositories:Repository[];has_more:boolean}>(`repositories?page=${next}`);setRepositories(old=>next===1?result.repositories:[...old,...result.repositories]);setPage(next);setMore(result.has_more);});}
  return <section className="connections-panel" aria-label="Connect repository">
    <h2>Repositories</h2><p>Run analysis in a repository you control. A read-only source is analyzed without changing that source repository.</p>
    <Steps current={installed?3:preview?2:execution?1:0} items={[{title:'Connect GitHub'},{title:'Select codebase'},{title:'Review installation'},{title:'Ready'}]}/>
    {installation&&<Button href={installation} target="_blank" rel="noreferrer">Install GitHub App on selected repositories</Button>}
    {!auth.session?<Button onClick={auth.signIn} disabled={!auth.available}>Sign in with GitHub</Button>:<Space wrap><span>Signed in as {auth.session.login}</span><Button loading={busy} onClick={()=>void list()}>Load repositories</Button><Button onClick={auth.signOut}>Sign out</Button></Space>}
    {(error||auth.error)&&<Alert type="error" showIcon title="Connection needs attention" description={error||auth.error}/>}
    <label>Execution repository</label><Select style={{width:'100%'}} aria-label="Execution repository" showSearch optionFilterProp="label" value={execution||undefined} placeholder="Choose a repository you administer" options={repositories.filter(r=>r.can_configure).map(r=>({value:r.full_name,label:r.full_name}))} onChange={value=>{setExecution(value);setProjects([]);setEditing(undefined);setConfigurationPreview(undefined);setPreview(undefined);setInstalled('');}}/>
    <Button disabled={!execution||!auth.session} onClick={()=>void act(async()=>{setProjects((await auth.api<{projects:typeof projects}>('projects?repository='+encodeURIComponent(execution))).projects);})}>Load configured projects</Button>
    <Table rowKey="id" dataSource={projects} columns={[{title:'Source',render:(_,p)=><a href={'#'+new URLSearchParams({repository:execution,project:p.id,tab:'overview'}).toString()}>{p.source_repository.full_name}</a>},{title:'Relationship',dataIndex:'relationship'},{title:'Configuration',render:(_,p)=><Button onClick={()=>{setConfigurationPreview(undefined);setEditing({id:p.id,text:JSON.stringify({preferred_branch:p.preferred_branch,enabled_scanners:p.enabled_scanners,deferred_channels:p.deferred_channels,report_budget_bytes:p.report_budget_bytes},null,2)});}}>Edit configuration</Button>}]}/>
    {more&&<Button onClick={()=>void list(page+1)}>Load more repositories</Button>}
    <label>Source repository (optional)</label><Input aria-label="Source repository" value={source} onChange={e=>{setSource(e.target.value);setPreview(undefined);}} placeholder="Leave blank to analyze the execution repository"/>
    <p>Another public owner/repository is treated as read-only. Installation adds workflow wrappers and configuration only to the execution repository.</p>
    <Button disabled={!auth.session||!execution} loading={busy} onClick={()=>void act(async()=>{setPreview(await auth.api<Preview>('connections/preview',{execution_repository:execution,source_repository:source||execution}));})}>Preview setup</Button>
    {preview&&<><Alert type="info" showIcon title={preview.project.relationship==='observer'?'Read-only upstream analysis':'Connected repository analysis'} description={preview.detection.notice}/>
      <Table pagination={false} rowKey="path" dataSource={preview.detection.detected_manifests.map(path=>({path}))} columns={[{title:'Detected manifest',dataIndex:'path'}]}/>
      <Collapse items={Object.entries(preview.files).map(([path,content])=>({key:path,label:path,children:<pre style={{overflow:'auto',maxHeight:360}}>{content}</pre>}))}/>
      <p>Confirming commits exactly these files to {execution}'s default branch. Protected branches are never bypassed.</p>
      <Button type="primary" loading={busy} onClick={()=>void act(async()=>{const result=await auth.api<{commit_sha:string}>('connections/install',{confirmation:preview.confirmation,confirm:true});setInstalled(result.commit_sha);setPreview(undefined);})}>Confirm installation commit</Button></>}
    {installed&&<Alert type="success" showIcon title="Configuration installed" description={<><Tag>{installed.slice(0,12)}</Tag><a href={`https://github.com/${execution}/actions`} target="_blank" rel="noreferrer">Verify Actions and start analysis</a></>}/>}
    <Modal open={!!editing} title="Review project configuration" onCancel={()=>{setEditing(undefined);setConfigurationPreview(undefined);}} footer={null} width={800}>
      <p>Edit the preferred branch, enabled scanners, explicit deferral reasons and current-report budget. Source identity and trusted execution commands remain in the repository profile.</p>
      {error&&<Alert type="error" title="Configuration needs attention" description={error}/>}
      <Input.TextArea aria-label="Project configuration JSON" rows={16} value={editing?.text} onChange={e=>{setEditing(old=>old?{...old,text:e.target.value}:old);setConfigurationPreview(undefined);}}/>
      <Button loading={busy} onClick={()=>void act(async()=>{setConfigurationPreview(await auth.api('projects/preview',{repository:execution,project_id:editing?.id,changes:JSON.parse(editing?.text||'{}')}));})}>Preview configuration commit</Button>
      {configurationPreview&&<><Collapse items={Object.entries(configurationPreview.files).map(([path,content])=>({key:path,label:path,children:<pre style={{maxHeight:360,overflow:'auto'}}>{content}</pre>}))}/><p>Confirming commits exactly this file. Download or copy it for manual installation if branch protection blocks the commit.</p><Button type="primary" loading={busy} onClick={()=>void act(async()=>{const result=await auth.api<{commit_sha:string}>('connections/install',{confirmation:configurationPreview.confirmation,confirm:true});setInstalled(result.commit_sha);setEditing(undefined);setConfigurationPreview(undefined);setProjects((await auth.api<{projects:typeof projects}>('projects?repository='+encodeURIComponent(execution))).projects);})}>Confirm configuration commit</Button></>}
    </Modal>
  </section>;
}
