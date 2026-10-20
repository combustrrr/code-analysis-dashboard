import test from 'node:test';
import assert from 'node:assert/strict';
import {repositoryApi,channelProgress,cachedChannelsForSnapshot} from './repository-api.mjs';
import {CONFIGURED_TARGETS, EXECUTION_REPOSITORY, EXECUTION_REPOSITORY_ID} from './target-registry.mjs';

class Failure extends Error { constructor(status,message,code){super(message);this.status=status;this.code=code;} }
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
const env={APPLICATION_MODE:'repositories',ANALYSIS_REPOSITORY:EXECUTION_REPOSITORY,ANALYSIS_REPOSITORY_ID:String(EXECUTION_REPOSITORY_ID),MAX_LAUNCH_BYTES:2048};
const config={schema_version:'analysis-projects-v1',execution_repository:{id:EXECUTION_REPOSITORY_ID,full_name:EXECUTION_REPOSITORY},tooling_sha:'a'.repeat(40),projects:CONFIGURED_TARGETS.map(target=>({id:target.id,source_repository:{id:target.repository_id,full_name:target.repository,private:false},relationship:target.relationship,preferred_branch:target.branch,native_feedback_enabled:target.native_feedback,profile:{mode:'portable'},enabled_scanners:['semgrep','snyk'],deferred_channels:{},report_budget_bytes:900000000}))};
const configBlob={content:Buffer.from(JSON.stringify(config)).toString('base64')};
const host=(permissions={pull:true,push:true,admin:false})=>({id:EXECUTION_REPOSITORY_ID,full_name:EXECUTION_REPOSITORY,private:false,default_branch:'main',permissions});

function helpers({permissions,overrides={},wakeCoordinator}={}) {
  const calls=[],queueCalls=[],wakeCalls=[];
  const serviceToken=async()=> 'central-app-read-token';
  const github=async(path,token,options={})=>{
    calls.push({path,token,options});
    if(Object.hasOwn(overrides,path))return overrides[path];
    if(path===`repos/${EXECUTION_REPOSITORY}`)return host(permissions);
    if(path===`repos/${EXECUTION_REPOSITORY}/contents/.github/code-analysis/projects.json?ref=main`)return configBlob;
    if(path==='user')return {id:73,login:'scanner-writer'};
    const source=CONFIGURED_TARGETS.find(target=>path===`repos/${target.repository}`);
    if(source)return {id:source.repository_id,full_name:source.repository,private:false,default_branch:source.branch,permissions:{pull:true}};
    throw new Error(`Unexpected GitHub request: ${path}`);
  };
  return {calls,queueCalls,wakeCalls,Failure,json,github,serviceToken,pages:async()=>[],wakeCoordinator:async(...args)=>{wakeCalls.push(args);if(wakeCoordinator)return wakeCoordinator(...args);},queue:async(path,body)=>{queueCalls.push({path,body});if(path==='/queue/status')return json({error:'not_found'},404);if(path==='/queue/recent')return json({requests:[]});return json({...body.request,status:'queued',queue_position:1},201);},seal:async value=>Buffer.from(JSON.stringify(value)).toString('base64url'),unseal:async value=>{const result=JSON.parse(Buffer.from(value,'base64url').toString());if(result.exp<=Date.now())throw new Error('expired');return result;}};
}

const session={token:'user-token'};
const get=(path)=>new Request(`https://worker.example${path}`);
const post=(path,value)=>new Request(`https://worker.example${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
const postWithKey=(path,value,key)=>new Request(`https://worker.example${path}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(value)});

test('channel progress follows selected lanes and shared producers',()=>{
  const progress=channelProgress(['semgrep','eslint','typescript','snyk'],[
    {name:'Semgrep scanner',status:'in_progress'},
    {name:'Portable typescript-quality',status:'completed',conclusion:'success'},
    {name:'Isolated Snyk evidence',status:'queued'},
  ],'in_progress');
  assert.deepEqual(progress.map(value=>value.status),['in_progress','success','success','queued']);
});

test('pull-only collaborators can list and launch from the exact fixed target registry',async()=>{
  const h=helpers({permissions:{pull:true,push:false,admin:false}});
  const response=await repositoryApi(get('/api/projects'),env,session,h);
  const result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.execution_repository.full_name,EXECUTION_REPOSITORY);
  assert.equal(result.can_launch,true);
  assert.equal(result.can_configure,false);
  assert.deepEqual(result.projects.map(project=>project.id),CONFIGURED_TARGETS.map(project=>project.id));
  assert.deepEqual(result.projects.map(({id,relationship})=>[id,relationship]),CONFIGURED_TARGETS.map(({id,relationship})=>[id,relationship]));
  assert.ok(h.calls.some(call=>call.path.includes('/contents/.github/code-analysis/projects.json')&&call.token==='central-app-read-token'));
  assert.ok(!JSON.stringify(result).includes('user-token'));
});

