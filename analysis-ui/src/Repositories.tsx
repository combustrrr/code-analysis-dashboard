import {useEffect,useState} from 'react';
import {Alert, Button, Collapse, Input, Modal, Select, Space, Steps, Table, Tag} from 'antd';
import {useLaunchAuth} from './useLaunchAuth';
import type {ProjectRunRequest} from './ProjectRunTracker';

type Repository = {id:number;full_name:string;can_configure:boolean};
type Preview = {confirmation:string;files:Record<string,string>;project:{relationship:string;source_repository:{full_name:string};profile:Record<string,unknown>};detection:{notice:string;detected_manifests:string[];language_roots:{python:string[];javascript:string[]}}};
export function Repositories({auth,endpoint,onSubmitted}:{endpoint?:string;auth:ReturnType<typeof useLaunchAuth>;onSubmitted?:(request:ProjectRunRequest)=>void}) {
  const [editing,setEditing]=useState<{id:string;text:string}>();
  const [configurationPreview,setConfigurationPreview]=useState<{confirmation:string;files:Record<string,string>}>();
  const [installation,setInstallation]=useState<string>();
  useEffect(()=>{setInstallation(undefined);if(!endpoint)return;let active=true;fetch(endpoint+'/api/public/config').then(r=>{if(!r.ok)throw Error('Installation configuration unavailable');return r.json();}).then(r=>{if(active && /^https:\/\/github\.com\/apps\/[a-z0-9-]+\/installations\/new$/.test(r.installation_url||''))setInstallation(r.installation_url);}).catch(()=>{});return()=>{active=false;};},[endpoint]);
  const [repositories,setRepositories]=useState<Repository[]>([]);
  const [repositoriesLoaded,setRepositoriesLoaded]=useState(false);
  const [projects,setProjects]=useState<{id:string;source_repository:{full_name:string};relationship:string;preferred_branch:string;profile:Record<string,unknown>;enabled_scanners:string[];deferred_channels:Record<string,string>}[]>([]);
  const [projectsLoaded,setProjectsLoaded]=useState(false);
  const [projectsLoading,setProjectsLoading]=useState(false);
  const [execution,setExecution]=useState('');
  const [source,setSource]=useState('');
  const [preview,setPreview]=useState<Preview>();
  const [setupDiscovery,setSetupDiscovery]=useState<Preview>();
  const [folderSelections,setFolderSelections]=useState<{python?:string;javascript?:string}>({});
  const [scopeDirty,setScopeDirty]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [installed,setInstalled]=useState('');
  const [page,setPage]=useState(1);
  const [more,setMore]=useState(false);
  const [quickProject,setQuickProject]=useState<{id:string;name:string}>();
  const [quickKind,setQuickKind]=useState<'branch'|'pr'|'commit'>('branch');
  const [quickRef,setQuickRef]=useState('');
  const [targets,setTargets]=useState<{branches:{name:string;sha:string}[];prs:{number:number;title:string;head_branch:string;head_sha:string;head_repository:string;base_sha:string;base_branch:string}[]}>();
  async function act(operation:()=>Promise<void>) {setBusy(true);setError('');try{await operation();}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function list(next=1) {await act(async()=>{const result=await auth.api<{repositories:Repository[];has_more:boolean}>(`repositories?page=${next}`);setRepositories(old=>[...new Map((next===1?result.repositories:[...old,...result.repositories]).map(r=>[r.id,r])).values()]);setRepositoriesLoaded(true);setPage(next);setMore(result.has_more);});}
  async function loadProjects(repository=execution) {await act(async()=>{const result=await auth.api<{projects:typeof projects}>(`projects?repository=${encodeURIComponent(repository)}`);setProjects(result.projects);setProjectsLoaded(true);});}
  useEffect(()=>{setRepositories([]);setRepositoriesLoaded(false);setProjects([]);setProjectsLoaded(false);setProjectsLoading(false);setExecution('');setPreview(undefined);setSetupDiscovery(undefined);setFolderSelections({});setScopeDirty(false);setEditing(undefined);setConfigurationPreview(undefined);setInstalled('');setMore(false);setError('');},[auth.session?.login]);
  useEffect(()=>{if(auth.session) void list();},[auth.session?.login]);
  useEffect(()=>{
    if(!execution||!auth.session)return;
    let active=true;
    setProjectsLoaded(false);setProjectsLoading(true);setError('');
    auth.api<{projects:typeof projects}>(`projects?repository=${encodeURIComponent(execution)}`)
      .then(result=>{if(active){setProjects(result.projects);setProjectsLoaded(true);}})
      .catch(error=>{if(active)setError(String(error));})
      .finally(()=>{if(active)setProjectsLoading(false);});
    return()=>{active=false;};
  },[execution,auth.session?.login]);
  return <section className="connections-panel" aria-label="Connect repository">
     <h2>Your codebases</h2><p>Pick an execution repository, then open a configured project to inspect analysis results or start a run. Source repositories are never modified by scanning.</p>
      <Steps current={projects.length?3:execution?2:auth.session?1:0} items={[{title:'Authorize'},{title:'Repository'},{title:'Project'},{title:'Analyze'}]}/>
    {installation&&<Button href={installation} target="_blank" rel="noreferrer">Install GitHub App on selected repositories</Button>}
     {!auth.session?<Button onClick={auth.signIn} disabled={!auth.available}>Sign in with GitHub</Button>:<Space wrap><span>Signed in as {auth.session.login}</span><Button aria-label={repositoriesLoaded?'Refresh repositories':'Load repositories'} loading={busy} onClick={()=>void list()}>{repositoriesLoaded?'Refresh repository list':'Load repositories'}</Button><Button disabled={busy} onClick={auth.signOut}>Sign out</Button></Space>}
    {(error||auth.error)&&<Alert type="error" showIcon title="Connection needs attention" description={error||auth.error}/>}
    <label>Execution repository</label><Select style={{width:'100%'}} aria-label="Execution repository" disabled={busy||projectsLoading||!auth.session} showSearch optionFilterProp="label" value={execution||undefined} placeholder="Choose an accessible execution repository" options={repositories.map(r=>({value:r.full_name,label:r.full_name+(r.can_configure?'':' (scan access; administrator required for setup)')}))} onChange={value=>{setExecution(value);setSource('');setError('');setProjects([]);setProjectsLoaded(false);setEditing(undefined);setConfigurationPreview(undefined);setPreview(undefined);setSetupDiscovery(undefined);setFolderSelections({});setScopeDirty(false);setInstalled('');}}/>
    <Button disabled={busy||projectsLoading||!execution||!auth.session} loading={projectsLoading} onClick={()=>void loadProjects()}>{projectsLoaded?'Refresh configured projects':'Load configured projects'}</Button>
      <Table loading={projectsLoading} scroll={{x:'max-content'}} locale={{emptyText: execution ? 'No configured source projects found for this execution repository.' : 'Choose an execution repository to load configured projects.'}} rowKey="id" dataSource={projects} columns={[
      {title:'Source',render:(_,p)=><a href={'#'+new URLSearchParams({repository:execution,project:p.id,tab:'overview'}).toString()}>{p.source_repository.full_name}</a>},
      {title:'Relationship',dataIndex:'relationship'},
      {title:'Quick analyze',render:(_,p)=><Button disabled={busy} onClick={()=>void act(async()=>{setQuickProject({id:p.id,name:p.source_repository.full_name});setTargets(await auth.api('project-targets?'+new URLSearchParams({repository:execution,project_id:p.id}).toString()));setQuickKind('branch');setQuickRef(p.preferred_branch);} )}>Analyze…</Button>},
      {title:'Configuration',render:(_,p)=><Button disabled={busy||!repositories.find(r=>r.full_name===execution)?.can_configure} onClick={()=>{setConfigurationPreview(undefined);setEditing({id:p.id,text:JSON.stringify({profile:p.profile,preferred_branch:p.preferred_branch,enabled_scanners:p.enabled_scanners,deferred_channels:p.deferred_channels},null,2)});}}>Edit configuration</Button>}
    ]}/>
    {more&&<Button disabled={busy} onClick={()=>void list(page+1)}>Load more repositories</Button>}
     <Collapse className="repository-advanced" items={[{key:'source-setup',label:'Optional setup · map analysis folders',children:<div className="repository-setup-details">
       <p>Choose a source repository and map its Python and JavaScript folders. Scanning reads an immutable source revision; setup writes the reviewed profile and workflow files only to the execution repository.</p>
       <label>Source repository</label><Input aria-label="Source repository" disabled={busy||!auth.session} value={source} onChange={e=>{setSource(e.target.value);setPreview(undefined);setSetupDiscovery(undefined);setFolderSelections({});setScopeDirty(false);setInstalled('');}} placeholder="Leave blank to analyze the execution repository"/>
       <Button aria-label="Detect source folders" disabled={busy||!auth.session||!execution||!repositories.find(r=>r.full_name===execution)?.can_configure} loading={busy} onClick={()=>void act(async()=>{setPreview(undefined);setSetupDiscovery(undefined);setInstalled('');const result=await auth.api<Preview>('connections/preview',{execution_repository:execution,source_repository:source.trim()||execution});setSetupDiscovery(result);setPreview(result);setFolderSelections({python:typeof result.project.profile.python_root==='string'?result.project.profile.python_root:undefined,javascript:typeof result.project.profile.javascript_root==='string'?result.project.profile.javascript_root:undefined});setScopeDirty(false);})}>Detect folders</Button>
       {setupDiscovery&&<div className="analysis-folder-wizard">
         <div className="analysis-folder-heading"><span>LANGUAGE SCOPE</span><strong>Keep analysis inside the code you own</strong><p>Detected folders are choices, not guesses. Clear a field to leave that language out of this profile.</p></div>
         <label htmlFor="python-analysis-folder">Python folder</label>
         <Select id="python-analysis-folder" aria-label="Python analysis folder" allowClear showSearch optionFilterProp="label" placeholder="Skip Python" value={folderSelections.python} options={setupDiscovery.detection.language_roots.python.map(path=>({value:path,label:path==='.'?'Repository root · .':path}))} onChange={value=>{setFolderSelections(old=>({...old,python:value}));setPreview(undefined);setScopeDirty(true);}}/>
         <label htmlFor="javascript-analysis-folder">JavaScript / TypeScript folder</label>
         <Select id="javascript-analysis-folder" aria-label="JavaScript analysis folder" allowClear showSearch optionFilterProp="label" placeholder="Skip JavaScript" value={folderSelections.javascript} options={setupDiscovery.detection.language_roots.javascript.map(path=>({value:path,label:path==='.'?'Repository root · .':path}))} onChange={value=>{setFolderSelections(old=>({...old,javascript:value}));setPreview(undefined);setScopeDirty(true);}}/>
         <Button aria-label="Review selected analysis folders" disabled={busy||!scopeDirty} loading={busy} onClick={()=>void act(async()=>{const result=await auth.api<Preview>('connections/preview',{execution_repository:execution,source_repository:source.trim()||execution,analysis_folders:{python:folderSelections.python??null,javascript:folderSelections.javascript??null}});setSetupDiscovery(result);setPreview(result);setScopeDirty(false);})}>Review selected folders</Button>
       </div>}
       {(preview||setupDiscovery)&&<>
         <Alert type="info" showIcon title={setupDiscovery?.project.relationship==='observer'?'Read-only upstream analysis':'Connected repository analysis'} description={setupDiscovery?.detection.notice}/>
         <Space wrap aria-label="Reviewed analysis folders">
           <Tag>Python: {folderSelections.python||'not included'}</Tag>
           <Tag>JavaScript: {folderSelections.javascript||'not included'}</Tag>
         </Space>
         <Table pagination={false} rowKey="path" dataSource={setupDiscovery?.detection.detected_manifests.map(path=>({path}))} columns={[{title:'Detected manifest',dataIndex:'path'}]}/>
         {preview&&<><Collapse items={Object.entries(preview.files).map(([path,content])=>({key:path,label:path,children:<pre style={{overflow:'auto',maxHeight:360}}>{content}</pre>}))}/>
           <p>Review the exact files before confirming. Only configuration and workflow files are committed to {execution}'s default branch; protected branches are never bypassed.</p>
           <Button aria-label="Confirm installation commit" type="primary" disabled={scopeDirty} loading={busy} onClick={()=>void act(async()=>{const result=await auth.api<{commit_sha:string}>('connections/install',{confirmation:preview.confirmation,confirm:true});setInstalled(result.commit_sha);setPreview(undefined);})}>Confirm installation commit</Button></>}
       </>}
     </div>}]}/>
    {installed&&<Alert type="success" showIcon title="Configuration installed" description={<><Tag>{installed.slice(0,12)}</Tag><a href={`https://github.com/${execution}/actions`} target="_blank" rel="noreferrer">Verify Actions and start analysis</a></>}/>}
    <Modal open={!!quickProject} title={`Analyze ${quickProject?.name||''}`} onCancel={()=>{if(busy)return;setQuickProject(undefined);setTargets(undefined);}} footer={null} width={680}>
      {error&&<Alert type="error" title="Analysis request" description={error}/>}    
      <p>Select a revision to analyze. Branch lists latest heads; PRs list open requests. You can also paste a full commit SHA.</p>
      <div style={{display:'flex',gap:8,marginBottom:8}}>
        <Select style={{minWidth:140}} aria-label="Revision kind" value={quickKind} options={[{value:'branch',label:'Branch'},{value:'pr',label:'Pull request'},{value:'commit',label:'Commit SHA'}]} onChange={v=>{setQuickKind(v);setQuickRef(v==='branch'?(targets?.branches?.[0]?.name||''):'');}}/>
        {quickKind==='branch' && <Select showSearch style={{flex:1}} aria-label="Branches" value={quickRef||undefined} options={(targets?.branches||[]).map(b=>({value:b.name,label:`${b.name} · ${b.sha.slice(0,12)}`}))} onChange={setQuickRef}/>}
        {quickKind==='pr' && <Select showSearch style={{flex:1}} aria-label="Open PRs" value={quickRef||undefined} options={(targets?.prs||[]).map(p=>({value:String(p.number),label:`#${p.number} ${p.title ? p.title.slice(0,40) : ''} · ${p.head_branch} → ${p.base_branch}`}))} onChange={setQuickRef}/>}
        {quickKind==='commit' && <Input aria-label="Commit SHA" placeholder="40-character SHA" value={quickRef} onChange={e=>setQuickRef(e.target.value)}/>}
      </div>
      <Space>
        <Button aria-label="Run analysis" type="primary" disabled={!quickProject||!execution||busy|| (quickKind==='commit' ? !/^([a-fA-F0-9]{40})$/.test(quickRef) : !quickRef)} onClick={()=>void act(async()=>{
           const ref=quickKind==='commit'?quickRef.toLowerCase():quickRef;
           const receipt=await auth.api<{request_id:string;run_id:number|null}>('project-launch',{repository:execution,project_id:quickProject!.id,kind:quickKind,ref});
           onSubmitted?.({...receipt,repository:execution,project:quickProject!.id,kind:quickKind,ref,submittedAt:new Date().toISOString()});
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
