import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { seal, unseal } from './worker.mjs';

const env = { SOURCE_REPOSITORY: 'source/app', ANALYSIS_REPOSITORY: 'host/scanners', DASHBOARD_ORIGIN: 'https://owner.github.io', GITHUB_CLIENT_ID: 'app-id', GITHUB_CLIENT_SECRET: 'test-secret', GITHUB_OAUTH_SCOPES: 'public_repo', SESSION_KEY: Buffer.alloc(32, 7).toString('base64url') };
const reply = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
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
test('OAuth binds callback to cookie and nonce, uses PKCE and exposes only encrypted session', async t => {
  const nonce = 'a'.repeat(64);
  const login = await worker.fetch(new Request(`https://launcher.example/auth/login?nonce=${nonce}`), env);
  assert.equal(login.status, 302);
  const location = new URL(login.headers.get('Location'));
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(location.searchParams.get('scope'), 'public_repo');
  assert.ok(login.headers.get('Set-Cookie').includes('HttpOnly; SameSite=Lax'));
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  const wrong = await worker.fetch(new Request('https://launcher.example/auth/callback?code=x&state=wrong', { headers: { Cookie: cookie } }), env);
  assert.equal(wrong.status, 401);
  t.mock.method(globalThis, 'fetch', async url => url.includes('access_token') ? reply({ access_token: 'never-show-github-token' }) : url.endsWith('/user') ? reply({ login: 'developer' }) : reply({ permissions: { push: true } }));
  const response = await worker.fetch(new Request(`https://launcher.example/auth/callback?code=x&state=${location.searchParams.get('state')}`, { headers: { Cookie: cookie } }), env);
  const html = await response.text();
  assert.equal(response.status, 200); assert.ok(!html.includes('never-show-github-token'));
  assert.ok(html.includes(nonce)); assert.ok(html.includes('https://owner.github.io'));
  assert.ok(response.headers.get('Content-Security-Policy').includes("default-src 'none'"));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('repository App authorization omits OAuth scopes', async () => {
  const mode = { ...env, APPLICATION_MODE: 'repositories', ANALYSIS_REPOSITORY: 'host/scanners', GITHUB_APP_SLUG: 'code-analysis-dashboard' };
  const login = await worker.fetch(new Request(`https://launcher.example/auth/login?nonce=${'a'.repeat(64)}`), mode);
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
 const restricted={...env,APPLICATION_MODE:'repositories',DASHBOARD_ACCESS:'allowlist',DASHBOARD_ALLOWED_USERS:' combustrrr '};
 assert.equal((await worker.fetch(await request('/api/session'),restricted)).status,200);
 assert.equal((await worker.fetch(await request('/api/session'),{...restricted,DASHBOARD_ALLOWED_USERS:'another-user'})).status,403);
 assert.equal((await worker.fetch(await request('/api/public/manifest?repository=host/scanners&project_id=1'),{...restricted,DASHBOARD_ALLOWED_USERS:''})).status,403);
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
