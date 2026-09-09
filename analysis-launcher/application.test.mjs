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
