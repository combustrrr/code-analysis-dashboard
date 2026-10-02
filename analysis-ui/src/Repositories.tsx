import {useEffect,useState} from 'react';
import {Alert, Button, Collapse, Input, Modal, Select, Space, Steps, Table, Tag} from 'antd';
import {useLaunchAuth} from './useLaunchAuth';

type Repository = {id:number;full_name:string;can_configure:boolean};
type Preview = {confirmation:string;files:Record<string,string>;project:{relationship:string;source_repository:{full_name:string}};detection:{notice:string;detected_manifests:string[]}};
export function Repositories({auth,endpoint}:{endpoint?:string;auth:ReturnType<typeof useLaunchAuth>}) {
  const [editing,setEditing]=useState<{id:string;text:string}>();
  const [configurationPreview,setConfigurationPreview]=useState<{confirmation:string;files:Record<string,string>}>();
  const [installation,setInstallation]=useState<string>();
  useEffect(()=>{setInstallation(undefined);if(!endpoint)return;let active=true;fetch(endpoint+'/api/public/config').then(r=>{if(!r.ok)throw Error('Installation configuration unavailable');return r.json();}).then(r=>{if(active && /^https:\/\/github\.com\/apps\/[a-z0-9-]+\/installations\/new$/.test(r.installation_url||''))setInstallation(r.installation_url);}).catch(()=>{});return()=>{active=false;};},[endpoint]);
  const [repositories,setRepositories]=useState<Repository[]>([]);
  const [projects,setProjects]=useState<{id:string;source_repository:{full_name:string};relationship:string;preferred_branch:string;profile:Record<string,unknown>;enabled_scanners:string[];deferred_channels:Record<string,string>}[]>([]);
  const [execution,setExecution]=useState('');
  const [source,setSource]=useState('');
  const [preview,setPreview]=useState<Preview>();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [installed,setInstalled]=useState('');
  const [page,setPage]=useState(1);
  const [more,setMore]=useState(false);
  const [quickProject,setQuickProject]=useState<{id:string;name:string}>();
  const [quickKind,setQuickKind]=useState<'branch'|'pr'|'commit'>('branch');
  const [quickRef,setQuickRef]=useState('');
  const [targets,setTargets]=useState<{branches:{name:string;sha:string}[];prs:{number:number;head_sha:string;head_repository:string;base_sha:string;base_branch:string}[]}>();
  async function act(operation:()=>Promise<void>) {setBusy(true);setError('');try{await operation();}catch(e){setError(String(e));}finally{setBusy(false);}}
   async function list(next=1) {await act(async()=>{const result=await auth.api<{repositories:Repository[];has_more:boolean}>(`repositories?page=${next}`);setRepositories(old=>[...new Map((next===1?result.repositories:[...old,...result.repositories]).map(r=>[r.id,r])).values()]);setPage(next);setMore(result.has_more);});}
   useEffect(()=>{setRepositories([]);setProjects([]);setExecution('');setPreview(undefined);setEditing(undefined);setConfigurationPreview(undefined);setInstalled('');setMore(false);setError('');},[auth.session?.login]);
   useEffect(()=>{if(auth.session) void list();},[auth.session?.login]);
  return <section className="connections-panel" aria-label="Connect repository">
    <h2>Repositories</h2><p>Run analysis in a repository you control. A read-only source is analyzed without changing that source repository.</p>
    <Steps current={installed?3:preview?2:execution?1:0} items={[{title:'Connect GitHub'},{title:'Select codebase'},{title:'Review installation'},{title:'Ready'}]}/>
    {installation&&<Button href={installation} target="_blank" rel="noreferrer">Install GitHub App on selected repositories</Button>}
    {!auth.session?<Button onClick={auth.signIn} disabled={!auth.available}>Sign in with GitHub</Button>:<Space wrap><span>Signed in as {auth.session.login}</span><Button aria-label="Load repositories" loading={busy} onClick={()=>void list()}>Load repositories</Button><Button disabled={busy} onClick={auth.signOut}>Sign out</Button></Space>}
    {(error||auth.error)&&<Alert type="error" showIcon title="Connection needs attention" description={error||auth.error}/>}
    <label>Execution repository</label><Select style={{width:'100%'}} aria-label="Execution repository" disabled={busy||!auth.session} showSearch optionFilterProp="label" value={execution||undefined} placeholder="Choose an accessible execution repository" options={repositories.map(r=>({value:r.full_name,label:r.full_name+(r.can_configure?'':' (scan access; administrator required for setup)')}))} onChange={value=>{setExecution(value);setSource('');setError('');setProjects([]);setEditing(undefined);setConfigurationPreview(undefined);setPreview(undefined);setInstalled('');}}/>
    <Button disabled={busy||!execution||!auth.session} onClick={()=>void act(async()=>{setProjects((await auth.api<{projects:typeof projects}>('projects?repository='+encodeURIComponent(execution))).projects);})}>Load configured projects</Button>
     <Table locale={{emptyText: execution ? 'No configured source projects found for this execution repository.' : 'Choose an execution repository to load configured projects.'}} rowKey="id" dataSource={projects} columns={[
      {title:'Source',render:(_,p)=><a href={'#'+new URLSearchParams({repository:execution,project:p.id,tab:'overview'}).toString()}>{p.source_repository.full_name}</a>},
      {title:'Relationship',dataIndex:'relationship'},
      {title:'Quick analyze',render:(_,p)=><Button disabled={busy} onClick={()=>void act(async()=>{setQuickProject({id:p.id,name:p.source_repository.full_name});setTargets(await auth.api('project-targets?'+new URLSearchParams({repository:execution,project_id:p.id}).toString()));setQuickKind('branch');setQuickRef(p.preferred_branch);} )}>Analyze…</Button>},
      {title:'Configuration',render:(_,p)=><Button disabled={busy||!repositories.find(r=>r.full_name===execution)?.can_configure} onClick={()=>{setConfigurationPreview(undefined);setEditing({id:p.id,text:JSON.stringify({profile:p.profile,preferred_branch:p.preferred_branch,enabled_scanners:p.enabled_scanners,deferred_channels:p.deferred_channels},null,2)});}}>Edit configuration</Button>}
    ]}/>
    {more&&<Button disabled={busy} onClick={()=>void list(page+1)}>Load more repositories</Button>}
    <label>Source repository (optional)</label><Input aria-label="Source repository" disabled={busy||!auth.session} value={source} onChange={e=>{setSource(e.target.value);setPreview(undefined);}} placeholder="Leave blank to analyze the execution repository"/>
    <p>Another public owner/repository is treated as read-only. Installation adds workflow wrappers and configuration only to the execution repository.</p>
    <Button aria-label="Preview setup" disabled={busy||!auth.session||!execution||!repositories.find(r=>r.full_name===execution)?.can_configure} loading={busy} onClick={()=>void act(async()=>{setPreview(undefined);setInstalled('');setPreview(await auth.api<Preview>('connections/preview',{execution_repository:execution,source_repository:source.trim()||execution}));})}>Preview setup</Button>
    {preview&&<><Alert type="info" showIcon title={preview.project.relationship==='observer'?'Read-only upstream analysis':'Connected repository analysis'} description={preview.detection.notice}/>
      <Table pagination={false} rowKey="path" dataSource={preview.detection.detected_manifests.map(path=>({path}))} columns={[{title:'Detected manifest',dataIndex:'path'}]}/>
      <Collapse items={Object.entries(preview.files).map(([path,content])=>({key:path,label:path,children:<pre style={{overflow:'auto',maxHeight:360}}>{content}</pre>}))}/>
      <p>Confirming commits exactly these files to {execution}'s default branch. Protected branches are never bypassed.</p>
      <Button aria-label="Confirm installation commit" type="primary" loading={busy} onClick={()=>void act(async()=>{const result=await auth.api<{commit_sha:string}>('connections/install',{confirmation:preview.confirmation,confirm:true});setInstalled(result.commit_sha);setPreview(undefined);})}>Confirm installation commit</Button></>}
    {installed&&<Alert type="success" showIcon title="Configuration installed" description={<><Tag>{installed.slice(0,12)}</Tag><a href={`https://github.com/${execution}/actions`} target="_blank" rel="noreferrer">Verify Actions and start analysis</a></>}/>}
    <Modal open={!!quickProject} title={`Analyze ${quickProject?.name||''}`} onCancel={()=>{if(busy)return;setQuickProject(undefined);setTargets(undefined);}} footer={null} width={680}>
      {error&&<Alert type="error" title="Analysis request" description={error}/>}    
      <p>Select a revision to analyze. Branch lists latest heads; PRs list open requests. You can also paste a full commit SHA.</p>
      <div style={{display:'flex',gap:8,marginBottom:8}}>
        <Select style={{minWidth:140}} aria-label="Revision kind" value={quickKind} options={[{value:'branch',label:'Branch'},{value:'pr',label:'Pull request'},{value:'commit',label:'Commit SHA'}]} onChange={v=>{setQuickKind(v);setQuickRef(v==='branch'?(targets?.branches?.[0]?.name||''):'');}}/>
        {quickKind==='branch' && <Select showSearch style={{flex:1}} aria-label="Branches" value={quickRef||undefined} options={(targets?.branches||[]).map(b=>({value:b.name,label:`${b.name}`}))} onChange={setQuickRef}/>} 
        {quickKind==='pr' && <Select showSearch style={{flex:1}} aria-label="Open PRs" value={quickRef||undefined} options={(targets?.prs||[]).map(p=>({value:String(p.number),label:`#${p.number} ${p.base_branch}←`}))} onChange={setQuickRef}/>} 
        {quickKind==='commit' && <Input aria-label="Commit SHA" placeholder="40-character SHA" value={quickRef} onChange={e=>setQuickRef(e.target.value)}/>}
      </div>
      <Space>
        <Button type="primary" disabled={!quickProject||!execution||busy|| (quickKind==='commit' ? !/^([a-fA-F0-9]{40})$/.test(quickRef) : !quickRef)} onClick={()=>void act(async()=>{
          await auth.api('project-launch',{repository:execution,project_id:quickProject!.id,kind:quickKind,ref:quickKind==='commit'?quickRef.toLowerCase():quickRef});
          // Navigate to project overview; auto-refresh will follow published results.
          location.hash=new URLSearchParams({repository:execution,project:quickProject!.id,tab:'overview'}).toString();
          setQuickProject(undefined); setTargets(undefined);
        })}>Run analysis</Button>
        <Button onClick={()=>{setQuickProject(undefined);setTargets(undefined);}}>Cancel</Button>
      </Space>
    </Modal>
    <Modal open={!!editing} title="Review project configuration" onCancel={()=>{if(busy)return;setEditing(undefined);setConfigurationPreview(undefined);}} footer={null} width={800}>
      <p>Edit the preferred branch, enabled scanners and explicit deferral reasons. The profile includes trusted execution commands; review command changes carefully before confirming. Source identity cannot be changed here.</p>
      {error&&<Alert type="error" title="Configuration needs attention" description={error}/>}
      <Input.TextArea aria-label="Project configuration JSON" disabled={busy} rows={16} value={editing?.text} onChange={e=>{setEditing(old=>old?{...old,text:e.target.value}:old);setConfigurationPreview(undefined);}}/>
      <Button aria-label="Preview configuration commit" loading={busy} onClick={()=>void act(async()=>{setConfigurationPreview(undefined);setConfigurationPreview(await auth.api('projects/preview',{repository:execution,project_id:editing?.id,changes:JSON.parse(editing?.text||'{}')}));})}>Preview configuration commit</Button>
      {configurationPreview&&<><Collapse items={Object.entries(configurationPreview.files).map(([path,content])=>({key:path,label:path,children:<pre style={{maxHeight:360,overflow:'auto'}}>{content}</pre>}))}/><p>Confirming commits exactly this file. Download or copy it for manual installation if branch protection blocks the commit.</p><Button aria-label="Confirm configuration commit" type="primary" loading={busy} onClick={()=>void act(async()=>{const result=await auth.api<{commit_sha:string}>('connections/install',{confirmation:configurationPreview.confirmation,confirm:true});setInstalled(result.commit_sha);setEditing(undefined);setConfigurationPreview(undefined);setProjects((await auth.api<{projects:typeof projects}>('projects?repository='+encodeURIComponent(execution))).projects);})}>Confirm configuration commit</Button></>}
    </Modal>
  </section>;
}
