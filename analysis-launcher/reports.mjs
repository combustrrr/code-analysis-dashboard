import {reportToken, invalidateReportToken} from './github-app.mjs';
import {resolveLimit} from './request-limits.mjs';
import {MAX_GITHUB_READ_RETRIES, sleep, retryAfterMs, secondaryRateLimit, transientReadStatus} from './github-retry.mjs';
const apiCache=new Map();
const projectConfigCache=new Map();
// Public reports are resolved through verified public repositories and managed releases.
const REPO = /^[\w.-]+\/[\w.-]+$/;
export function repositoryStoragePrefix(repository) {
  if (!REPO.test(repository || '')) throw new Error('Invalid repository');
  return `repositories/${repository.toLowerCase()}`;
}
export function reportStorageKey(repository, project, asset) {
  const base = `${repositoryStoragePrefix(repository)}/analysis-current-${project}`;
  return asset ? `${base}/${asset}` : `${base}.json`;
}// Current reports must be republished within this age budget (24h default;
// repository reconciliation republishes hourly). Manifests without a
// verifiable publication timestamp fail closed.
const DEFAULT_REPORT_AGE_MS = 24 * 60 * 60 * 1000;
class ReportFailure extends Error {
  constructor(message, status = 502, code = 'report_unavailable') { super(message); this.status = status; this.code = code; }
}
function publicationTime(manifest) {
  const stamp = manifest.checked_at || manifest.report_storage_history?.slice(-1)[0]?.at;
  const time = typeof stamp === 'string' ? Date.parse(stamp) : NaN;
  return Number.isFinite(time) ? time : null;
}
export function canonicalReportTarget(manifest) {
  if (!manifest || !Array.isArray(manifest.targets)) return null;
  const id = manifest.current_target_id;
  return (id && manifest.targets.find(target => target.id === id)) ||
    (id && manifest.targets.find(target => target.canonical_target_id === id)) ||
    (manifest.targets.length === 1 ? manifest.targets[0] : null);
}
export async function publicReports(request,env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['/api/public/manifest','/api/public/asset','/api/public/projects','/api/public/threat-report'].includes(url.pathname)) return null;
  const repository = url.searchParams.get('repository');
  const project = url.searchParams.get('project_id');
  if (!REPO.test(repository || '') || (url.pathname!=='/api/public/projects'&&!/^[1-9][0-9]*$/.test(project || ''))) return Response.json({error:'Invalid repository or project.'},{status:400});
  const headers = {Accept:'application/vnd.github+json','User-Agent':'code-analysis-reports'};
  async function mintToken() {
  try { return await reportToken(env, repository); }
    catch { throw new ReportFailure('GitHub App installation lookup failed; install the App on the execution repository and verify its private key.', 502, 'installation_lookup_failed'); }
  }
  async function github(path, retry = true) {
    const key=(env?.GITHUB_APP_ID||'public')+':'+path;
    const cached=apiCache.get(key);if(cached&&cached.until>Date.now())return cached.value;
    for (let attempt = 0; ; attempt++) {
      const response = await fetch('https://api.github.com/'+path,{headers});
      const secondary = await secondaryRateLimit(response);
      if (response.ok) {
        const value=await response.json();
        if(JSON.stringify(value).length<100000){apiCache.set(key,{value,until:Date.now()+30000});if(apiCache.size>32)apiCache.delete(apiCache.keys().next().value);}
        return value;
      }
      if (secondary || transientReadStatus(response.status)) {
        if (attempt < MAX_GITHUB_READ_RETRIES) { await sleep(retryAfterMs(response)); continue; }
      }
      if(retry && headers.Authorization && (response.status===401 || (response.status===403 && !secondary))) {
        // The cached installation token was rejected (revoked or re-scoped).
        // Drop it, mint a fresh token, and retry exactly once.
        invalidateReportToken(env, repository);
        const fresh = await mintToken();
        if(fresh)headers.Authorization=`Bearer ${fresh}`;
        return github(path, false);
      }
      if(response.status===401) throw new ReportFailure('Report access was rejected by GitHub; review the GitHub App installation.',502,'report_access_rejected');
      if(response.status===403) throw new ReportFailure('Report access is forbidden; check the GitHub App installation, repository access, and API rate limits.',502,'report_access_forbidden');
      throw new ReportFailure('Current report is unavailable; GitHub may be rate limited.',502,'report_unavailable');
    }
  }
  async function projectConfig(repo) {
    const cacheKey=`${repository.toLowerCase()}:${repo.default_branch}`;
    const cached=projectConfigCache.get(cacheKey);
    if(cached&&cached.until>Date.now()) return cached.value;
    const file = await github(`repos/${repository}/contents/.github/code-analysis/projects.json?ref=${encodeURIComponent(repo.default_branch)}`);
    const config = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
    if(config.execution_repository?.id!==repo.id || !Array.isArray(config.projects)) throw new Error('Project configuration identity mismatch.');
    projectConfigCache.set(cacheKey,{value:config,until:Date.now()+30000});
    return config;
  }
  try {
    const token=await mintToken();if(token)headers.Authorization=`Bearer ${token}`;
    const repo = await github('repos/'+repository);
    if(repo.private) return Response.json({error:'Private reports are not supported.'},{status:403});
    if(url.pathname==='/api/public/projects') {
      const config=await projectConfig(repo);
      return Response.json({projects:config.projects.map(p=>({id:p.id,source_repository:p.source_repository.full_name,relationship:p.relationship,preferred_branch:p.preferred_branch}))},{headers:{'Cache-Control':'public, max-age=30'}});
    }
    const config=await projectConfig(repo);
    if(!config.projects.some(p=>String(p.id)===project)) return Response.json({error:'Report project is unavailable.'},{status:404,headers:{'Cache-Control':'no-store'}});
    
    if (!env.ANALYSIS_REPORTS) throw new ReportFailure('Storage binding not configured.', 500, 'storage_not_configured');
    let manifestObj = await env.ANALYSIS_REPORTS.get(reportStorageKey(repo.full_name, project));
    if (!manifestObj || typeof manifestObj.json !== 'function') manifestObj = await env.ANALYSIS_REPORTS.get(`analysis-current-${project}.json`);
    if (!manifestObj) throw new ReportFailure('Report not found in storage.', 502, 'report_not_found');
    const manifest = await manifestObj.json();
    if(manifest.schema_version !== 'analysis-current-v1' || manifest.project_id !== project || manifest.analysis_repository?.toLowerCase() !== repo.full_name.toLowerCase()) throw new ReportFailure('Report identity could not be verified.', 502, 'report_identity');
    // Freshness/expiry: never serve a stale or undated manifest as the current report.
    const maxAge = resolveLimit(env.MAX_REPORT_AGE_MS, DEFAULT_REPORT_AGE_MS);
    const published = publicationTime(manifest);
    if (published === null || Date.now() - published > maxAge) {
      const reason = published === null
        ? 'Current report freshness cannot be verified; rerun analysis to republish the manifest.'
        : 'Current report has expired; rerun analysis to publish a fresh report.';
      return Response.json({error:reason, expired:true, checked_at:manifest.checked_at||null}, {status:410, headers:{'Cache-Control':'no-store'}});
    }
    if(url.pathname.endsWith('/manifest')) return Response.json(manifest,{headers:{'Cache-Control':'public, max-age=60'}});

    if(url.pathname.endsWith('/threat-report')) {
      const targetId=url.searchParams.get('target_id');
      const target=canonicalReportTarget(manifest);
      if(!target || (targetId !== target.id && targetId !== target.original_target_id)) return Response.json({error:'Selected report target is unavailable.'},{status:404});
      if(target.documents?.['threat-report.json']) return Response.json({error:'Stored threat report must be fetched as a verified asset.'},{status:409});
      return Response.json({error:'Threat Report unavailable; an immutable stored report asset has not been published. Rerun analysis.'},{status:404,headers:{'Cache-Control':'no-store'}});
    }
    
    const name = url.searchParams.get('asset');
    const target=canonicalReportTarget(manifest);
    if(!target || !/^analysis-[a-f0-9]{64}\.json\.gz$/.test(name || '') || !target.assets?.[name]) return Response.json({error:'Asset is not part of the current report.'},{status:404});
    
    let assetObj = await env.ANALYSIS_REPORTS.get(reportStorageKey(repo.full_name, project, name));
    if(!assetObj) throw new ReportFailure('Report asset missing or exceeds the delivery limit.', 502, 'report_asset_missing');
    return new Response(assetObj.body,{headers:{'Content-Type':'application/gzip','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  } catch(error) {
    // Raw upstream or storage error text is never echoed; classify instead.
    const failure=error instanceof ReportFailure ? error : new ReportFailure('Report is temporarily unavailable; rerun analysis if the problem persists.', 502, 'report_unavailable');
    return Response.json({error:failure.message, code:failure.code}, {status:failure.status, headers:{'Cache-Control':'no-store'}});
  }
}
