import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { seal, unseal } from './worker.mjs';
import {AuthExchangeStore} from './auth-exchange.mjs';
import {CONFIGURED_TARGETS,EXECUTION_REPOSITORY,EXECUTION_REPOSITORY_ID} from './target-registry.mjs';

const env = { SOURCE_REPOSITORY: 'source/app', ANALYSIS_REPOSITORY: 'host/scanners', DASHBOARD_ORIGIN: 'https://owner.github.io', DASHBOARD_BASE_PATH: '/analysis-dashboard/', GITHUB_CLIENT_ID: 'app-id', GITHUB_CLIENT_SECRET: 'test-secret', GITHUB_OAUTH_SCOPES: 'public_repo', SESSION_KEY: Buffer.alloc(32, 7).toString('base64url') };
const reply = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function exchangeBinding() {
  const objects = new Map();
  return {
    idFromName: name => name,
    get(id) {
      if (!objects.has(id)) {
        const values = new Map(); let tail = Promise.resolve();
        const storage = {
          get: key => values.get(key), put: (key, value) => values.set(key, value), delete: key => values.delete(key), setAlarm: async () => {},
          transaction: async fn => { const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous; try { return await fn(storage); } finally { release(); } },
        };
        const store = new AuthExchangeStore({ storage });
        objects.set(id, { fetch: request => store.fetch(request) });
      }
      return objects.get(id);
    },
  };
}
async function oauthChallenge(verifier) {
  return Buffer.from(await crypto.subtle.digest('SHA-256', Buffer.from(verifier))).toString('base64url');
}
async function request(path, body, overrides = {}) {
  const session = await seal({ type: 'session', token: 'github-test-token', exp: Date.now() + 60000 }, env.SESSION_KEY);
  return new Request(`https://launcher.example${path}`, { method: body ? 'POST' : 'GET', headers: { Origin: env.DASHBOARD_ORIGIN, Authorization: `Bearer ${session}`, 'Content-Type': 'application/json', ...overrides }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test('session confidentiality, integrity, expiry and purpose separation', async () => {
  const token = await seal({ type: 'session', token: 'secret', exp: Date.now() + 60000 }, env.SESSION_KEY);
  assert.ok(!token.includes('secret'));
  assert.equal((await unseal(token, env.SESSION_KEY, 'session')).token, 'secret');
  await assert.rejects(unseal(token + 'x', env.SESSION_KEY, 'session'));
  await assert.rejects(unseal(token, env.SESSION_KEY, 'oauth'));
  await assert.rejects(unseal(await seal({ type: 'session', exp: 1 }, env.SESSION_KEY), env.SESSION_KEY, 'session'));
});
test('unauthenticated and cross-origin launches never reach GitHub', async t => {
  const calls = t.mock.method(globalThis, 'fetch', () => { throw new Error('must not call GitHub'); });
  assert.equal((await worker.fetch(new Request('https://launcher.example/api/launch', { method: 'POST', headers: { Origin: env.DASHBOARD_ORIGIN } }), env)).status, 401);
  const denied = await worker.fetch(await request('/api/launch', { repository: 'source/app', kind: 'branch', ref: 'main' }, { Origin: 'https://attacker.example' }), env);
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(calls.mock.calls.length, 0);
});
test('read-only users cannot trigger analysis', async t => {
  t.mock.method(globalThis, 'fetch', async () => reply({ permissions: { pull: true, push: false } }));
  assert.equal((await worker.fetch(await request('/api/launch', { repository: 'source/app', kind: 'branch', ref: 'main' }), env)).status, 403);
});
test('dispatch verifies source and forces configured host and actual default branch', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push([url, init]);
    if (url.endsWith('repos/host/scanners')) return reply({ permissions: { push: true }, default_branch: 'trusted' });
    if (url.includes('/branches/')) return reply({ commit: { sha: 'a'.repeat(40) } });
    return reply({ workflow_run_id: 42 });
  });
  const response = await worker.fetch(await request('/api/launch', { repository: 'source/app', kind: 'branch', ref: 'feature/next', host: 'evil/repo', tooling: 'untrusted' }), env);
  assert.equal(response.status, 202);
  assert.equal((await response.json()).url, 'https://github.com/host/scanners/actions/runs/42');
  assert.ok(calls[1][0].endsWith('/branches/feature%2Fnext'));
  assert.ok(calls[2][0].includes('/repos/host/scanners/actions/workflows/10-analysis-discovery.yml/dispatches'));
  const body = JSON.parse(calls[2][1].body);
  assert.equal(body.ref, 'trusted');
  assert.deepEqual(JSON.parse(body.inputs.refresh_target), { repository: 'source/app', kind: 'branch', ref: 'feature/next' });
});
test('wrong repository, malformed commit and missing source cannot dispatch', async t => {
  const calls = t.mock.method(globalThis, 'fetch', async url => url.endsWith('repos/host/scanners') ? reply({ permissions: { push: true } }) : new Response('', { status: 404 }));
  for (const body of [{ repository: 'other/app', kind: 'branch', ref: 'main' }, { repository: 'source/app', kind: 'commit', ref: 'abc' }]) {
    assert.equal((await worker.fetch(await request('/api/launch', body), env)).status, 400);
  }
  assert.equal((await worker.fetch(await request('/api/launch', { repository: 'source/app', kind: 'pr', ref: '12' }), env)).status, 403);
  assert.ok(calls.mock.calls.every(call => !call.arguments[0].includes('dispatches')));
});
test('target discovery paginates and attributes fork PR source and base', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('repos/host/scanners')) return reply({ permissions: { push: true } });
    if (url.includes('/pulls?')) return reply([{ number: 4, head: { repo: { full_name: 'fork/app' }, ref: 'feature', sha: 'b'.repeat(40) }, base: { ref: 'main' } }]);
    if (url.endsWith('page=1')) return reply(Array.from({ length: 100 }, (_, i) => ({ name: `branch-${i}`, commit: { sha: 'a'.repeat(40) } })));
    return reply([{ name: 'last', commit: { sha: 'c'.repeat(40) } }]);
  });
  const response = await worker.fetch(await request('/api/targets'), env);
  const data = await response.json();
  assert.equal(data.targets.length, 102);
  assert.equal(data.targets.at(-1).source_repository, 'fork/app');
  assert.equal(data.targets.at(-1).base_branch, 'main');
});
test('same-tab OAuth uses state, PKCE and a verifier-bound one-time exchange', async t => {
  const verifier = 'v'.repeat(43); const challenge = await oauthChallenge(verifier); const exchanges = exchangeBinding();
  const authEnv = { ...env, REPORT_ACCESS: 'public', AUTH_EXCHANGES: exchanges };
  const login = await worker.fetch(new Request(`https://launcher.example/auth/login?challenge=${challenge}`), authEnv);
  assert.equal(login.status, 302);
  const location = new URL(login.headers.get('Location'));
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(location.searchParams.get('scope'), 'public_repo');
  assert.ok(login.headers.get('Set-Cookie').includes('HttpOnly; SameSite=Lax'));
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const pending = await unseal(cookie.split('=')[1], env.SESSION_KEY, 'oauth');
  assert.equal(location.searchParams.get('code_challenge'), await oauthChallenge(pending.verifier));
  assert.notEqual(location.searchParams.get('code_challenge'), challenge);
  const wrong = await worker.fetch(new Request('https://launcher.example/auth/callback?code=x&state=wrong', { headers: { Cookie: cookie } }), env);
  assert.equal(wrong.status, 302); assert.equal(new URL(wrong.headers.get('Location')).pathname, env.DASHBOARD_BASE_PATH); assert.equal(new URL(wrong.headers.get('Location')).hash, '#analysis_auth_error=retry');
  t.mock.method(globalThis, 'fetch', async url => url.includes('access_token') ? reply({ access_token: 'never-show-github-token' }) : url.endsWith('/user') ? reply({ login: 'developer' }) : reply({ permissions: { push: true } }));
  const response = await worker.fetch(new Request(`https://launcher.example/auth/callback?code=x&state=${location.searchParams.get('state')}`, { headers: { Cookie: cookie } }), authEnv);
  const returnUrl = new URL(response.headers.get('Location'));
  assert.equal(response.status, 302); assert.equal(returnUrl.origin, env.DASHBOARD_ORIGIN); assert.equal(returnUrl.pathname, env.DASHBOARD_BASE_PATH); assert.match(returnUrl.hash, /^#analysis_auth=[A-Za-z0-9_-]{43}$/);
  assert.ok(!returnUrl.href.includes('never-show-github-token')); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const code = new URLSearchParams(returnUrl.hash.slice(1)).get('analysis_auth');
  const redeem = () => worker.fetch(new Request('https://launcher.example/api/auth/redeem', { method: 'POST', headers: { Origin: env.DASHBOARD_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier }) }), authEnv);
  const wrongVerifier = await worker.fetch(new Request('https://launcher.example/api/auth/redeem', { method: 'POST', headers: { Origin: env.DASHBOARD_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier: 'x'.repeat(43) }) }), authEnv);
  assert.equal(wrongVerifier.status, 401);
  const redeemed = await redeem(); const session = await redeemed.json();
  assert.equal(redeemed.status, 200); assert.equal(redeemed.headers.get('Cache-Control'), 'no-store');
  assert.equal(session.login, 'developer'); assert.ok(!session.token.includes('never-show-github-token'));
  const replay = await redeem(); assert.equal(replay.status, 401); assert.equal((await replay.json()).code, 'exchange_invalid');
});

