import test from 'node:test';
import assert from 'node:assert/strict';
import {reportToken} from './github-app.mjs';
import {publicReports,reportStorageKey,canonicalReportTarget} from './reports.mjs';
const reportProjectConfig={schema_version:'analysis-projects-v1',execution_repository:{id:88},tooling_sha:'a'.repeat(40),projects:[{id:'1',source_repository:{id:1267340546,full_name:'owner/source'},profile:{mode:'portable'},preferred_branch:'main',enabled_scanners:['semgrep'],deferred_channels:{},report_budget_bytes:900000000}]};
const reportConfigFile=()=>Response.json({encoding:'base64',content:Buffer.from(JSON.stringify(reportProjectConfig)).toString('base64')});test('public report tokens are limited to one repository and read-only contents',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options={})=>{calls.push({url,options});
  if(url.endsWith('/installation'))return Response.json({id:77});
  if(url.endsWith('/repos/owner/public'))return Response.json({id:88,private:false});
  if(url.endsWith('/access_tokens'))return Response.json({token:'test-read-only'});
  throw new Error('Unexpected request');
 };
 try {
  const env={GITHUB_APP_ID:'123',GITHUB_APP_PRIVATE_KEY:pem};
  assert.equal(await reportToken(env,'owner/public'),'test-read-only');
  const request=calls.find(c=>c.url.endsWith('/access_tokens'));
  assert.deepEqual(JSON.parse(request.options.body),{repositories:['public'],permissions:{contents:'read'}});
  await reportToken(env,'owner/public');assert.equal(calls.length,2);
 } finally {globalThis.fetch=original;}
});

