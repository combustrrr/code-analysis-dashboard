import {emitDiagnostic} from './diagnostics.mjs';
import {isCollaborator} from './viewer-access.mjs';
import { reportToken } from './github-app.mjs';
import { publicReports } from './reports.mjs';
import { applicationApi } from './application.mjs';
import {readBody, BodyLimitError, resolveLimit, DEFAULT_LIMITS} from './request-limits.mjs';
import {MAX_GITHUB_READ_RETRIES, sleep, retryAfterMs, secondaryRateLimit, transientReadStatus} from './github-retry.mjs';
import {AuthExchangeStore} from './auth-exchange.mjs';
import {EXECUTION_REPOSITORY, EXECUTION_REPOSITORY_ID} from './target-registry.mjs';
// Credential boundary: this Worker calls GitHub APIs only; it never runs source code.
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const bytes = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
export async function seal(value, secret) {
  const key = await crypto.subtle.importKey('raw', bytes(secret), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return `${b64(iv)}.${b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)))))}`;
}
export async function unseal(value, secret, type) {
  try {
    const [iv, data] = value.split('.');
    const key = await crypto.subtle.importKey('raw', bytes(secret), 'AES-GCM', false, ['decrypt']);
    const decoded = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, key, bytes(data))));
    if (decoded.type !== type || decoded.exp <= Date.now()) throw new Error();
    return decoded;
  } catch { throw new Failure(401, 'Sign in again; the session is invalid or expired.', 'session_invalid'); }
}
class Failure extends Error { constructor(status, message, code) { super(message); this.status = status; if (code) this.code = code; } }
const cookie = (value, age) => `__Host-analysis-oauth=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
function settings(env) {
  if (env.APPLICATION_MODE !== 'repositories' || !/^[\w.-]+\/[\w.-]+$/.test(env.ANALYSIS_REPOSITORY || '')) throw new Failure(503, 'Configured repository service is unavailable.', 'launcher_misconfigured');
  const dashboardBase = new URL(env.DASHBOARD_BASE_PATH || '/', `${env.DASHBOARD_ORIGIN}/`);
  if (new URL(env.DASHBOARD_ORIGIN).origin !== env.DASHBOARD_ORIGIN || !env.DASHBOARD_ORIGIN.startsWith('https://') || dashboardBase.origin !== env.DASHBOARD_ORIGIN || !dashboardBase.pathname.endsWith('/') || dashboardBase.search || dashboardBase.hash || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_KEY) throw new Failure(503, 'Launcher authentication is not configured.', 'launcher_misconfigured');
}
async function github(path, token, init = {}) {
  const read = !init.method || init.method.toUpperCase() === 'GET';
  if (!read) throw new Failure(405, 'GitHub repository writes are disabled for this service.', 'github_write_disabled');
  let response, secondary=false;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(`https://api.github.com/${path}`, { ...init, headers: {
      Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'code-analysis-launcher', Authorization: `Bearer ${token}`, ...init.headers,
    } });
    secondary = await secondaryRateLimit(response);
    if (!read || attempt >= MAX_GITHUB_READ_RETRIES || (!transientReadStatus(response.status) && !secondary)) break;
    await sleep(retryAfterMs(response));
  }
  if (!response.ok) throw new Failure(response.status === 401 ? 401 : response.status === 404 ? 403 : response.status === 429 || secondary ? 429 : 503,
    'GitHub could not authorize or complete this request. Check App installation, repository access, and API limits.',
    response.status === 401 ? 'github_unauthorized' : response.status === 404 ? 'github_forbidden' : response.status === 429 || secondary ? 'github_rate_limited' : 'github_unavailable');
  return response.status === 204 ? null : response.json();
}
async function access(env, token, permission = 'pull') {
  const repo = await github(`repos/${env.ANALYSIS_REPOSITORY}`, token);
  if (env.APPLICATION_MODE === 'repositories' && (repo.id !== Number(env.ANALYSIS_REPOSITORY_ID || EXECUTION_REPOSITORY_ID) || repo.full_name?.toLowerCase() !== EXECUTION_REPOSITORY.toLowerCase())) throw new Failure(409, 'Configured execution repository identity mismatch.', 'repository_identity');
  if (!repo.permissions?.[permission]) throw new Failure(403, permission === 'push' ? 'Write access to the configured analysis repository is required.' : 'Read access to the configured analysis repository is required.', permission === 'push' ? 'repository_write_required' : 'repository_read_required');
  return repo;
}
async function pages(path, token) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const rows = await github(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, token);
    if (!Array.isArray(rows)) throw new Failure(502, 'GitHub returned an incomplete target inventory.', 'inventory_incomplete');
    all.push(...rows);
    if (rows.length < 100) return all;
  }
  throw new Failure(422, 'Target inventory exceeds the launcher pagination limit. Use GitHub Actions to launch this repository.', 'pagination_limit');
}
const restricted = env => env.APPLICATION_MODE === 'repositories' || env.DASHBOARD_ACCESS === 'collaborators';
const privateReports = env => env.REPORT_ACCESS !== 'public';
const reportPath = path => path.startsWith('/api/public/') && path !== '/api/public/config';
const protectedReportResponse = async (request, env) => {
  const response = await publicReports(request, env);
  if (!response || !privateReports(env)) return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
async function viewer(env, token, {dashboard = restricted(env), reports = false} = {}) {
  const user = await github('user', token);
  if ((dashboard || reports) && !await isCollaborator(env,user.login)) throw new Failure(403, 'This GitHub account is not authorized to view these reports.', 'viewer_not_authorized');
  return user;
}
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...extra } });
const dashboardLocation = (env, fragment) => {
  const url = new URL(env.DASHBOARD_BASE_PATH || '/', `${env.DASHBOARD_ORIGIN}/`);
  url.hash = fragment;
  return url.toString();
};
const authRedirect = (env, status) => new Response(null, { status: 302, headers: { Location: dashboardLocation(env, `analysis_auth_error=${encodeURIComponent(status)}`), 'Cache-Control': 'no-store', 'Set-Cookie': cookie('', 0) } });
async function controlRequest(env, key, path, body) {
  if (!env.AUTH_EXCHANGES) throw new Failure(503, 'Sign-in exchange storage is unavailable.', 'exchange_store_unavailable');
  const stub = env.AUTH_EXCHANGES.get(env.AUTH_EXCHANGES.idFromName(key));
  return stub.fetch(new Request(`https://control${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
}
async function route(request, env) {
  const url = new URL(request.url);
  
  if (url.pathname.startsWith('/api/state/') || url.pathname.startsWith('/api/report/')) {
    if (request.headers.get('Authorization') !== `Bearer ${env.WORKER_API_TOKEN}`) {
      throw new Failure(401, 'Unauthorized state access.', 'unauthorized');
    }
    // Keep the complete suffix so repository-qualified keys cannot collide.
    const prefix = url.pathname.startsWith('/api/state/') ? '/api/state/' : '/api/report/';
    const id = url.pathname.slice(prefix.length);
    if (!id || id.includes('..') || id.startsWith('/') || id.endsWith('/')) throw new Failure(400, 'Invalid storage key.', 'invalid_request');
    
    if (url.pathname.startsWith('/api/state/')) {
      if (!env.ANALYSIS_STATE) throw new Failure(500, 'KV binding not configured.', 'storage_not_configured');
      if (request.method === 'GET') {
        const val = await env.ANALYSIS_STATE.get(id);
        return new Response(val || '{}', { headers: { 'Content-Type': 'application/json' } });
      } else if (request.method === 'POST') {
        // Guardrail: bound state writes to the KV value cap.
        const data = await readBody(request, resolveLimit(env.MAX_STATE_BYTES, DEFAULT_LIMITS.stateWrite));
        await env.ANALYSIS_STATE.put(id, new TextDecoder().decode(data));
        return new Response('OK');
      }
    }
    
    if (url.pathname.startsWith('/api/report/')) {
      if (!env.ANALYSIS_REPORTS) throw new Failure(500, 'R2 binding not configured.', 'storage_not_configured');
      if (request.method === 'GET') {
        const obj = await env.ANALYSIS_REPORTS.get(id);
        if (!obj) throw new Failure(404, 'Report not found.', 'report_not_found');
        return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' } });
      } else if (request.method === 'POST') {
        // Guardrails: prevent R2 overuse by bounding per-object size and manifest budget.
        const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
        const lengthHeader = request.headers.get('Content-Length');
        const maxAsset = resolveLimit(env.MAX_ASSET_BYTES, DEFAULT_LIMITS.reportAsset);
        const maxManifestCompressed = resolveLimit(env.MAX_MANIFEST_COMPRESSED_BYTES, 900000000);
        const maxManifestJson = resolveLimit(env.MAX_MANIFEST_JSON_BYTES, DEFAULT_LIMITS.reportManifestJson);
        // If manifest JSON: enforce the JSON read budget and compressed-bytes budget, then write validated JSON.
        if (/\.json$/.test(id) && contentType.includes('application/json')) {
          const text = new TextDecoder().decode(await readBody(request, maxManifestJson));
          try {
            const manifest = JSON.parse(text);
            const compressed = Number(manifest?.metrics?.compressed_bytes || 0);
            if (!Number.isFinite(compressed) || compressed < 0 || compressed > maxManifestCompressed) {
              throw new Failure(413, 'Manifest exceeds configured compressed-bytes budget.', 'request_too_large');
            }
          } catch (e) {
            if (e instanceof Failure) throw e; else throw new Failure(400, 'Invalid manifest JSON.', 'invalid_json');
          }
          await env.ANALYSIS_REPORTS.put(id, text, { httpMetadata: { contentType: 'application/json' } });
          return new Response('OK');
        }
        // Asset uploads: enforce per-object size (prefer Content-Length; otherwise, count stream).
        if (lengthHeader && /^\d+$/.test(lengthHeader)) {
          const n = parseInt(lengthHeader, 10);
          if (n > maxAsset) throw new Failure(413, 'Asset exceeds the configured size limit.', 'request_too_large');
          await env.ANALYSIS_REPORTS.put(id, request.body, { httpMetadata: { contentType } });
          return new Response('OK');
        }
        // No reliable length; count while streaming.
        let total = 0, exceeded = false;
        const limiter = new TransformStream({
          transform(chunk, controller) {
            total += chunk.byteLength || 0;
            if (total > maxAsset) {
              exceeded = true;
              controller.error(new BodyLimitError(maxAsset));
              return;  // stop
            }
            controller.enqueue(chunk);
          }
        });
        try {
          await env.ANALYSIS_REPORTS.put(id, request.body?.pipeThrough(limiter), { httpMetadata: { contentType } });
        } catch (e) {
          if (exceeded || e instanceof BodyLimitError) throw new Failure(413, 'Asset exceeds the configured size limit.', 'request_too_large');
          throw e;
        }
        return new Response('OK');
      }
    }
  }

  if(url.pathname.startsWith('/api/internal/queue/')){
    if(request.headers.get('Authorization')!==`Bearer ${env.WORKER_API_TOKEN}`)throw new Failure(401,'Unauthorized queue access.','unauthorized');
    if(request.method!=='POST')throw new Failure(405,'Method not allowed.','method_not_allowed');
    let body={};try{body=await request.json();}catch{}
    const action=url.pathname.endsWith('/claim')?'/queue/claim':url.pathname.endsWith('/complete')?'/queue/complete':null;
    if(!action)throw new Failure(404,'Not found.','not_found');
    return controlRequest(env,'control-plane',action,body);
  }

  settings(env);
  if (request.method === 'GET' && url.pathname === '/auth/login') {
    const challenge = url.searchParams.get('challenge');
    if (!/^[A-Za-z0-9_-]{43}$/.test(challenge || '')) throw new Failure(400, 'Invalid login request.', 'invalid_request');
    const state = random();
    const verifier = random();
    const oauthChallenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
    const pending = await seal({ type: 'oauth', state, challenge, verifier, exp: Date.now() + 600000 }, env.SESSION_KEY);
    const authorize = new URL('https://github.com/login/oauth/authorize');
    const parameters = { client_id: env.GITHUB_CLIENT_ID, state, redirect_uri: `${url.origin}/auth/callback`, code_challenge: oauthChallenge, code_challenge_method: 'S256' };
    // GitHub App user authorization is permissioned by the App registration, not OAuth scopes.
    authorize.search = new URLSearchParams(parameters).toString();
    return new Response(null, { status: 302, headers: { Location: authorize.toString(), 'Set-Cookie': cookie(pending, 600) } });
  }
  if (request.method === 'GET' && url.pathname === '/auth/callback') {
    const stored = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('__Host-analysis-oauth='))?.split('=')[1];
    let pending;
    try { pending = await unseal(stored || '', env.SESSION_KEY, 'oauth'); }
    catch { return authRedirect(env, 'retry'); }
    if (pending.state !== url.searchParams.get('state')) return authRedirect(env, 'retry');
    if (url.searchParams.has('error')) return authRedirect(env, 'cancelled');
    if (!url.searchParams.get('code')) return authRedirect(env, 'retry');
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code'), redirect_uri: `${url.origin}/auth/callback`, code_verifier: pending.verifier }) });
      const grant = await response.json();
      if (!response.ok || !grant.access_token) return authRedirect(env, 'retry');
      const user = await viewer(env, grant.access_token, { dashboard: restricted(env), reports: privateReports(env) });
      const grantExpiresAt=Date.now()+Math.min(8*3600,grant.expires_in||8*3600)*1000;
      const encryptedGrant=await seal({type:'grant',token:grant.access_token,exp:grantExpiresAt},env.SESSION_KEY);
      const handle=random();
      const stored=await controlRequest(env,'control-plane','/session/create',{handle,grant:encryptedGrant,user_id:user.id,login:user.login,grant_expires_at:grantExpiresAt});
      if(!stored.ok)return authRedirect(env,'retry');
      const code = random();
      const issued = await controlRequest(env,'control-plane','/exchange/issue',{code,verifier_hash:pending.challenge,session_handle:handle});
      if (!issued.ok) return authRedirect(env, 'retry');
      return new Response(null, { status: 302, headers: { Location: dashboardLocation(env, `analysis_auth=${code}`), 'Cache-Control': 'no-store', 'Set-Cookie': cookie('', 0) } });
    } catch (error) {
      if (error instanceof Failure && error.code === 'viewer_not_authorized') return authRedirect(env, 'not_authorized');
      return authRedirect(env, 'retry');
    }
  }
  if (request.method === 'GET' && url.pathname === '/api/public/config') {
    return json({mode:'repositories', require_login:restricted(env), require_report_login:privateReports(env), execution_repository:{id:Number(env.ANALYSIS_REPOSITORY_ID || EXECUTION_REPOSITORY_ID),full_name:env.ANALYSIS_REPOSITORY}});
  }
  if (env.REPORT_ACCESS === 'public') {
    const report = await publicReports(request,env);
    if (report) return report;
  }
  if (!url.pathname.startsWith('/api/')) throw new Failure(404, 'Not found.', 'not_found');
  if (request.headers.get('Origin') !== env.DASHBOARD_ORIGIN) throw new Failure(403, 'Dashboard origin required.', 'origin_required');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method === 'POST' && url.pathname === '/api/auth/redeem') {
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new Failure(415, 'JSON required.', 'unsupported_media_type');
    let body;
    try { body = JSON.parse(new TextDecoder().decode(await readBody(request, 2048))); }
    catch (error) {
      if (error instanceof BodyLimitError) throw new Failure(413, 'Exchange request is too large.', 'request_too_large');
      throw new Failure(400, 'Invalid exchange request.', 'invalid_request');
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(body.code || '') || !/^[A-Za-z0-9_-]{43}$/.test(body.verifier || '')) throw new Failure(400, 'Invalid exchange request.', 'invalid_request');
    const result = await controlRequest(env,'control-plane','/exchange/consume',{code:body.code,verifier_hash:await digest(body.verifier)});
    if (!result.ok) {
      const failure = result.status === 410 ? 'exchange_expired' : result.status === 401 || result.status === 404 ? 'exchange_invalid' : 'exchange_store_unavailable';
      throw new Failure(result.status === 410 || result.status === 401 || result.status === 404 ? 401 : 503, 'Sign-in could not be completed. Retry GitHub sign-in.', failure);
    }
    const exchanged=await result.json();
    const stored=await controlRequest(env,'control-plane','/session/get',{handle:exchanged.session_handle});
    if(!stored.ok)throw new Failure(503,'Sign-in could not be completed. Retry GitHub sign-in.','exchange_store_unavailable');
    const metadata=await stored.json();
    return json({token:exchanged.session_handle,login:metadata.login},200,{'Cache-Control':'no-store'});
  }
  const handle=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!/^[A-Za-z0-9_-]{43}$/.test(handle))throw new Failure(401,'Sign in again; the session is invalid or expired.','session_invalid');
  if(request.method==='POST'&&url.pathname==='/api/logout'){
    const current=await controlRequest(env,'control-plane','/session/get',{handle});
    await controlRequest(env,'control-plane','/session/delete',{handle});
    if(current.ok){try{const stored=await current.json(),grant=await unseal(stored.grant,env.SESSION_KEY,'grant');await fetch('https://api.github.com/applications/'+env.GITHUB_CLIENT_ID+'/token',{method:'DELETE',headers:{Authorization:'Basic '+btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`),'Content-Type':'application/json'},body:JSON.stringify({access_token:grant.token})});}catch{}}
    return json({ok:true});
  }
  const storedSession=await controlRequest(env,'control-plane','/session/get',{handle});
  if(!storedSession.ok)throw new Failure(401,'Sign in again; the session is invalid or expired.','session_invalid');
  const sessionRow=await storedSession.json(),grant=await unseal(sessionRow.grant,env.SESSION_KEY,'grant');
  const session={token:grant.token,user_id:sessionRow.user_id,login:sessionRow.login,handle};
  if (restricted(env) || url.pathname === '/api/session' || (reportPath(url.pathname) && privateReports(env))) {
    const user = await viewer(env, session.token, { dashboard: restricted(env), reports: reportPath(url.pathname) && privateReports(env) || (url.pathname === '/api/session' && privateReports(env)) });
    if(user.id!==session.user_id)throw new Failure(401,'Sign in again; the session identity changed.','session_invalid');
    if (request.method === 'GET' && url.pathname === '/api/session') {const repo=await access(env,session.token,'pull');return json({login:user.login,user_id:user.id,role:repo.permissions?.admin?'admin':repo.permissions?.push?'write':'read',capabilities:{read:true,write:!!repo.permissions?.push,admin:!!repo.permissions?.admin}});}
  }
  const helpers = {github,json,Failure,seal,unseal,pages,serviceToken:()=>reportToken(env,env.ANALYSIS_REPOSITORY,{contents:'read',actions:'read'}),queue:async(path,body)=>controlRequest(env,'control-plane',path,body)};
    if (reportPath(url.pathname)) {
      await access(env, session.token, 'pull');
      if (privateReports(env) && url.searchParams.has('project_id')) {
        const identityUrl = new URL('/api/project-identity', url);
        identityUrl.search = new URLSearchParams({project_id:url.searchParams.get('project_id')});
        const identity = await applicationApi(new Request(identityUrl, {headers:{Authorization:request.headers.get('Authorization') || ''}}), env, session, helpers);
        if (!identity) throw new Failure(404, 'Configured project is unavailable.', 'project_unavailable');
        if (!identity.ok) return identity;
      }
    }
    const report = await protectedReportResponse(request,env);
    if (report) return report;
    const response = await applicationApi(request, env, session, helpers);
    if (response) return response;
  throw new Failure(404, 'Unknown application endpoint.', 'not_found');
}
export default { async fetch(request, env) {
  const started=Date.now();const requestId=crypto.randomUUID();
  let response; let failureCode;
  try { response = await route(request, env); } catch (e) {
    const known = e instanceof Failure || e instanceof BodyLimitError;
    failureCode = known ? e.code : undefined;
    response = json({ error: known ? e.message : 'Launcher unavailable. No successful launch has been confirmed; check GitHub Actions before retrying.', ...(failureCode ? { code: failureCode } : {}), request_id: requestId }, known ? e.status : 503);
  }
  const headers = new Headers(response.headers);
  headers.set('X-Request-ID',requestId);
  emitDiagnostic(request,response.status,started,requestId,env,failureCode);
  const protectedReport = privateReports(env) && reportPath(new URL(request.url).pathname);
  if (restricted(env) || protectedReport || !new URL(request.url).pathname.startsWith('/api/public/')) headers.set('Cache-Control', restricted(env) || protectedReport ? 'private, no-store' : 'no-store'); headers.set('Referrer-Policy', 'no-referrer'); headers.set('X-Content-Type-Options', 'nosniff');
  if (request.headers.get('Origin') === env.DASHBOARD_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', env.DASHBOARD_ORIGIN); headers.set('Vary', 'Origin');
    headers.set('Access-Control-Expose-Headers','X-Request-ID, Retry-After');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  }
  return new Response(response.body, { status: response.status, headers });
} };
export {AuthExchangeStore};