test('OAuth cancellation and unauthorized collaborators return safe dashboard errors', async t => {
  const mode={...env,APPLICATION_MODE:'repositories',DASHBOARD_ACCESS:'allowlist',DASHBOARD_ALLOWED_USERS:'maintainer',REPORT_ACCESS:'public'};
  t.mock.method(globalThis,'fetch',async url=>String(url).includes('access_token')?reply({access_token:'github-token'}):reply({login:'developer'}));
  const makeLogin=async()=>{
    const login=await worker.fetch(new Request(`https://launcher.example/auth/login?challenge=${'c'.repeat(43)}`),mode);
    return {url:new URL(login.headers.get('Location')),cookie:login.headers.get('Set-Cookie').split(';')[0]};
  };
  const denied=await makeLogin();
  const denial=await worker.fetch(new Request(`https://launcher.example/auth/callback?code=oauth&state=${denied.url.searchParams.get('state')}`,{headers:{Cookie:denied.cookie}}),mode);
  assert.equal(new URL(denial.headers.get('Location')).pathname,mode.DASHBOARD_BASE_PATH);
  assert.equal(new URL(denial.headers.get('Location')).hash,'#analysis_auth_error=not_authorized');
  const cancelled=await makeLogin();
  const cancel=await worker.fetch(new Request(`https://launcher.example/auth/callback?error=access_denied&state=${cancelled.url.searchParams.get('state')}`,{headers:{Cookie:cancelled.cookie}}),mode);
  assert.equal(new URL(cancel.headers.get('Location')).pathname,mode.DASHBOARD_BASE_PATH);
  assert.equal(new URL(cancel.headers.get('Location')).hash,'#analysis_auth_error=cancelled');
});

