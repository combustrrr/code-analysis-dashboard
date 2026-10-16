import test from 'node:test';
import assert from 'node:assert/strict';
import {repositoryApi} from './repository-api.mjs';
import {CONFIGURED_TARGETS, EXECUTION_REPOSITORY, EXECUTION_REPOSITORY_ID} from './target-registry.mjs';

class Failure extends Error { constructor(status,message,code){super(message);this.status=status;this.code=code;} }
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
const env={APPLICATION_MODE:'repositories',ANALYSIS_REPOSITORY:EXECUTION_REPOSITORY,ANALYSIS_REPOSITORY_ID:String(EXECUTION_REPOSITORY_ID),MAX_LAUNCH_BYTES:2048};
const config={schema_version:'analysis-projects-v1',execution_repository:{id:EXECUTION_REPOSITORY_ID,full_name:EXECUTION_REPOSITORY},tooling_sha:'a'.repeat(40),projects:CONFIGURED_TARGETS.map(target=>({id:target.id,source_repository:{id:target.repository_id,full_name:target.repository,private:false},relationship:target.relationship,preferred_branch:target.branch,native_feedback_enabled:target.native_feedback,profile:{mode:'portable'},enabled_scanners:['semgrep'],deferred_channels:{},report_budget_bytes:900000000}))};
const configBlob={content:Buffer.from(JSON.stringify(config)).toString('base64')};
const host=(permissions={pull:true,push:true,admin:false})=>({id:EXECUTION_REPOSITORY_ID,full_name:EXECUTION_REPOSITORY,private:false,default_branch:'main',permissions});

function helpers({permissions,overrides={}}={}) {
  const calls=[];
  const serviceToken=async()=> 'central-app-read-token';
  const github=async(path,token,options={})=>{
    calls.push({path,token,options});
    if(Object.hasOwn(overrides,path))return overrides[path];
    if(path===`repos/${EXECUTION_REPOSITORY}`)return host(permissions);
    if(path===`repos/${EXECUTION_REPOSITORY}/contents/.github/code-analysis/projects.json?ref=main`)return configBlob;
    const source=CONFIGURED_TARGETS.find(target=>path===`repos/${target.repository}`);
    if(source)return {id:source.repository_id,full_name:source.repository,private:false,default_branch:source.branch,permissions:{pull:true}};
    throw new Error(`Unexpected GitHub request: ${path}`);
  };
  return {calls,Failure,json,github,serviceToken,pages:async()=>[]};
}

const session={token:'user-token'};
const get=(path)=>new Request(`https://worker.example${path}`);
const post=(path,value)=>new Request(`https://worker.example${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});

test('read-only collaborators can list the exact fixed target registry',async()=>{
  const h=helpers({permissions:{pull:true,push:false,admin:false}});
  const response=await repositoryApi(get('/api/projects'),env,session,h);
  const result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.execution_repository.full_name,EXECUTION_REPOSITORY);
  assert.equal(result.can_launch,false);
  assert.equal(result.can_configure,false);
  assert.deepEqual(result.projects.map(project=>project.id),CONFIGURED_TARGETS.map(project=>project.id));
  assert.deepEqual(result.projects.map(({id,relationship})=>[id,relationship]),CONFIGURED_TARGETS.map(({id,relationship})=>[id,relationship]));
  assert.ok(h.calls.some(call=>call.path.includes('/contents/.github/code-analysis/projects.json')&&call.token==='central-app-read-token'));
  assert.ok(!JSON.stringify(result).includes('user-token'));
});

test('trusted legacy scanner profiles remain listable while portable profiles are validated',async()=>{
  const legacyConfig={...config,projects:config.projects.map((project,index)=>index===0?{...project,profile:{python_root:'backend',python_test_command:['python','-m','pytest'],snyk_python_manifests:['backend/requirements.txt']}}:project)};
  const legacyHelpers=helpers({overrides:{[`repos/${EXECUTION_REPOSITORY}/contents/.github/code-analysis/projects.json?ref=main`]:{content:Buffer.from(JSON.stringify(legacyConfig)).toString('base64')}}});
  const response=await repositoryApi(get('/api/projects'),env,session,legacyHelpers);
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
  assert.ok(result.channels.some(channel=>channel.channel==='semgrep'&&channel.status==='configured'));
  assert.ok(result.channels.every(channel=>channel.status!=='completed'));
});

test('write access is required to launch and no user source repository can override the registry',async()=>{
  const h=helpers({permissions:{pull:true,push:false,admin:false}});
  await assert.rejects(()=>repositoryApi(post('/api/project-launch',{project_id:'1267340546',kind:'branch',ref:'Testing'}),env,session,h),error=>error.status===403&&error.code==='repository_write_required');
  assert.ok(h.calls.every(call=>!call.options.method));
  await assert.rejects(()=>repositoryApi(get('/api/projects?repository=attacker/private-repo'),env,session,helpers()),error=>error.status===400&&error.code==='repository_not_configurable');
});

test('configuration endpoints require an admin and remain managed by the trusted registry',async()=>{
  await assert.rejects(()=>repositoryApi(post('/api/projects/preview',{project_id:'1278177697',changes:{}}),env,session,helpers({permissions:{pull:true,push:true,admin:false}})),error=>error.status===403&&error.code==='repository_admin_required');
  await assert.rejects(()=>repositoryApi(post('/api/projects/preview',{project_id:'1278177697',changes:{}}),env,session,helpers({permissions:{pull:true,push:true,admin:true}})),error=>error.status===409&&error.code==='configuration_managed');
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
