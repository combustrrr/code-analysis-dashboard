import test from 'node:test';
import assert from 'node:assert/strict';
import {isCollaborator} from './viewer-access.mjs';

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