test('collaborator-mode OAuth issues an exchange only after current membership verification', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const key = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${key.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
  let membershipStatus = 204;
  const calls = t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = String(input);
    if (url === 'https://github.com/login/oauth/access_token') return reply({ access_token: 'github-user-token' });
    if (url === 'https://api.github.com/user') return reply({ login: 'developer' });
    if (url === `https://api.github.com/repos/${EXECUTION_REPOSITORY}/installation`) return reply({ id: 771 });
    if (url === 'https://api.github.com/app/installations/771/access_tokens') return reply({ token: 'central-app-token' });
    if (url === `https://api.github.com/repos/${EXECUTION_REPOSITORY}/collaborators/developer`) {
      assert.equal(init.headers.Authorization, 'Bearer central-app-token');
      return new Response(null, { status: membershipStatus });
    }
    throw new Error(`Unexpected OAuth request: ${url}`);
  });
  const mode = {
    ...env,
    APPLICATION_MODE: 'repositories',
    ANALYSIS_REPOSITORY: EXECUTION_REPOSITORY,
    DASHBOARD_ACCESS: 'collaborators',
    REPORT_ACCESS: 'collaborators',
    GITHUB_APP_ID: 'collaborator-oauth-test',
    GITHUB_APP_PRIVATE_KEY: privateKey,
  };
  let issued = 0;
  const exchanges = exchangeBinding();
  mode.AUTH_EXCHANGES = {
    idFromName: name => exchanges.idFromName(name),
    get(name) {
      const stub = exchanges.get(name);
      return { fetch(request) { if (new URL(request.url).pathname === '/issue') issued++; return stub.fetch(request); } };
    },
  };
  const callback = async () => {
    const login = await worker.fetch(new Request(`https://launcher.example/auth/login?challenge=${'c'.repeat(43)}`), mode);
    const state = new URL(login.headers.get('Location')).searchParams.get('state');
    const cookie = login.headers.get('Set-Cookie').split(';')[0];
    return worker.fetch(new Request(`https://launcher.example/auth/callback?code=oauth&state=${state}`, { headers: { Cookie: cookie } }), mode);
  };

  const accepted = await callback();
  assert.match(new URL(accepted.headers.get('Location')).hash, /^#analysis_auth=/);
  assert.equal(issued, 1);
  membershipStatus = 404;
  const denied = await callback();
  assert.equal(new URL(denied.headers.get('Location')).hash, '#analysis_auth_error=not_authorized');
  assert.equal(issued, 1);
  membershipStatus = 403;
  const unavailable = await callback();
  assert.equal(new URL(unavailable.headers.get('Location')).hash, '#analysis_auth_error=retry');
  assert.equal(issued, 1);
  assert.ok(calls.mock.calls.some(call => String(call.arguments[0]).endsWith('/collaborators/developer')));
});

