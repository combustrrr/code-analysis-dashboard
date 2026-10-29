import test from 'node:test';
import assert from 'node:assert/strict';
import {isCollaborator,verifyCollaborator} from './viewer-access.mjs';

const env={ANALYSIS_REPOSITORY:'combustrrr/code-analysis-dashboard'};
const tokenProvider=async()=> 'read-only-installation-token';

test('GitHub collaborator endpoint accepts direct, team-inherited and owner access',async t=>{
  const calls=t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:204}));
  for(const login of ['direct-user','team-member','repository-owner'])assert.equal(await isCollaborator(env,login,tokenProvider),true);
  assert.equal(calls.mock.calls.length,3);
  assert.ok(calls.mock.calls.every(call=>call.arguments[1].headers.Authorization==='Bearer read-only-installation-token'));
});

test('public-only visibility is not collaborator access',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:404}));
  assert.equal(await isCollaborator(env,'public-reader',tokenProvider),false);
});

test('ambiguous GitHub failures fail closed',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:500}));
  await assert.rejects(isCollaborator(env,'developer',tokenProvider),/could not verify/);
  assert.equal(await isCollaborator(env,'invalid login!',tokenProvider),false);
});

test('rate limits and permission ambiguity remain recoverable provider failures',async t=>{
 for(const status of [403,429]){
  t.mock.method(globalThis,'fetch',async()=>new Response(null,{status,headers:{'Retry-After':'60'}}));
  await assert.rejects(verifyCollaborator(env,'developer',tokenProvider),error=>error.code==='github_rate_limited'&&error.status===429&&error.retryAfter===60);
  t.mock.restoreAll();
 }
});

test('conditional collaborator verification accepts a 304 without assuming ETag support',async t=>{
 const calls=t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:304}));
 const result=await verifyCollaborator(env,'developer',tokenProvider,'"collab"');
 assert.deepEqual(result,{authorized:true,notModified:true,etag:'"collab"'});
 assert.equal(calls.mock.calls[0].arguments[1].headers['If-None-Match'],'"collab"');
});