async function appKey() {
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  return Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
}
test('canonical report target is stable and rejects an ambiguous multi-target manifest', () => {
  const canonical = {id:'current:1', original_target_id:'branch-main'};
  assert.equal(canonicalReportTarget({current_target_id:'current:1',targets:[canonical,{id:'old'}]}), canonical);
  assert.equal(canonicalReportTarget({current_target_id:'missing',targets:[{id:'one'},{id:'two'}]}), null);
  assert.equal(canonicalReportTarget({targets:[{id:'legacy'}]}).id, 'legacy');
});
test('report access retries once with a fresh installation token after 401',async()=>{
  const pem=await appKey();
  const original=globalThis.fetch;let mints=0;let repoCalls=0;
  globalThis.fetch=async(url)=>{
    if(String(url).endsWith('/installation'))return Response.json({id:77});
    if(String(url).endsWith('/access_tokens')){mints++;return Response.json({token:`fresh-${mints}`});}
    if(String(url).endsWith('/repos/owner/revoked')){repoCalls++;if(repoCalls===1)return new Response('nope',{status:401});return Response.json({id:88,full_name:'owner/revoked',private:false,default_branch:'main'});}
     if(String(url).includes('/contents/.github/code-analysis/projects.json'))return reportConfigFile();
    throw new Error('Unexpected request');
  };
  const manifest={schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/revoked',checked_at:new Date().toISOString(),targets:[]};
  const reports={get:async key=>key==='analysis-current-1.json'?{json:async()=>manifest}:null};
  const tokenEnv={GITHUB_APP_ID:'app-revoked',GITHUB_APP_PRIVATE_KEY:pem,ANALYSIS_REPORTS:reports};
  try {
    const response=await publicReports(new Request('https://worker.example/api/public/manifest?repository=owner/revoked&project_id=1'),tokenEnv);
    assert.equal(response.status,200);
    assert.equal(mints,2);
    assert.equal(repoCalls,2);
  } finally {globalThis.fetch=original;}
});
test('persistent token rejection fails closed with an actionable classified error',async()=>{
  const pem=await appKey();
  const original=globalThis.fetch;let mints=0;let repoCalls=0;
  globalThis.fetch=async(url)=>{
    if(String(url).endsWith('/installation'))return Response.json({id:77});
    if(String(url).endsWith('/access_tokens')){mints++;return Response.json({token:`fresh-${mints}`});}
    if(String(url).endsWith('/repos/owner/persistent')){repoCalls++;return new Response('internal vendor detail',{status:401});}
     if(String(url).includes('/contents/.github/code-analysis/projects.json'))return reportConfigFile();
    throw new Error('Unexpected request');
  };
  const manifest={schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/persistent',checked_at:new Date().toISOString(),targets:[]};
  const reports={get:async key=>key==='analysis-current-1.json'?{json:async()=>manifest}:null};
  const tokenEnv={GITHUB_APP_ID:'app-persistent',GITHUB_APP_PRIVATE_KEY:pem,ANALYSIS_REPORTS:reports};
  try {
    const response=await publicReports(new Request('https://worker.example/api/public/manifest?repository=owner/persistent&project_id=1'),tokenEnv);
    assert.equal(response.status,502);
    const data=await response.json();
    assert.equal(data.code,'report_access_rejected');
    assert.ok(!data.error.includes('internal vendor detail'));
    assert.equal(mints,2);
    assert.equal(repoCalls,2);
  } finally {globalThis.fetch=original;}
});
test('expired or undated manifests are never served as current',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url).endsWith('/repos/owner/freshness'))return Response.json({id:88,full_name:'owner/freshness',private:false,default_branch:'main'});
     if(String(url).includes('/contents/.github/code-analysis/projects.json'))return reportConfigFile();
    throw new Error('Unexpected request');
  };
  let manifest;
  const reports={get:async key=>key==='analysis-current-1.json'?{json:async()=>manifest}:null};
  const tokenEnv={ANALYSIS_REPORTS:reports};
  const url='https://worker.example/api/public/manifest?repository=owner/freshness&project_id=1';
  try {
    // Fresh manifest is served.
    manifest={schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/freshness',checked_at:new Date().toISOString(),targets:[]};
    assert.equal((await publicReports(new Request(url),tokenEnv)).status,200);
    // History-only publication timestamps also prove freshness.
    manifest={schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/freshness',report_storage_history:[{at:new Date().toISOString(),compressed_bytes:10}],targets:[]};
    assert.equal((await publicReports(new Request(url),tokenEnv)).status,200);
    // Manifests older than the age budget expire.
    manifest={schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/freshness',checked_at:new Date(Date.now()-25*60*60*1000).toISOString(),targets:[]};
    const expired=await publicReports(new Request(url),tokenEnv);
    assert.equal(expired.status,410);
    const expiredBody=await expired.json();
    assert.equal(expiredBody.expired,true);
    assert.match(expiredBody.error,/expired/);
    // Manifests without any verifiable publication timestamp fail closed.
    manifest={schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/freshness',targets:[]};
    const undated=await publicReports(new Request(url),tokenEnv);
    assert.equal(undated.status,410);
    assert.match((await undated.json()).error,/freshness/);
    // The configured age budget is honored.
    manifest={schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/freshness',checked_at:new Date(Date.now()-2*60*60*1000).toISOString(),targets:[]};
    assert.equal((await publicReports(new Request(url),{...tokenEnv,MAX_REPORT_AGE_MS:'3600000'})).status,410);
    manifest={schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/freshness',checked_at:new Date(Date.now()-60*60*1000).toISOString(),targets:[]};
    assert.equal((await publicReports(new Request(url),{...tokenEnv,MAX_REPORT_AGE_MS:'7200000'})).status,200);
    // Expired manifests also gate assets and threat reports.
    const assetUrl=new URL(url);assetUrl.pathname='/api/public/asset';assetUrl.searchParams.set('asset','analysis-'+'a'.repeat(64)+'.json.gz');
    manifest={schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/freshness',checked_at:new Date(Date.now()-25*60*60*1000).toISOString(),targets:[]};
    assert.equal((await publicReports(new Request(assetUrl),tokenEnv)).status,410);
  } finally {globalThis.fetch=original;}
});
test('report project IDs must exist in the current execution configuration',async()=>{
  const original=globalThis.fetch;
  let storageReads=0;
  globalThis.fetch=async url=>{
    if(String(url).endsWith('/repos/owner/configured'))return Response.json({id:88,full_name:'owner/configured',private:false,default_branch:'main'});
    if(String(url).includes('/contents/.github/code-analysis/projects.json'))return reportConfigFile();
    throw new Error('Unexpected request');
  };
  const reports={get:async()=>{storageReads++;throw new Error('storage must not be read');}};
  try {
    const response=await publicReports(new Request('https://worker.example/api/public/manifest?repository=owner/configured&project_id=2'),{ANALYSIS_REPORTS:reports});
    assert.equal(response.status,404);
    assert.equal(storageReads,0);
  } finally {globalThis.fetch=original;}
});

test('threat reports fail closed when only legacy assets are available', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/repos/owner/legacy')) return Response.json({id:88,full_name:'owner/legacy',private:false,default_branch:'main'});
    if (String(url).includes('/contents/.github/code-analysis/projects.json')) return reportConfigFile();
    throw new Error('Unexpected request');
  };
  const manifest = {schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/legacy',checked_at:new Date().toISOString(),targets:[{id:'target-1',assets:{['analysis-'+'a'.repeat(64)+'.json.gz']:{bytes:10,sha256:'b'.repeat(64)}}}]};
  let storageReads = 0;
  const reports = {get: async key => { storageReads++; return key === 'analysis-current-1.json' ? {json: async () => manifest} : {arrayBuffer: async () => new Uint8Array(10).buffer}; }};
  try {
    const url = 'https://worker.example/api/public/threat-report?repository=owner/legacy&project_id=1&target_id=target-1';
    const response = await publicReports(new Request(url), {ANALYSIS_REPORTS:reports});
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match((await response.json()).error, /immutable stored report asset/);
    assert.equal(storageReads, 2);
  } finally { globalThis.fetch = original; }
});
test('public report reads retry Retry-After-aware transient failures and secondary limits', async () => {
  const original = globalThis.fetch;
  let repoCalls = 0;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/repos/owner/retry')) {
      repoCalls++;
      if (repoCalls < 3) return new Response(JSON.stringify({message:'secondary rate limit'}), {status: repoCalls === 1 ? 429 : 403, headers:{'Retry-After':'0'}});
      return Response.json({id:88,full_name:'owner/retry',private:false,default_branch:'main'});
    }
    if (String(url).includes('/contents/.github/code-analysis/projects.json')) return reportConfigFile();
    throw new Error('Unexpected request');
  };
  const manifest={schema_version:'analysis-current-v1',project_id:'1',analysis_repository:'owner/retry',checked_at:new Date().toISOString(),targets:[]};
  const reports={get:async key=>key==='analysis-current-1.json'?{json:async()=>manifest}:null};
  try {
    const response=await publicReports(new Request('https://worker.example/api/public/manifest?repository=owner/retry&project_id=1'),{ANALYSIS_REPORTS:reports});
    assert.equal(response.status,200);
    assert.equal(repoCalls,3);
  } finally { globalThis.fetch=original; }
});
test('public report transient reads stop at the retry bound', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/repos/owner/exhausted')) { calls++; return new Response('busy',{status:504,headers:{'Retry-After':'0'}}); }
    throw new Error('Unexpected request');
  };
  try {
    const response=await publicReports(new Request('https://worker.example/api/public/manifest?repository=owner/exhausted&project_id=1'),{});
    assert.equal(response.status,502);
    assert.equal((await response.json()).code,'report_unavailable');
    assert.equal(calls,3);
  } finally { globalThis.fetch=original; }
});
test('report storage keys are repository-qualified without changing public routes', () => {
  assert.equal(reportStorageKey('Owner/Repo', '1'), 'repositories/owner/repo/analysis-current-1.json');
  assert.equal(reportStorageKey('Owner/Repo', '1', 'analysis-' + 'a'.repeat(64) + '.json.gz'), 'repositories/owner/repo/analysis-current-1/analysis-' + 'a'.repeat(64) + '.json.gz');
});