test('authorized OAuth fails closed when one-time exchange storage is unavailable', async t => {
  const mode={...env,APPLICATION_MODE:'repositories',DASHBOARD_ACCESS:'disabled',REPORT_ACCESS:'public'};
  t.mock.method(globalThis,'fetch',async url=>String(url).includes('access_token')?reply({access_token:'github-token'}):reply({login:'developer'}));
  const login=await worker.fetch(new Request(`https://launcher.example/auth/login?challenge=${'c'.repeat(43)}`),mode);
  const cookie=login.headers.get('Set-Cookie').split(';')[0];
  const state=new URL(login.headers.get('Location')).searchParams.get('state');
  const callback=await worker.fetch(new Request(`https://launcher.example/auth/callback?code=oauth&state=${state}`,{headers:{Cookie:cookie}}),mode);
  assert.equal(new URL(callback.headers.get('Location')).pathname,mode.DASHBOARD_BASE_PATH);
  assert.equal(new URL(callback.headers.get('Location')).hash,'#analysis_auth_error=retry');
  assert.equal(callback.headers.get('Cache-Control'),'no-store');
});

test('Durable Object exchange rejects wrong verifier, expiry and concurrent replay', async t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const values = new Map(); let tail = Promise.resolve();
  const storage = {
    get: key => values.get(key), put: (key, value) => values.set(key, value), delete: key => values.delete(key), setAlarm: async () => {},
    transaction: async fn => { const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous; try { return await fn(storage); } finally { release(); } },
  };
  const store = new AuthExchangeStore({ storage });
  const post = (path, body) => store.fetch(new Request(`https://exchange${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const record = { verifier_hash: 'h'.repeat(43), token: 't'.repeat(43), login: 'developer' };
  await post('/issue', record);
  assert.equal((await post('/consume', { verifier_hash: 'x'.repeat(43) })).status, 401);
  const outcomes = await Promise.all([post('/consume', { verifier_hash: record.verifier_hash }), post('/consume', { verifier_hash: record.verifier_hash })]);
  assert.deepEqual(outcomes.map(response => response.status).sort(), [200, 404]);
  await post('/issue', record);
  now += 120_001;
  assert.equal((await post('/consume', { verifier_hash: record.verifier_hash })).status, 410);
});
test('repository App authorization omits OAuth scopes', async () => {
  const mode = { ...env, APPLICATION_MODE: 'repositories', ANALYSIS_REPOSITORY: 'host/scanners', GITHUB_APP_SLUG: 'code-analysis-dashboard' };
  const login = await worker.fetch(new Request(`https://launcher.example/auth/login?challenge=${'a'.repeat(43)}`), mode);
  assert.equal(login.status, 302);
  assert.equal(new URL(login.headers.get('Location')).searchParams.has('scope'), false);
});
test('GitHub dispatch errors are failures, never successful scan confirmations', async t => {
  t.mock.method(globalThis, 'fetch', async url => url.includes('dispatches') ? new Response('vendor-secret-error', { status: 500 }) : reply({ permissions: { push: true }, default_branch: 'main' }));
  const response = await worker.fetch(await request('/api/launch', { repository: 'source/app', kind: 'commit', ref: 'a'.repeat(40) }), env);
  assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('vendor-secret-error'));
});

