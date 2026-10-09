import {emitDiagnostic} from './diagnostics.mjs';
import {isCollaborator} from './viewer-access.mjs';
import { webhook } from './github-app.mjs';
import { publicReports } from './reports.mjs';
import { applicationApi } from './application.mjs';
import {readBody, BodyLimitError, resolveLimit, DEFAULT_LIMITS} from './request-limits.mjs';
import {MAX_GITHUB_READ_RETRIES, sleep, retryAfterMs, secondaryRateLimit, transientReadStatus} from './github-retry.mjs';
// Credential boundary: this Worker calls GitHub APIs only; it never runs source code.
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const bytes = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
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
  for (const key of (env.APPLICATION_MODE === 'repositories' ? ['ANALYSIS_REPOSITORY'] : ['SOURCE_REPOSITORY', 'ANALYSIS_REPOSITORY'])) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(env[key] || '')) throw new Failure(503, 'Launcher repository configuration is unavailable.', 'launcher_misconfigured');
  }
  if (env.APPLICATION_MODE !== 'repositories' && env.SOURCE_REPOSITORY.toLowerCase() === env.ANALYSIS_REPOSITORY.toLowerCase()) throw new Failure(503, 'Source and analysis repositories must be separate.', 'launcher_misconfigured');
  if (new URL(env.DASHBOARD_ORIGIN).origin !== env.DASHBOARD_ORIGIN || !env.DASHBOARD_ORIGIN.startsWith('https://') || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_KEY) throw new Failure(503, 'Launcher authentication is not configured.', 'launcher_misconfigured');
  // Legacy mode uses a GitHub OAuth App; keep its grant explicit and minimal.
  if (env.APPLICATION_MODE !== 'repositories' && env.GITHUB_OAUTH_SCOPES !== 'public_repo') throw new Failure(503, 'Launcher OAuth scope configuration is unavailable.', 'launcher_misconfigured');
}
async function github(path, token, init = {}) {
  const read = !init.method || init.method.toUpperCase() === 'GET';
  let response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(`https://api.github.com/${path}`, { ...init, headers: {
      Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'code-analysis-launcher', Authorization: `Bearer ${token}`, ...init.headers,
    } });
    const secondary = await secondaryRateLimit(response);
    if (!read || attempt >= MAX_GITHUB_READ_RETRIES || (!transientReadStatus(response.status) && !secondary)) break;
    await sleep(retryAfterMs(response));
  }
  if (!response.ok) throw new Failure(response.status === 401 ? 401 : response.status === 403 || response.status === 404 ? 403 : 502,
    'GitHub could not authorize or complete this request. Check App installation, repository access, and API limits.',
    response.status === 401 ? 'github_unauthorized' : response.status === 403 || response.status === 404 ? 'github_forbidden' : 'github_unavailable');
  return response.status === 204 ? null : response.json();
}
async function access(env, token) {
  const repo = await github(`repos/${env.ANALYSIS_REPOSITORY}`, token);
  if (!repo.permissions?.push) throw new Failure(403, 'Write access to the configured analysis repository is required.', 'repository_write_required');
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
const restricted = env => ['allowlist','collaborators'].includes(env.DASHBOARD_ACCESS);
async function viewer(env, token) {
  const user = await github('user', token);
  if (env.DASHBOARD_ACCESS === 'allowlist') {
    const allowed = (env.DASHBOARD_ALLOWED_USERS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!allowed.includes(user.login?.toLowerCase())) throw new Failure(403, 'This GitHub account is not authorized to view this dashboard.', 'viewer_not_authorized');
  }
  if(env.DASHBOARD_ACCESS === 'collaborators' && !await isCollaborator(env,user.login)) throw new Failure(403, 'Only collaborators of the analysis repository may view this dashboard.', 'viewer_not_authorized');
  return user;
}
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...extra } });
async function route(request, env) {
  if (env.APPLICATION_MODE === 'repositories') {
    const response = await webhook(request, env);
    if (response) return response;
  }
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

  settings(env);
  if (request.method === 'GET' && url.pathname === '/auth/login') {
    const nonce = url.searchParams.get('nonce');
    if (!/^[a-f0-9]{64}$/.test(nonce || '')) throw new Failure(400, 'Invalid login request.', 'invalid_request');
    const state = random();
    const verifier = random();
    const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
    const pending = await seal({ type: 'oauth', state, nonce, verifier, exp: Date.now() + 600000 }, env.SESSION_KEY);
    const authorize = new URL('https://github.com/login/oauth/authorize');
    const parameters = { client_id: env.GITHUB_CLIENT_ID, state, redirect_uri: `${url.origin}/auth/callback`, code_challenge: challenge, code_challenge_method: 'S256' };
    // GitHub App user authorization is permissioned by the App registration, not OAuth scopes.
    if (env.APPLICATION_MODE !== 'repositories') parameters.scope = env.GITHUB_OAUTH_SCOPES;
    authorize.search = new URLSearchParams(parameters).toString();
    return new Response(null, { status: 302, headers: { Location: authorize.toString(), 'Set-Cookie': cookie(pending, 600) } });
  }
  if (request.method === 'GET' && url.pathname === '/auth/callback') {
    const stored = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('__Host-analysis-oauth='))?.split('=')[1];
    const pending = await unseal(stored || '', env.SESSION_KEY, 'oauth');
    if (!url.searchParams.get('code') || pending.state !== url.searchParams.get('state')) throw new Failure(401, 'GitHub sign-in state did not match. Start sign-in again.', 'oauth_state_mismatch');
    const exchange = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code'), redirect_uri: `${url.origin}/auth/callback`, code_verifier: pending.verifier }) });
    const grant = await exchange.json();
    if (!exchange.ok || !grant.access_token) throw new Failure(401, 'GitHub sign-in failed. Start sign-in again.', 'oauth_exchange_failed');
    if (env.APPLICATION_MODE !== 'repositories') await access(env, grant.access_token);
    const user = await viewer(env, grant.access_token);
    const token = await seal({ type: 'session', token: grant.access_token, exp: Date.now() + Math.min(3600, grant.expires_in || 3600) * 1000 }, env.SESSION_KEY);
    const scriptNonce = random();
    const message = JSON.stringify({ type: 'analysis-auth', nonce: pending.nonce, token, login: user.login }).replaceAll('<', '\\u003c');
    return new Response(`<!doctype html><meta charset="utf-8"><title>Analysis sign-in</title><p>Signed in. Return to the dashboard to start your analysis.</p><script nonce="${scriptNonce}">if(window.opener){window.opener.postMessage(${message},${JSON.stringify(env.DASHBOARD_ORIGIN)});window.close();}</script>`, { headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookie('', 0),
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${scriptNonce}'; base-uri 'none'; frame-ancestors 'none'`,
    } });
  }
  if (env.APPLICATION_MODE === 'repositories') {
    if (request.method === 'GET' && url.pathname === '/api/public/config') {
      const slug = env.GITHUB_APP_SLUG;
      return json({mode:'repositories', require_login:restricted(env), installation_url: /^[a-z0-9-]+$/.test(slug || '') ? `https://github.com/apps/${slug}/installations/new` : null});
    }
    if (!restricted(env)) {
      const report = await publicReports(request,env);
      if (report) return report;
    }
  }
  if (!url.pathname.startsWith('/api/')) throw new Failure(404, 'Not found.', 'not_found');
  if (request.headers.get('Origin') !== env.DASHBOARD_ORIGIN) throw new Failure(403, 'Dashboard origin required.', 'origin_required');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const session = await unseal((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), env.SESSION_KEY, 'session');
  if (restricted(env) || url.pathname === '/api/session') {
    const user = await viewer(env, session.token);
    if (request.method === 'GET' && url.pathname === '/api/session') return json({login:user.login});
  }
  if (env.APPLICATION_MODE === 'repositories') {
    const report = await publicReports(request,env);
    if (report) return report;
    const response = await applicationApi(request, env, session, {github, json, Failure, seal, unseal, pages});
    if (response) return response;
    throw new Failure(404, 'Unknown application endpoint.', 'not_found');
  }
  const repo = await access(env, session.token); // Recheck current permissions for every API call.
  if (request.method === 'GET' && url.pathname === '/api/integration') {
    const [configFile, workflow] = await Promise.all([
      github(`repos/${env.ANALYSIS_REPOSITORY}/contents/config/code-analysis/service.json?ref=${encodeURIComponent(repo.default_branch)}`, session.token),
      github(`repos/${env.ANALYSIS_REPOSITORY}/actions/workflows/10-analysis-discovery.yml`, session.token),
    ]);
    if (configFile.encoding !== 'base64' || typeof configFile.content !== 'string') throw new Failure(502, 'Analysis configuration could not be read.', 'configuration_unreadable');
    const config = JSON.parse(new TextDecoder().decode(bytes(configFile.content.replace(/\s/g, ''))));
    const matches = config.source_repository === env.SOURCE_REPOSITORY && config.analysis_repository === env.ANALYSIS_REPOSITORY && config.launch_endpoint === url.origin;
    return json({ source_repository: env.SOURCE_REPOSITORY, analysis_repository: env.ANALYSIS_REPOSITORY,
      publishing_repository: config.publishing_repository, workflow_branch: repo.default_branch,
      workflow_state: workflow.state, configuration_matches: matches,
      ready: matches && workflow.state === 'active', enabled_scanners: config.enabled_scanners || [],
      checked_at: new Date().toISOString() });
  }
  if (request.method === 'GET' && /^\/api\/runs\/[1-9][0-9]*$/.test(url.pathname)) {
    const id = url.pathname.split('/').at(-1);
    const run = await github(`repos/${env.ANALYSIS_REPOSITORY}/actions/runs/${id}`, session.token);
    if (run.path?.split('@')[0] !== '.github/workflows/10-analysis-discovery.yml') throw new Failure(404, 'This run is not an analysis request workflow.', 'not_found');
    return json({ run_id: run.id, status: run.status, conclusion: run.conclusion, attempt: run.run_attempt,
      updated_at: run.updated_at, checked_at: new Date().toISOString(),
      url: `https://github.com/${env.ANALYSIS_REPOSITORY}/actions/runs/${id}` });
  }
  if (request.method === 'GET' && url.pathname === '/api/targets') {
    const [branches, prs] = await Promise.all([pages(`repos/${env.SOURCE_REPOSITORY}/branches`, session.token), pages(`repos/${env.SOURCE_REPOSITORY}/pulls?state=open`, session.token)]);
    const checked_at = new Date().toISOString();
    if (prs.some(p => !p.head.repo)) throw new Failure(502, 'A PR source is unavailable; target discovery is incomplete.', 'inventory_incomplete');
    return json({ repository: env.SOURCE_REPOSITORY, analysis_repository: env.ANALYSIS_REPOSITORY, targets: [
      ...branches.map(b => ({ id: `branch:${b.name}`, repository: env.SOURCE_REPOSITORY, source_repository: env.SOURCE_REPOSITORY, kind: 'branch', branch: b.name, label: b.name, head_sha: b.commit.sha, checked_at })),
      ...prs.map(p => ({ id: `pr:${p.number}`, repository: env.SOURCE_REPOSITORY, source_repository: p.head.repo.full_name, kind: 'pr', branch: p.head.ref, pr: p.number, label: `PR #${p.number}: ${p.head.ref}`, head_sha: p.head.sha, base_branch: p.base.ref, checked_at })),
    ] });
  }
  if (request.method === 'POST' && url.pathname === '/api/launch') {
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new Failure(415, 'JSON required.', 'unsupported_media_type');
    let body;
    try { body = JSON.parse(new TextDecoder().decode(await readBody(request, resolveLimit(env.MAX_LAUNCH_BYTES, DEFAULT_LIMITS.launch)))); }
    catch (error) {
      if (error instanceof BodyLimitError) throw new Failure(413, error.message, 'request_too_large');
      throw new Failure(400, 'Invalid JSON.', 'invalid_json');
    }
    if (!body || body.repository !== env.SOURCE_REPOSITORY || !['branch', 'pr', 'commit'].includes(body.kind) || typeof body.ref !== 'string' || !body.ref || body.ref.length > 255) throw new Failure(400, 'Choose a configured codebase and revision.', 'invalid_launch_selection');
    let path;
    if (body.kind === 'pr') {
      if (!/^[1-9][0-9]*$/.test(body.ref)) throw new Failure(400, 'Invalid PR number.', 'invalid_launch_selection');
      path = `pulls/${body.ref}`;
    } else if (body.kind === 'commit') {
      if (!/^[a-fA-F0-9]{40}$/.test(body.ref)) throw new Failure(400, 'Full commit SHA required.', 'invalid_launch_selection');
      path = `commits/${body.ref}`;
    } else path = `branches/${encodeURIComponent(body.ref)}`;
    await github(`repos/${env.SOURCE_REPOSITORY}/${path}`, session.token);
    const dispatched = await github(`repos/${env.ANALYSIS_REPOSITORY}/actions/workflows/10-analysis-discovery.yml/dispatches`, session.token, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: repo.default_branch, return_run_details: true,
        inputs: { refresh_target: JSON.stringify({ repository: env.SOURCE_REPOSITORY, kind: body.kind, ref: body.ref }) } }),
    });
    const id = dispatched?.workflow_run_id;
    return json({ status: 'submitted', run_id: id || null, url: `https://github.com/${env.ANALYSIS_REPOSITORY}/actions/${id ? `runs/${id}` : 'workflows/10-analysis-discovery.yml'}` }, 202);
  }
  throw new Failure(404, 'Not found.', 'not_found');
}
export default { async fetch(request, env) {
  const started=Date.now();const requestId=crypto.randomUUID();
  if (env.APPLICATION_MODE === 'repositories' && env.NEXT_GITHUB_CLIENT_ID) {
    env = {...env, GITHUB_CLIENT_ID:env.NEXT_GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET:env.NEXT_GITHUB_CLIENT_SECRET,
      GITHUB_APP_ID:env.NEXT_GITHUB_APP_ID, GITHUB_APP_SLUG:env.NEXT_GITHUB_APP_SLUG,
      GITHUB_APP_PRIVATE_KEY:env.NEXT_GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET:env.NEXT_GITHUB_WEBHOOK_SECRET};
  }
  let response; let failureCode;
  try { response = await route(request, env); } catch (e) {
    const known = e instanceof Failure || e instanceof BodyLimitError;
    failureCode = known ? e.code : undefined;
    response = json({ error: known ? e.message : 'Launcher unavailable. No successful launch has been confirmed; check GitHub Actions before retrying.', request_id: requestId }, known ? e.status : 503);
  }
  const headers = new Headers(response.headers);
  headers.set('X-Request-ID',requestId);
  emitDiagnostic(request,response.status,started,requestId,env,failureCode);
  if (restricted(env) || !new URL(request.url).pathname.startsWith('/api/public/')) headers.set('Cache-Control', restricted(env) ? 'private, no-store' : 'no-store'); headers.set('Referrer-Policy', 'no-referrer'); headers.set('X-Content-Type-Options', 'nosniff');
  if (request.headers.get('Origin') === env.DASHBOARD_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', env.DASHBOARD_ORIGIN); headers.set('Vary', 'Origin');
    headers.set('Access-Control-Expose-Headers','X-Request-ID, Retry-After');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  return new Response(response.body, { status: response.status, headers });
} };