test('reviewed agentic scanner profiles remain listable while portable profiles are validated',async()=>{
  const agenticConfig={...config,projects:config.projects.map((project,index)=>index===0?{...project,profile:{mode:'agentic-soc',python_root:'backend',python_test_command:['python','-m','pytest'],snyk_python_manifests:['backend/requirements.txt']}}:project)};
  const agenticHelpers=helpers({overrides:{[`repos/${EXECUTION_REPOSITORY}/contents/.github/code-analysis/projects.json?ref=main`]:{content:Buffer.from(JSON.stringify(agenticConfig)).toString('base64')}}});
  const response=await repositoryApi(get('/api/projects'),env,session,agenticHelpers);
  assert.equal(response.status,200);
  assert.equal((await response.json()).projects.length,CONFIGURED_TARGETS.length);

  const invalidConfig={...config,projects:config.projects.map((project,index)=>index===0?{...project,profile:{mode:'portable',commands:{eslint:{cwd:'../outside',argv:['eslint','.']}}}}:project)};
  const invalidHelpers=helpers({overrides:{[`repos/${EXECUTION_REPOSITORY}/contents/.github/code-analysis/projects.json?ref=main`]:{content:Buffer.from(JSON.stringify(invalidConfig)).toString('base64')}}});
  await assert.rejects(()=>repositoryApi(get('/api/projects'),env,session,invalidHelpers),error=>error.status===503&&error.code==='project_profile_invalid');
});

test('read-only collaborators can inspect configured project readiness',async()=>{
  const response=await repositoryApi(get('/api/project-readiness?project_id=1278177697'),env,session,helpers({permissions:{pull:true,push:false,admin:false}}));
  const result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.project_id,'1278177697');
  assert.equal(result.preferred_branch,'Testing');
  assert.ok(result.channels.some(channel=>channel.channel==='semgrep'&&channel.status==='profile_declared'&&channel.last_observed===null));
  assert.ok(result.channels.every(channel=>channel.status!=='completed'));
});

test('read-only collaborators can preview an exact branch revision and trusted channel choices',async()=>{
  const source=CONFIGURED_TARGETS[0];
  const h=helpers({permissions:{pull:true,push:false,admin:false},overrides:{[`repos/${source.repository}/branches/Testing`]:{commit:{sha:'b'.repeat(40)}}}});
  const response=await repositoryApi(post('/api/project-preview',{project_id:source.id,selection:{kind:'branch',ref:'Testing'}}),env,session,h);
  const result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.target_sha,'b'.repeat(40));
  assert.equal(result.selection.ref,'Testing');
  assert.equal(result.channels.find(channel=>channel.id==='semgrep').default_selected,true);
  assert.equal(result.channels.find(channel=>channel.id==='snyk').mode,'vendor');
  assert.ok(result.preview_token);
  assert.ok(h.calls.every(call=>!call.options.method));
});