test('integration verifies the default-branch configuration against the Cloudflare instance', async t => {
  const config = { source_repository:'source/app', analysis_repository:'host/scanners', publishing_repository:'owner/dashboard', launch_endpoint:'https://launcher.example', enabled_scanners:['ruff'] };
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('repos/host/scanners')) return reply({permissions:{push:true},default_branch:'trusted'});
    if (url.includes('/contents/')) { assert.ok(url.endsWith('?ref=trusted')); return reply({encoding:'base64',content:Buffer.from(JSON.stringify(config)).toString('base64')}); }
    return reply({state:'active'});
  });
  const connected = await (await worker.fetch(await request('/api/integration'), env)).json();
  assert.equal(connected.ready,true); assert.equal(connected.workflow_branch,'trusted');
  config.source_repository = 'wrong/source';
  const mismatch = await (await worker.fetch(await request('/api/integration'), env)).json();
  assert.equal(mismatch.ready,false); assert.equal(mismatch.configuration_matches,false);
});

test('exact request status remains confined to the configured discovery workflow and excludes raw run data', async t => {
  let path = '.github/workflows/10-analysis-discovery.yml';
  t.mock.method(globalThis, 'fetch', async url => {
    if(url.endsWith('repos/host/scanners')) return reply({permissions:{push:true}});
    assert.equal(url,'https://api.github.com/repos/host/scanners/actions/runs/42');
    return reply({id:42,path,status:'completed',conclusion:'cancelled',run_attempt:2,updated_at:'2026-09-09',actor:{private:'excluded'}});
  });
  const status = await (await worker.fetch(await request('/api/runs/42'),env)).json();
  assert.equal(status.conclusion,'cancelled'); assert.equal(status.attempt,2); assert.equal(status.actor,undefined);
  path = '.github/workflows/unrelated.yml';
  assert.equal((await worker.fetch(await request('/api/runs/42'),env)).status,404);
});


test('allowlisted reports require authentication before any report fetch',async t=>{
 const calls=t.mock.method(globalThis,'fetch',()=>{throw new Error('No upstream access expected');});
 const restricted={...env,APPLICATION_MODE:'repositories',DASHBOARD_ACCESS:'allowlist',DASHBOARD_ALLOWED_USERS:'combustrrr'};
  for(const path of ['projects','manifest','asset','threat-report']){
  const r=await worker.fetch(new Request('https://launcher.example/api/public/'+path+'?repository=host/scanners&project_id=1',{headers:{Origin:env.DASHBOARD_ORIGIN}}),restricted);
  assert.equal(r.status,401);assert.equal(r.headers.get('Cache-Control'),'private, no-store');
 }
 assert.equal(calls.mock.calls.length,0);
});
test('viewer authorization is case insensitive and rechecked after removal',async t=>{
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,'https://api.github.com/user');return reply({login:'Combustrrr'});});
  const restricted={...env,APPLICATION_MODE:'repositories',DASHBOARD_ACCESS:'allowlist',DASHBOARD_ALLOWED_USERS:' combustrrr ',REPORT_ACCESS:'public'};
 assert.equal((await worker.fetch(await request('/api/session'),restricted)).status,200);
 assert.equal((await worker.fetch(await request('/api/session'),{...restricted,DASHBOARD_ALLOWED_USERS:'another-user'})).status,403);
  assert.equal((await worker.fetch(await request('/api/repositories'),{...restricted,DASHBOARD_ALLOWED_USERS:''})).status,403);
});
test('allowlisted viewer still needs repository write access to launch',async t=>{
 t.mock.method(globalThis,'fetch',async url=>reply(url.endsWith('/user')?{login:'combustrrr'}:{permissions:{pull:true,push:false}}));
 const restricted={...env,DASHBOARD_ACCESS:'allowlist',DASHBOARD_ALLOWED_USERS:'combustrrr'};
 assert.equal((await worker.fetch(await request('/api/launch',{repository:'source/app',kind:'branch',ref:'main'}),restricted)).status,403);
});


test('collaborator mode protects anonymous reports and advertises login',async()=>{
 const mode={...env,APPLICATION_MODE:'repositories',DASHBOARD_ACCESS:'collaborators'};
 const config=await worker.fetch(new Request('https://launcher.example/api/public/config'),mode);
 assert.equal((await config.json()).require_login,true);
 const denied=await worker.fetch(new Request('https://launcher.example/api/public/projects?repository=host/scanners',{headers:{Origin:env.DASHBOARD_ORIGIN}}),mode);
 assert.equal(denied.status,401);assert.equal(denied.headers.get('Cache-Control'),'private, no-store');
});
test('collaborator check accepts only membership and observes removal',async t=>{
 const {isCollaborator}=await import('./viewer-access.mjs');let status=204;
 t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(url,'https://api.github.com/repos/host/scanners/collaborators/viewer');assert.equal(init.headers.Authorization,'Bearer scoped');return new Response(null,{status});});
 const token=async()=> 'scoped';
 assert.equal(await isCollaborator(env,'viewer',token),true);
 status=404;assert.equal(await isCollaborator(env,'viewer',token),false);
 status=403;await assert.rejects(isCollaborator(env,'viewer',token));
 status=200;await assert.rejects(isCollaborator(env,'viewer',token));
 await assert.rejects(isCollaborator(env,'viewer',async()=>undefined));
});

