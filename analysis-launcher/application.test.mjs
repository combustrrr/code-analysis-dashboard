import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationApi, detectedProfile, wrappers} from './application.mjs';
const env={ANALYSIS_REPOSITORY:'owner/service', TOOLING_SHA:'a'.repeat(40), SESSION_KEY:'unused'};
class Failure extends Error {constructor(status,message){super(message);this.status=status;}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const repo={id:1,full_name:'owner/repo',private:false,default_branch:'main',permissions:{admin:true,push:true}};
function helpers(overrides={}) {
 const calls=[];
 return {calls,Failure,json,seal:async x=>JSON.stringify(x),unseal:async x=>JSON.parse(x),github:async(path,token,options={})=>{
  calls.push({path,options});
  if(overrides[path]) return overrides[path];
  if(path==='repos/owner/repo')return repo;
  if(path.startsWith('user/installations?'))return {installations:[{id:3}]};
  if(path.startsWith('user/installations/3/repositories'))return {repositories:[repo]};
  if(path==='user')return {id:4};
  if(path.includes('/git/ref/heads/'))return {object:{sha:'b'.repeat(40)}};
  if(path.includes('/git/commits/'))return {tree:{sha:'c'.repeat(40)}};
  if(path.includes('/git/trees/'))return {tree:[],truncated:false};
  throw new Error(path);
 }};
}
const request=(path,value)=>new Request('https://worker.example'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
test('preview is read-only and installation is bound to repository owner and base revision',async()=>{
 const h=helpers();
 const result=await applicationApi(request('/api/connections/preview',{execution_repository:'owner/repo'}),env,{token:'test'},h);
 const preview=await result.json();
 assert.equal(preview.project.relationship,'connected');
 assert.equal(preview.project.id,'1');
 assert.ok(Object.keys(preview.files).length===3);
 assert.ok(h.calls.every(x=>!x.options.method));
 const tampered=JSON.parse(preview.confirmation);tampered.actor=99;
 await assert.rejects(()=>applicationApi(request('/api/connections/install',{confirmation:JSON.stringify(tampered),confirm:true}),env,{token:'test'},h), e=>e.status===403);
});
test('protected upstream is rejected before any mutation',async()=>{
 const h=helpers({'repos/ARYDESTROYER/Kavach-AgenticSOC':{...repo,full_name:'ARYDESTROYER/Kavach-AgenticSOC'}});
 await assert.rejects(()=>applicationApi(request('/api/connections/preview',{execution_repository:'ARYDESTROYER/Kavach-AgenticSOC'}),env,{token:'test'},h),e=>e.status===403);
 assert.equal(h.calls.length,1);
});
test('private repository and truncated trees fail closed',async()=>{
 const h=helpers({'repos/owner/repo':{...repo,private:true}});
 await assert.rejects(()=>applicationApi(request('/api/connections/preview',{execution_repository:'owner/repo'}),env,{token:'test'},h),e=>e.status===403);
 const t=helpers({['repos/owner/repo/git/trees/'+ 'c'.repeat(40)+'?recursive=1']:{tree:[],truncated:true}});
 await assert.rejects(()=>applicationApi(request('/api/connections/preview',{execution_repository:'owner/repo'}),env,{token:'test'},t),e=>e.status===422);
});
test('wrappers are pinned and detected profiles never invent executable commands',()=>{
 assert.throws(()=>wrappers('owner/service','main'));
 const files=wrappers('owner/service','a'.repeat(40));
 assert.ok(Object.values(files).every(x=>x.includes('@'+'a'.repeat(40))));
 assert.deepEqual(detectedProfile(['Cargo.toml','Dockerfile']).profile,{mode:'portable'});
});
const configuration={schema_version:'analysis-projects-v1',execution_repository:{id:1},tooling_sha:'a'.repeat(40),projects:[{id:'1',source_repository:{id:1,full_name:'owner/repo'},profile:{mode:'portable'},preferred_branch:'main',enabled_scanners:['semgrep','snyk','future-scanner'],deferred_channels:Object.fromEntries(['atheris','bandit','checkov','codeql','coderabbit-ai-advisory','coverage','eslint','github-actions-security','github-secret-protection-posture','gitleaks','hadolint','openssf-scorecard','osv','pyright','radon','ruff','sbom-license-provenance','schemathesis','shipping-image-cves','sonarqube-cloud','trivy','typescript','vulture','xenon'].map(s=>[s,'fixture'])),report_budget_bytes:900000000}]};
const configBlob={content:Buffer.from(JSON.stringify(configuration)).toString('base64')};
function configuredHelpers(extra={}) {return helpers({['repos/owner/repo/contents/.github/code-analysis/projects.json?ref=main']:configBlob,['repos/owner/repo/contents/.github/code-analysis/projects.json?ref='+'b'.repeat(40)]:configBlob,'repos/owner/repo/branches/main':{name:'main'},...extra});}
test('configuration preview is read-only, rejects identity edits and validates deferrals',async()=>{
 const h=configuredHelpers();
 const input={repository:'owner/repo',project_id:'1',changes:{report_budget_bytes:500000000}};
 const response=await applicationApi(request('/api/projects/preview',input),env,{token:'test'},h);
 const result=await response.json();
 assert.equal(result.project.report_budget_bytes,500000000);
 assert.equal(Object.keys(result.files).length,1);
 assert.ok(h.calls.every(x=>!x.options.method));
 for(const changes of [{source_repository:{id:99}},{enabled_scanners:['semgrep'],deferred_channels:{semgrep:'reason'}},{report_budget_bytes:0}]) {
  await assert.rejects(()=>applicationApi(request('/api/projects/preview',{...input,changes}),env,{token:'test'},configuredHelpers()),e=>e.status===400);
 }
});
test('configuration edits require admin access and reject a stale default branch',async()=>{
 const h=configuredHelpers({'repos/owner/repo':{...repo,permissions:{push:true,admin:false}}});
 await assert.rejects(()=>applicationApi(request('/api/projects/preview',{repository:'owner/repo',project_id:'1',changes:{}},),env,{token:'test'},h),e=>e.status===403);
 const preview={actor:4,repository:'owner/repo',repository_id:1,branch:'old',base:'b'.repeat(40)};
 await assert.rejects(()=>applicationApi(request('/api/connections/install',{confirmation:JSON.stringify(preview),confirm:true}),env,{token:'test'},configuredHelpers()),e=>e.status===409);
});
test('readiness never calls configured evidence complete and flags absent adapters',async()=>{
 const result=await applicationApi(new Request('https://worker.example/api/project-readiness?repository=owner/repo&project_id=1'),env,{token:'test'},configuredHelpers());
 const rows=(await result.json()).channels;
 assert.equal(rows.find(x=>x.channel==='semgrep').status,'configured');
 assert.equal(rows.find(x=>x.channel==='snyk').status,'setup_required');
 assert.equal(rows.find(x=>x.channel==='future-scanner').status,'setup_required');
 assert.ok(rows.every(x=>x.status!=='completed'));
});


test('revoked installation access blocks configuration and launch before writes',async()=>{
 for(const [path,payload] of [['/api/projects/preview',{repository:'owner/repo',project_id:'1',changes:{report_budget_bytes:100}}],['/api/project-launch',{repository:'owner/repo',project_id:'1',kind:'branch',ref:'main'}]]){
  const h=configuredHelpers({'user/installations?per_page=100&page=1':{installations:[]}});
  await assert.rejects(()=>applicationApi(request(path,payload),env,{token:'test'},h),e=>e.status===403);
  assert.ok(h.calls.every(c=>!c.options.method));
 }
});
test('portable configuration supports two layouts and rejects executable path escape',async()=>{
 const {validatePortableProfile}=await import('./application.mjs');
 for(const profile of [{mode:'portable',python_root:'packages/core'},{mode:'portable',javascript_root:'client',commands:{eslint:{cwd:'client',argv:['npx','--no-install','eslint','.'],install:[['npm','ci']]}}}])assert.doesNotThrow(()=>validatePortableProfile(profile));
 assert.throws(()=>validatePortableProfile({mode:'portable',commands:{coverage:{argv:['pytest'],cwd:'../outside'}}}));
 const detection=detectedProfile(['packages/core/main.py','client/src/index.ts']);
 assert.equal(detection.profile.python_root,'.');assert.equal(detection.profile.javascript_root,'.');assert.equal(detection.profile.commands,undefined);
});


test('activity follows the exact scanner attempt through publication',async()=>{
 const original=globalThis.fetch;let published=false;
 const id='11111111-1111-1111-1111-111111111111';
 const row={id:'target',client_request_id:id,head_sha:'d'.repeat(40),execution_sha:'b'.repeat(40),scan_run_id:99,run_attempt:2};
 globalThis.fetch=async url=>{
  if(url.endsWith('/repos/owner/repo'))return Response.json({full_name:'owner/repo',private:false});
  if(url.includes('/releases/tags/'))return Response.json({body:JSON.stringify({schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/repo',targets:[row]})});
  throw new Error('Unexpected fetch');
 };
 try{
  const h=configuredHelpers({'repos/owner/repo/actions/runs/99/attempts/2':{head_sha:'b'.repeat(40),status:'completed',conclusion:'success'}});
  const result=await (await applicationApi(new Request(`https://worker.example/api/project-activity?repository=owner/repo&project_id=1&request_id=${id}`),env,{token:'test'},h)).json();
  assert.equal(result.phase,'publishing');assert.equal(result.source_sha,'d'.repeat(40));assert.equal(result.producer.attempt,2);
  assert.ok(result.producer.url.endsWith('/99/attempts/2'));
 }finally{globalThis.fetch=original;}
});