test('CodeRabbit selection is unavailable outside an open PR and launch validation enforces the restriction',async()=>{
  const source=CONFIGURED_TARGETS[0];
  const configured={...config,projects:config.projects.map(project=>project.id===source.id?{...project,enabled_scanners:[...project.enabled_scanners,'coderabbit-ai-advisory']}:project)};
  const registryPath=`repos/${EXECUTION_REPOSITORY}/contents/.github/code-analysis/projects.json?ref=main`;
  const h=helpers({overrides:{[registryPath]:{content:Buffer.from(JSON.stringify(configured)).toString('base64')},
    [`repos/${source.repository}/branches/Testing`]:{commit:{sha:'a'.repeat(40)}},
    [`repos/${source.repository}/pulls/7`]:{number:7,title:'Review',draft:false,head:{ref:'topic',sha:'b'.repeat(40),repo:{id:999,full_name:'fork/repo'}},base:{ref:'Testing',sha:'c'.repeat(40),repo:{full_name:source.repository}}}}});
  const branch=await (await repositoryApi(post('/api/project-preview',{project_id:source.id,selection:{kind:'branch',ref:'Testing'}}),env,session,h)).json();
  const branchChoice=branch.channels.find(channel=>channel.id==='coderabbit-ai-advisory');
  assert.equal(branchChoice.selectable,false);
  assert.equal(branchChoice.status,'NOT_APPLICABLE');
  assert.match(branchChoice.reason,/open pull request/);
  const pr=await (await repositoryApi(post('/api/project-preview',{project_id:source.id,selection:{kind:'pr',ref:'7'}}),env,session,h)).json();
  assert.equal(pr.channels.find(channel=>channel.id==='coderabbit-ai-advisory').selectable,true);
  await assert.rejects(()=>repositoryApi(post('/api/project-launch',{project_id:source.id,preview_token:branch.preview_token,
    requested_channels:['coderabbit-ai-advisory'],idempotency_key:'33333333-3333-4333-8333-333333333333'}),env,session,h),
    error=>error.status===400&&error.code==='invalid_channels');
});

test('matching preview cache includes CodeRabbit only for the same PR head and base context',()=>{
  const snapshot={target_sha:'b'.repeat(40),tooling_sha:'a'.repeat(40),profile_digest:'c'.repeat(64),
    pr_context:{number:7,head_repository:'fork/repo',head_repository_id:999,base_sha:'d'.repeat(40)}};
  const manifest={current_target_id:'current:1',targets:[{id:'current:1',analyzed_sha:snapshot.target_sha,tooling_sha:snapshot.tooling_sha,
      profile_digest:snapshot.profile_digest,channel_statuses:[{channel:'semgrep',status:'COMPLETED'}]}],
    current_overlay:{status:'complete',project_id:'1',head_sha:snapshot.target_sha,tooling_sha:snapshot.tooling_sha,
      profile_digest:snapshot.profile_digest,pr_context:{...snapshot.pr_context}}};
  assert.deepEqual(cachedChannelsForSnapshot(snapshot,manifest),['semgrep','coderabbit-ai-advisory']);
  assert.deepEqual(cachedChannelsForSnapshot(snapshot,{...manifest,current_overlay:{...manifest.current_overlay,
    pr_context:{...manifest.current_overlay.pr_context,base_sha:'e'.repeat(40)}}}),['semgrep']);
  assert.deepEqual(cachedChannelsForSnapshot({...snapshot,pr_context:null},manifest),['semgrep']);
  assert.deepEqual(cachedChannelsForSnapshot({...snapshot,pr_context:{...snapshot.pr_context,head_repository_id:1000}},manifest),['semgrep']);
});

test('incomplete individual PR heads are disclosed without blocking usable inventory',async()=>{
  const source=CONFIGURED_TARGETS[0];
  const h=helpers();
  h.pages=async path=>path.endsWith('/branches')?[{name:'Testing',commit:{sha:'a'.repeat(40)}}]:[{number:8,title:'Unavailable fork',head:{ref:'fork',sha:'c'.repeat(40),repo:null},base:{ref:'Testing',sha:'a'.repeat(40)}}];
  const result=await (await repositoryApi(get(`/api/project-targets?project_id=${source.id}`),env,session,h)).json();
  assert.equal(result.inventory_complete,false);
  assert.match(result.inventory_warning,/PR head repository unavailable/);
  assert.equal(result.branches.length,1);
  assert.equal(result.prs[0].available,false);
  assert.equal(result.prs[0].draft,false);
});

test('confirmation rejects refs that move after the signed preview',async()=>{
  const source=CONFIGURED_TARGETS[0];
  const overrides={[`repos/${source.repository}/branches/Testing`]:{commit:{sha:'b'.repeat(40)}}};
  const h=helpers({overrides});
  const preview=await (await repositoryApi(post('/api/project-preview',{project_id:source.id,selection:{kind:'branch',ref:'Testing'}}),env,session,h)).json();
  overrides[`repos/${source.repository}/branches/Testing`]={commit:{sha:'c'.repeat(40)}};
  await assert.rejects(()=>repositoryApi(post('/api/project-launch',{project_id:source.id,preview_token:preview.preview_token,requested_channels:['semgrep'],idempotency_key:'11111111-1111-4111-8111-111111111111'}),env,session,h),error=>error.status===409&&error.code==='stale_preview');
});