const workerApiEnv = {...env, WORKER_API_TOKEN: 'worker-api-token'};
function apiRequest(path, body, overrides = {}) {
  return new Request(`https://launcher.example${path}`, { method: 'POST', headers: { Authorization: `Bearer ${workerApiEnv.WORKER_API_TOKEN}`, 'Content-Type': 'application/json', ...overrides }, ...(body !== undefined ? { body, ...(typeof body === 'object' && body !== null && typeof body.pipeThrough === 'function' ? { duplex: 'half' } : {}) } : {}) });
}
test('state and report writes are bounded per endpoint', async () => {
  const state = { store: new Map(), async get(key) { return this.store.get(key) || null; }, async put(key, value) { this.store.set(key, value); } };
  const reports = { store: new Map(), async get(key) { return null; }, async put(key, value) { if (value && typeof value.pipeThrough === 'function') await new Response(value).arrayBuffer(); this.store.set(key, value); } };
  const bounded = { ...workerApiEnv, ANALYSIS_STATE: state, ANALYSIS_REPORTS: reports, MAX_STATE_BYTES: '64', MAX_MANIFEST_JSON_BYTES: '128', MAX_ASSET_BYTES: '256' };
  assert.equal((await worker.fetch(apiRequest('/api/state/ok.json', '{"a":1}'), bounded)).status, 200);
  assert.equal(state.store.get('ok.json'), '{"a":1}');
  const stateDenied = await worker.fetch(apiRequest('/api/state/big.json', 'x'.repeat(128)), bounded);
  assert.equal(stateDenied.status, 413);
  assert.equal((await stateDenied.json()).request_id, stateDenied.headers.get('X-Request-ID'));
  assert.equal(state.store.has('big.json'), false);
  // Streamed state writes without a declared length are counted and cancelled.
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(32)); controller.enqueue(new Uint8Array(32)); controller.enqueue(new Uint8Array(32)); controller.close(); } });
  assert.equal((await worker.fetch(apiRequest('/api/state/stream.json', stream), bounded)).status, 413);
  assert.equal(state.store.has('stream.json'), false);
  // Manifest JSON uploads are bounded before storage.
  const manifest = JSON.stringify({ schema_version: 'analysis-current-v1', metrics: { compressed_bytes: 1 } });
  assert.equal((await worker.fetch(apiRequest('/api/report/analysis-current-2.json', manifest), bounded)).status, 200);
  const manifestDenied = await worker.fetch(apiRequest('/api/report/analysis-current-1.json', 'x'.repeat(256)), bounded);
  assert.equal(manifestDenied.status, 413);
  assert.equal(reports.store.has('analysis-current-1.json'), false);
  // Asset uploads enforce the per-object budget.
  const assetDenied = await worker.fetch(apiRequest('/api/report/analysis-current-1/analysis-' + 'a'.repeat(64) + '.json.gz', 'x'.repeat(512)), bounded);
  assert.equal(assetDenied.status, 413);
  assert.equal(reports.store.size, 1);
});
test('report authorization remains collaborator-only when dashboard sign-in is disabled',async t=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
  const config={execution_repository:{id:EXECUTION_REPOSITORY_ID,full_name:EXECUTION_REPOSITORY},tooling_sha:'a'.repeat(40),projects:CONFIGURED_TARGETS.map(target=>({id:target.id,source_repository:{id:target.repository_id,full_name:target.repository,private:false},relationship:target.relationship,preferred_branch:target.branch,native_feedback_enabled:target.native_feedback,profile:{mode:'portable'},enabled_scanners:['semgrep'],deferred_channels:{}}))};
  const reportProject=CONFIGURED_TARGETS[0].id;
  const manifest={schema_version:'analysis-current-v1',project_id:reportProject,analysis_repository:EXECUTION_REPOSITORY,checked_at:new Date().toISOString(),targets:[]};
 let reportReads=0;const githubCalls=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  const target=String(url);
  githubCalls.push(target);
  if(target==='https://api.github.com/user')return reply({login:'viewer'});
   if(target.endsWith(`/repos/${EXECUTION_REPOSITORY}/installation`))return reply({id:9});
   if(target.endsWith('/app/installations/9/access_tokens'))return reply({token:'scoped-viewer'});
   if(target.endsWith(`/repos/${EXECUTION_REPOSITORY}/collaborators/viewer`))return new Response(null,{status:204});
   if(target===`https://api.github.com/repos/${EXECUTION_REPOSITORY}`)return reply({id:EXECUTION_REPOSITORY_ID,full_name:EXECUTION_REPOSITORY,private:false,default_branch:'main',permissions:{pull:true,push:false,admin:false}});
   for(const project of CONFIGURED_TARGETS)if(target===`https://api.github.com/repos/${project.repository}`)return reply({id:project.repository_id,full_name:project.repository,private:false,default_branch:project.branch});
   if(target.includes('/contents/.github/code-analysis/projects.json'))return reply({content:Buffer.from(JSON.stringify(config)).toString('base64')});
  throw new Error(`Unexpected GitHub request: ${target}`);
 });
  const protectedEnv={...env,APPLICATION_MODE:'repositories',DASHBOARD_ACCESS:'',REPORT_ACCESS:'collaborators',GITHUB_APP_ID:'report-app',GITHUB_APP_PRIVATE_KEY:pem,ANALYSIS_REPOSITORY:EXECUTION_REPOSITORY,ANALYSIS_REPOSITORY_ID:String(EXECUTION_REPOSITORY_ID),ANALYSIS_REPORTS:{async get(){reportReads++;return{json:async()=>manifest};}}};
  const path=`/api/public/manifest?repository=${encodeURIComponent(EXECUTION_REPOSITORY)}&project_id=${reportProject}`;
 assert.equal((await worker.fetch(new Request(`https://launcher.example${path}`,{headers:{Origin:env.DASHBOARD_ORIGIN}}),protectedEnv)).status,401);
 assert.equal(reportReads,0);
 const allowed=await worker.fetch(await request(path,undefined),protectedEnv);
  assert.equal(allowed.status,200,`${await allowed.clone().text()} ${githubCalls.join(' | ')}`);assert.equal(allowed.headers.get('Cache-Control'),'private, no-store');assert.equal((await allowed.json()).project_id,reportProject);assert.equal(reportReads,1);
 const configResponse=await worker.fetch(new Request('https://launcher.example/api/public/config'),protectedEnv);
  assert.deepEqual(await configResponse.json(),{mode:'repositories',require_login:false,require_report_login:true,execution_repository:{id:EXECUTION_REPOSITORY_ID,full_name:EXECUTION_REPOSITORY}});
 const publicEnv={...protectedEnv,REPORT_ACCESS:'public'};
 const anonymous=await worker.fetch(new Request(`https://launcher.example${path}`),publicEnv);
 assert.equal(anonymous.status,200);assert.equal(anonymous.headers.get('Cache-Control'),'public, max-age=60');assert.equal(reportReads,2);
 const publicConfig=await worker.fetch(new Request('https://launcher.example/api/public/config'),publicEnv);
  assert.deepEqual(await publicConfig.json(),{mode:'repositories',require_login:false,require_report_login:false,execution_repository:{id:EXECUTION_REPOSITORY_ID,full_name:EXECUTION_REPOSITORY}});
 const restrictedPublicReports={...protectedEnv,DASHBOARD_ACCESS:'collaborators',REPORT_ACCESS:'public'};
 const explicitlyPublic=await worker.fetch(new Request(`https://launcher.example${path}`),restrictedPublicReports);
  assert.equal(explicitlyPublic.status,200);assert.equal(explicitlyPublic.headers.get('Cache-Control'),'private, no-store');assert.equal(reportReads,3);
  const publicProjectList=await worker.fetch(new Request('https://launcher.example/api/public/projects',{headers:{Origin:env.DASHBOARD_ORIGIN}}),publicEnv);
  assert.equal(publicProjectList.status,401);
  const anonymousTargets=await worker.fetch(new Request('https://launcher.example/api/projects',{headers:{Origin:env.DASHBOARD_ORIGIN}}),{...publicEnv,DASHBOARD_ACCESS:'collaborators'});
  assert.equal(anonymousTargets.status,401);
 const protectedDashboard=await worker.fetch(new Request('https://launcher.example/api/repositories',{headers:{Origin:env.DASHBOARD_ORIGIN}}),restrictedPublicReports);
 assert.equal(protectedDashboard.status,401);
});
test('launch bodies above the endpoint budget are rejected', async t => {
  t.mock.method(globalThis, 'fetch', async () => reply({ permissions: { push: true }, default_branch: 'main' }));
  const response = await worker.fetch(await request('/api/launch', { repository: 'source/app', kind: 'branch', ref: 'x'.repeat(4096) }), env);
  assert.equal(response.status, 413);
  const body = await response.json();
  assert.equal(body.request_id, response.headers.get('X-Request-ID'));
  assert.equal(body.error.includes('2048'), true);
});
test('error responses carry the request id for correlation', async () => {
  const response = await worker.fetch(new Request('https://launcher.example/api/launch', { method: 'POST', headers: { Origin: env.DASHBOARD_ORIGIN } }), env);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.request_id, response.headers.get('X-Request-ID'));
  assert.equal(typeof body.error, 'string');
});
test('same-origin preflight keeps CORS and response safety headers', async () => {
  const response = await worker.fetch(new Request('https://launcher.example/api/launch', {
    method: 'OPTIONS', headers: { Origin: env.DASHBOARD_ORIGIN, 'Access-Control-Request-Method': 'POST' }
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.DASHBOARD_ORIGIN);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('X-Request-ID'), /^[a-f0-9-]{36}$/);
});
test('worker failures log classified error codes only', async t => {
  const calls = t.mock.method(console, 'log', () => {});
  const response = await worker.fetch(new Request('https://launcher.example/api/launch', { method: 'POST', headers: { Origin: env.DASHBOARD_ORIGIN } }), { ...env, SAFE_API_LOGS: 'true' });
  assert.equal(response.status, 401);
  assert.equal(calls.mock.calls.length, 1);
  assert.match(calls.mock.calls[0].arguments[0], /"error_code":"session_invalid"/);
  assert.ok(!calls.mock.calls[0].arguments[0].includes('Authorization'));
});
test('collaborator verification re-mints revoked installation tokens', async t => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pem = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const { isCollaborator } = await import('./viewer-access.mjs');
  let mints = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).endsWith('/installation')) return Response.json({ id: 9 });
    if (String(url).endsWith('/access_tokens')) { mints++; return Response.json({ token: `scoped-${mints}` }); }
    assert.equal(String(url), 'https://api.github.com/repos/host/scanners/collaborators/viewer');
    if (init.headers.Authorization === 'Bearer scoped-1') return new Response(null, { status: 401 });
    return new Response(null, { status: 204 });
  });
  const viewerEnv = { ...env, ANALYSIS_REPOSITORY: 'host/scanners', GITHUB_APP_ID: 'viewer-app-mint', GITHUB_APP_PRIVATE_KEY: pem };
  assert.equal(await isCollaborator(viewerEnv, 'viewer'), true);
  assert.equal(mints, 2);
});
test('idempotent GitHub reads retry bounded transient and secondary-rate-limit failures', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    if (url.endsWith('repos/host/scanners')) {
      if (calls < 3) return new Response('busy', { status: 502, headers: { 'Retry-After': '0' } });
      return reply({ permissions: { push: true }, default_branch: 'main' });
    }
    return reply({ id: 1, path: '.github/workflows/10-analysis-discovery.yml' });
  });
  assert.equal((await worker.fetch(await request('/api/runs/42'), env)).status, 200);
  assert.equal(calls, 4);
});
test('secondary-rate-limit reads retry, ordinary forbidden reads do not', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    if (url.endsWith('repos/host/scanners')) return calls === 1
      ? new Response(JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }), { status: 403, headers: { 'Retry-After': '0' } })
      : reply({ permissions: { push: true } });
    return reply({ id: 1, path: '.github/workflows/10-analysis-discovery.yml' });
  });
  assert.equal((await worker.fetch(await request('/api/runs/42'), env)).status, 200);
  assert.equal(calls, 3);
});
test('dispatch POST failures are never retried', async t => {
  let dispatches = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.includes('dispatches')) { dispatches++; return new Response('busy', { status: 503, headers: { 'Retry-After': '0' } }); }
    if (url.endsWith('repos/host/scanners')) return reply({ permissions: { push: true }, default_branch: 'main' });
    return reply({ commit: { sha: 'a'.repeat(40) } });
  });
  assert.equal((await worker.fetch(await request('/api/launch', { repository: 'source/app', kind: 'branch', ref: 'main' }), env)).status, 502);
  assert.equal(dispatches, 1);
});