test('pull-only collaborator launch persists a pinned v3 envelope and idempotent request identity',async()=>{
  const source=CONFIGURED_TARGETS[0];
  const h=helpers({permissions:{pull:true,push:false,admin:false},overrides:{[`repos/${source.repository}/pulls/7`]:{number:7,title:'Fix',draft:true,head:{ref:'topic',sha:'d'.repeat(40),repo:{id:999,full_name:'fork/repo'}},base:{ref:'Testing',sha:'e'.repeat(40),repo:{full_name:source.repository}}}}});
  const preview=await (await repositoryApi(post('/api/project-preview',{project_id:source.id,selection:{kind:'pr',ref:'7'}}),env,session,h)).json();
  const input={project_id:source.id,preview_token:preview.preview_token,requested_channels:['semgrep'],idempotency_key:'22222222-2222-4222-8222-222222222222'};
  const response=await repositoryApi(post('/api/project-launch',input),env,session,h);
  const envelope=h.queueCalls[0].body.request;
    assert.equal(response.status,202);
    assert.equal((await response.clone().json()).queue_position,1);
    assert.equal(envelope.schema_version,'analysis-request-v3');
    assert.equal(envelope.source_sha,'d'.repeat(40));
    assert.equal(envelope.selection.kind,'pr');
    assert.equal(envelope.resolved_selection.kind,'commit');
    assert.equal(envelope.resolved_selection.ref,'d'.repeat(40));
    assert.equal(envelope.pr_context.head_repository,'fork/repo');
    assert.equal(envelope.resolved_selection.repository,'fork/repo');
    assert.equal(envelope.resolved_selection.repository_id,999);
    assert.deepEqual(envelope.requested_channels,['semgrep']);
    assert.deepEqual(envelope.selection,preview.selection);
    assert.deepEqual(envelope.pr_context,preview.pr_context);
    assert.equal(envelope.project_id,source.id);
    assert.equal(envelope.actor_id,73);
  assert.equal(h.queueCalls[0].path,'/queue/admit');
  assert.equal(h.calls.some(call=>call.options.method&&call.options.method!=='GET'),false);
});

test('Fast Path allows a pull-only collaborator and admits only trusted default channels',async()=>{
  const source=CONFIGURED_TARGETS[0],key='44444444-4444-4444-8444-444444444444';
  const h=helpers({permissions:{pull:true,push:false,admin:false},overrides:{[`repos/${source.repository}/branches/${source.branch}`]:{commit:{sha:'f'.repeat(40)}}}});
  const response=await repositoryApi(postWithKey('/api/project-launch-fast',{projectId:source.id,refType:'PREFERRED_BRANCH'},key),env,session,h);
  const result=await response.json(),intent=h.queueCalls.find(call=>call.path==='/queue/admit').body.request;
  assert.equal(response.status,202);
  assert.equal(result.request_id,key);
  assert.equal(intent.target_sha,'f'.repeat(40));
  assert.equal(intent.selection.ref,source.branch);
  assert.deepEqual(intent.requested_channels,['semgrep']);
  assert.ok(h.queueCalls.some(call=>call.path==='/queue/status'));
  assert.deepEqual(h.wakeCalls,[[key,'f'.repeat(40)]]);
});

test('a failed wake does not undo durable queue acceptance',async()=>{const source=CONFIGURED_TARGETS[0],key='45555555-5555-4555-8555-555555555555';const h=helpers({wakeCoordinator:async()=>{throw new Error('dispatch unavailable');},overrides:{[`repos/${source.repository}/branches/${source.branch}`]:{commit:{sha:'f'.repeat(40)}}}});const response=await repositoryApi(postWithKey('/api/project-launch-fast',{projectId:source.id,refType:'PREFERRED_BRANCH'},key),env,session,h);assert.equal(response.status,202);assert.equal((await response.json()).wake_status,'scheduled_recovery');assert.ok(h.queueCalls.some(call=>call.path==='/queue/admit'));});

test('Fast Path requires a key, exact intent, and current collaborator access',async()=>{
  const source=CONFIGURED_TARGETS[0],intent={projectId:source.id,refType:'PREFERRED_BRANCH'};
  await assert.rejects(()=>repositoryApi(post('/api/project-launch-fast',intent),env,session,helpers()),error=>error.status===400&&error.code==='invalid_idempotency_key');
  await assert.rejects(()=>repositoryApi(postWithKey('/api/project-launch-fast',{...intent,channels:['semgrep']},'55555555-5555-4555-8555-555555555555'),env,session,helpers()),error=>error.status===400&&error.code==='invalid_fast_path_intent');
  await assert.rejects(()=>repositoryApi(postWithKey('/api/project-launch-fast',intent,'55555555-5555-4555-8555-555555555555'),env,session,helpers({permissions:{pull:false,push:false,admin:false}})),error=>error.status===403&&error.code==='repository_read_required');
});

test('Fast Path retries return the original accepted request',async()=>{
  const source=CONFIGURED_TARGETS[0],key='66666666-6666-4666-8666-666666666666';
  const h=helpers();h.queue=async(path,body)=>{h.queueCalls.push({path,body});if(path==='/queue/status')return json({request_id:key,status:'queued',queue_position:3,intent:{project_id:source.id,selection:{kind:'branch',ref:source.branch},target_sha:'d'.repeat(40),requested_channels:['semgrep']}},200);throw new Error('must not admit duplicate');};
  const response=await repositoryApi(postWithKey('/api/project-launch-fast',{projectId:source.id,refType:'PREFERRED_BRANCH'},key),env,session,h);
  assert.equal(response.status,202);assert.deepEqual(await response.json(),{status:'queued',request_id:key,run_id:null,repository:EXECUTION_REPOSITORY,source_repository:source.repository,target_sha:'d'.repeat(40),preferred_branch:source.branch,requested_channels:['semgrep'],queue_position:3,duplicate:true});
});

test('dashboard aggregate exposes bounded request metadata without credentials',async()=>{
  const h=helpers();h.queue=async path=>path==='/queue/recent'?json({requests:[{request_id:'77777777-7777-4777-8777-777777777777',status:'queued',created_at:'2026-10-19T00:00:00Z',intent:{project_id:CONFIGURED_TARGETS[0].id,selection:{kind:'branch',ref:CONFIGURED_TARGETS[0].branch},target_sha:'e'.repeat(40)}}]}):json({error:'not_found'},404);
  const response=await repositoryApi(get('/api/dashboard'),env,session,h),result=await response.json();
  assert.equal(response.status,200);assert.equal(result.projects.length,CONFIGURED_TARGETS.length);assert.equal(result.recent_requests.length,1);assert.ok(!JSON.stringify(result).includes('user-token'));
});

test('non-collaborators cannot launch and no user source repository can override the registry',async()=>{
  const h=helpers({permissions:{pull:false,push:false,admin:false}});
  await assert.rejects(()=>repositoryApi(post('/api/project-launch',{project_id:'1267340546',kind:'branch',ref:'Testing'}),env,session,h),error=>error.status===403&&error.code==='repository_read_required');
  assert.ok(h.calls.every(call=>!call.options.method));
  await assert.rejects(()=>repositoryApi(get('/api/projects?repository=attacker/private-repo'),env,session,helpers()),error=>error.status===400&&error.code==='repository_not_configurable');
});

test('retired configuration endpoints are absent',async()=>{
  assert.equal(await repositoryApi(post('/api/projects/preview',{project_id:'1278177697',changes:{}}),env,session,helpers({permissions:{pull:true,push:true,admin:true}})),null);
});

test('identity drift or an incomplete target registry fails closed',async()=>{
  const changed={...config,projects:config.projects.slice(0,2)};
  const h=helpers({overrides:{[`repos/${EXECUTION_REPOSITORY}/contents/.github/code-analysis/projects.json?ref=main`]:{content:Buffer.from(JSON.stringify(changed)).toString('base64')}}});
  await assert.rejects(()=>repositoryApi(get('/api/projects'),env,session,h),error=>error.status===503&&error.code==='target_registry_invalid');
  const sourceMismatch=helpers({overrides:{[`repos/${CONFIGURED_TARGETS[0].repository}`]:{id:99,full_name:CONFIGURED_TARGETS[0].repository,private:false}}});
  await assert.rejects(()=>repositoryApi(get('/api/project-readiness?project_id=1267340546'),env,session,sourceMismatch),error=>error.status===409&&error.code==='project_identity');
  const listMismatch=helpers({overrides:{[`repos/${CONFIGURED_TARGETS[1].repository}`]:{id:99,full_name:CONFIGURED_TARGETS[1].repository,private:false}}});
  await assert.rejects(()=>repositoryApi(get('/api/projects'),env,session,listMismatch),error=>error.status===409&&error.code==='project_identity');
});
