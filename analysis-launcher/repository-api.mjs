import {readBody, BodyLimitError, resolveLimit, DEFAULT_LIMITS} from './request-limits.mjs';
import {canonicalReportTarget, publicReports} from './reports.mjs';
import {validatePortableProfile} from './profile-policy.mjs';
import {CONFIGURED_TARGETS, EXECUTION_REPOSITORY, EXECUTION_REPOSITORY_ID, SUPPORTED_SCANNERS, validateTargetRegistry} from './target-registry.mjs';

const CONFIG = '.github/code-analysis/projects.json';
const SHA = /^[a-f0-9]{40}$/i;

function evaluationEnabled(env, repository) {
  return String(env.EVALUATION_MODE).toLowerCase() === 'true' &&
    (!env.EVALUATION_SOURCE_REPOSITORY || env.EVALUATION_SOURCE_REPOSITORY.toLowerCase() === repository.toLowerCase());
}

function evaluationRequestId(value) {
  const hash = value.replace(/^evaluation-v1:/, '').toLowerCase().replace(/[^a-f0-9]/g, '').padEnd(32, '0').slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}

async function evaluationDigest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function repositoryApi(request, env, session, helpers) {
  const {github, json, Failure, pages, serviceToken} = helpers;
  const url = new URL(request.url);
  const token = session?.token;
  const requestedRepository = url.searchParams.get('repository');
  if (requestedRepository && requestedRepository.toLowerCase() !== EXECUTION_REPOSITORY.toLowerCase()) throw new Failure(400, 'Routes are bound to the configured execution repository.', 'repository_not_configurable');

  async function executionRepository(permission = 'pull') {
    const repository = await github(`repos/${env.ANALYSIS_REPOSITORY}`, token);
    if (repository.id !== EXECUTION_REPOSITORY_ID || repository.full_name?.toLowerCase() !== EXECUTION_REPOSITORY.toLowerCase() || Number(env.ANALYSIS_REPOSITORY_ID) !== EXECUTION_REPOSITORY_ID) {
      throw new Failure(409, 'Configured execution repository identity mismatch.', 'repository_identity');
    }
    if (!repository.permissions?.[permission]) {
      const code = permission === 'admin' ? 'repository_admin_required' : permission === 'push' ? 'repository_write_required' : 'repository_read_required';
      const message = permission === 'admin' ? 'Repository administration access is required for configuration changes.' : permission === 'push' ? 'Write access is required to launch analysis.' : 'Read access is required to view configured targets.';
      throw new Failure(403, message, code);
    }
    return repository;
  }

  async function context(permission = 'pull') {
    const repository = await executionRepository(permission);
    const appToken = await serviceToken();
    if (!appToken) throw new Failure(503, 'The central GitHub App installation is unavailable.', 'service_installation_unavailable');
    const file = await github(`repos/${repository.full_name}/contents/${CONFIG}?ref=${encodeURIComponent(repository.default_branch)}`, appToken);
    let configuration;
    try {
      const bytes = Uint8Array.from(atob(String(file.content || '').replace(/\s/g, '')), character => character.charCodeAt(0));
      configuration = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Failure(503, 'The configured target registry is unavailable.', 'target_registry_invalid');
    }
    if (!validateTargetRegistry(configuration, repository)) throw new Failure(503, 'The configured target registry does not match the approved project identities.', 'target_registry_invalid');
    return {repository, configuration, appToken};
  }

  async function projectFor(configuration, id) {
    const project = configuration.projects.find(value => String(value.id) === String(id));
    if (!project || !CONFIGURED_TARGETS.some(value => value.id === String(id))) throw new Failure(404, 'Configured project is unavailable.', 'project_unavailable');
    try { validatePortableProfile(project.profile); }
    catch { throw new Failure(503, 'The configured project profile is invalid.', 'project_profile_invalid'); }
    let source;
    try { source = await github(`repos/${project.source_repository.full_name}`, token); }
    catch (error) {
      if (error instanceof Failure && error.status === 404) throw new Failure(409, 'Configured project identity changed or is unavailable.', 'project_identity');
      throw error;
    }
    if (source.id !== project.source_repository.id || source.private || source.full_name?.toLowerCase() !== project.source_repository.full_name.toLowerCase()) throw new Failure(409, 'Configured project identity changed or is unavailable.', 'project_identity');
    return {project, source};
  }

  async function requestBody() {
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new Failure(415, 'JSON required.', 'unsupported_media_type');
    let bytes;
    try { bytes = await readBody(request, resolveLimit(env.MAX_LAUNCH_BYTES, DEFAULT_LIMITS.launch)); }
    catch (error) {
      if (error instanceof BodyLimitError) throw new Failure(413, error.message, 'request_too_large');
      throw error;
    }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Failure(400, 'Invalid JSON.', 'invalid_json'); }
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const {repository, configuration} = await context();
    const verified = await Promise.all(configuration.projects.map(project => projectFor(configuration, project.id)));
    return json({
      execution_repository: {id:repository.id, full_name:repository.full_name},
      can_launch: repository.permissions.push === true,
      can_configure: repository.permissions.admin === true,
      projects: verified.map(({project}) => ({
        id: String(project.id),
        source_repository: project.source_repository.full_name,
        source_repository_id: project.source_repository.id,
        relationship: project.relationship,
        preferred_branch: project.preferred_branch,
        native_feedback_enabled: project.native_feedback_enabled === true,
      })),
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/project-identity') {
    const {configuration} = await context();
    const {project,source} = await projectFor(configuration,url.searchParams.get('project_id'));
    return json({project_id:String(project.id),source_repository_id:source.id});
  }

  if (request.method === 'GET' && ['/api/project-readiness', '/api/project-integration', '/api/project-targets', '/api/project-activity'].includes(url.pathname)) {
    const {repository, configuration, appToken} = await context();
    const {project, source} = await projectFor(configuration, url.searchParams.get('project_id'));

    if (url.pathname === '/api/project-readiness') {
      const portable = new Set(['semgrep','gitleaks','trivy','checkov','osv','snyk','sonarqube-cloud','openssf-scorecard','github-secret-protection-posture','github-actions-security','coderabbit-ai-advisory']);
      if (project.profile.python_root) ['bandit','ruff','radon','xenon','vulture','codeql'].forEach(channel => portable.add(channel));
      if (project.profile.javascript_root) portable.add('codeql');
      Object.keys(project.profile.commands || {}).forEach(channel => portable.add(channel));
      const channels = [...new Set([...project.enabled_scanners, ...Object.keys(project.deferred_channels || {})])].map(channel => {
        const reason = project.deferred_channels?.[channel];
        const supported = SUPPORTED_SCANNERS.includes(channel);
        const status = reason ? 'deferred' : !supported || (project.profile.mode === 'portable' && !portable.has(channel)) ? 'setup_required' : 'configured';
        return {channel, status, reason:reason || (!supported ? 'No registered adapter in this tooling revision.' : status === 'setup_required' ? 'Requires a reviewed language or vendor execution profile.' : 'Configured for execution; completed evidence is still required.')};
      });
      return json({project_id:project.id,preferred_branch:project.preferred_branch,tooling_sha:configuration.tooling_sha,channels,checked_at:new Date().toISOString()});
    }

    if (url.pathname === '/api/project-integration') {
      const workflows = await Promise.all(['code-analysis-reconcile.yml','code-analysis-source.yml'].map(name => github(`repos/${repository.full_name}/actions/workflows/${name}`, appToken)));
      const reportUrl = new URL('/api/public/manifest', url);
      reportUrl.search = new URLSearchParams({repository:repository.full_name, project_id:project.id});
      let storage = {compressed_bytes:null,remaining_bytes:null,history_points:0};
      try {
        const response = await publicReports(new Request(reportUrl), env);
        if (response.ok) {
          const manifest = await response.json();
          const used = Number(manifest?.metrics?.compressed_bytes || 0);
          const budget = Number(project.report_budget_bytes || 0);
          storage = {compressed_bytes:used || 0,remaining_bytes:(budget && used) ? Math.max(0,budget-used) : null,history_points:Array.isArray(manifest?.report_storage_history) ? manifest.report_storage_history.length : 0};
        }
      } catch {}
      return json({source_repository:source.full_name,analysis_repository:repository.full_name,publishing_repository:repository.full_name,workflow_branch:repository.default_branch,workflow_state:workflows.map(workflow=>`${workflow.name}: ${workflow.state}`).join('; '),configuration_matches:true,ready:workflows.every(workflow=>workflow.state==='active'),enabled_scanners:project.enabled_scanners,checked_at:new Date().toISOString(),report_budget_bytes:project.report_budget_bytes,report_storage:storage,storage_backend:'cloudflare-r2'});
    }

    if (url.pathname === '/api/project-targets') {
      const [branches, prs] = await Promise.all([pages(`repos/${source.full_name}/branches`, token), pages(`repos/${source.full_name}/pulls?state=open`, token)]);
      if (prs.some(value => !value.head.repo)) throw new Failure(502, 'PR inventory is incomplete.', 'inventory_incomplete');
      return json({repository:source.full_name,project_id:project.id,checked_at:new Date().toISOString(),branches:branches.map(value=>({name:value.name,sha:value.commit.sha})),prs:prs.map(value=>({number:value.number,title:String(value.title||''),head_branch:String(value.head.ref||''),head_sha:value.head.sha,head_repository:value.head.repo.full_name,base_sha:value.base.sha,base_branch:value.base.ref}))});
    }

    const id = url.searchParams.get('request_id');
    if (!/^[a-f0-9-]{36}$/.test(id || '')) throw new Failure(400, 'Choose a project and request.', 'invalid_request');
    const reportUrl = new URL('/api/public/manifest', url);
    reportUrl.search = new URLSearchParams({repository:repository.full_name,project_id:project.id});
    const response = await publicReports(new Request(reportUrl), env);
    if (!response.ok) return json({phase:'queued',request_id:id,checked_at:new Date().toISOString(),publication_status:'unavailable',message:'Request is queued successfully. Publication status is temporarily unavailable; the request remains retained.'},202);
    const manifest = await response.json();
    const receipt = manifest.requests?.find(row => row.request_id === id);
    const canonical = canonicalReportTarget(manifest);
    let row = canonical && (canonical.client_request_id === id || canonical.request_id === id) ? canonical : null;
    if (!row) {
      const recent = Array.isArray(manifest.recent_runs) ? manifest.recent_runs.find(run => run.client_request_id === id || run.request_id === id) : null;
      if (recent && canonical && recent.analyzed_sha === canonical.analyzed_sha && recent.original_target_id === canonical.original_target_id) row = {...canonical,...recent};
      else if (receipt || recent) return json({phase:'superseded',source_sha:receipt?.head_sha || recent?.head_sha,request_id:id,checked_at:new Date().toISOString()});
    }
    if (!row) return json({phase:'queued',request_id:id,checked_at:new Date().toISOString()});
    const result = {request_id:id,target_id:row.id,source_sha:row.head_sha,analyzed_sha:row.analyzed_sha,phase:'queued',checked_at:new Date().toISOString()};
    if (row.scan_run_id) {
      const run = await github(`repos/${repository.full_name}/actions/runs/${row.scan_run_id}/attempts/${row.run_attempt}`, appToken);
      if (run.head_sha !== row.execution_sha) throw new Failure(409, 'Producer revision does not match the request.', 'producer_mismatch');
      result.producer = {run_id:row.scan_run_id,attempt:row.run_attempt,status:run.status,conclusion:run.conclusion,url:`https://github.com/${repository.full_name}/actions/runs/${row.scan_run_id}/attempts/${row.run_attempt}`};
      result.phase = run.status === 'completed' ? 'publishing' : 'scanning';
      if (row.collected_run === `${row.scan_run_id}-${row.run_attempt}` && row.analyzed_sha === row.head_sha) {result.phase='published';result.completeness=row.report_status;}
    }
    if (row.error) {result.phase='failed';result.error=row.error;}
    return json(result,200,{'Cache-Control':'private, max-age=5, stale-while-revalidate=15'});
  }

  if (request.method === 'GET' && /^\/api\/project-runs\/[1-9][0-9]*$/.test(url.pathname)) {
    const {repository,appToken} = await context();
    const run = await github(`repos/${repository.full_name}/actions/runs/${url.pathname.split('/').at(-1)}`, appToken);
    if (!['.github/workflows/code-analysis-reconcile.yml','.github/workflows/code-analysis-source.yml'].includes(run.path?.split('@')[0])) throw new Failure(404, 'Not an application analysis run.', 'not_found');
    return json({run_id:run.id,status:run.status,conclusion:run.conclusion,attempt:run.run_attempt,checked_at:new Date().toISOString()});
  }

  if (request.method === 'POST' && url.pathname === '/api/project-launch') {
    const input = await requestBody();
    const {repository,configuration} = await context('push');
    const {project,source} = await projectFor(configuration,input.project_id);
    if (!['branch','pr','commit'].includes(input.kind) || typeof input.ref !== 'string' || !input.ref || input.ref.length > 255) throw new Failure(400, 'Choose a configured project and revision.', 'invalid_selection');
    if (input.kind === 'commit' && !SHA.test(input.ref)) throw new Failure(400, 'Full commit SHA required.', 'invalid_selection');
    if (input.kind === 'pr' && !/^[1-9][0-9]*$/.test(input.ref)) throw new Failure(400, 'PR number required.', 'invalid_selection');
    const path = input.kind === 'branch' ? 'branches' : input.kind === 'pr' ? 'pulls' : 'commits';
    const resolved = await github(`repos/${source.full_name}/${path}/${encodeURIComponent(input.ref)}`, token);
    const evaluation = evaluationEnabled(env, source.full_name);
    const targetSha = input.kind === 'branch' ? resolved.commit?.sha : input.kind === 'pr' ? resolved.head?.sha : input.ref;
    if (evaluation && input.kind !== 'branch') throw new Failure(409, 'Evaluation mode accepts only the configured frozen branch.', 'evaluation_frozen');
    if (evaluation && input.ref !== (env.EVALUATION_TARGET_BRANCH || 'Testing')) throw new Failure(409, 'Evaluation mode accepts only the configured frozen branch.', 'evaluation_frozen');
    if (evaluation && (!SHA.test(targetSha || '') || (env.EVALUATION_TARGET_SHA && env.EVALUATION_TARGET_SHA !== targetSha))) throw new Failure(409, 'Evaluation target SHA is missing or has moved.', 'evaluation_frozen');
    const scannerProfile = {enabled_scanners:[...project.enabled_scanners].sort(),deferred_channels:project.deferred_channels || {},profile:project.profile || {}};
    const scannerProfileDigest = await evaluationDigest(scannerProfile);
    const evaluationKey = evaluation ? `evaluation-v1:${source.full_name}:${targetSha}:${configuration.tooling_sha}:${scannerProfileDigest}` : null;
    const stateKey = evaluation ? `evaluation:v1:${source.full_name.toLowerCase()}` : null;
    let evaluationState = evaluation && env.ANALYSIS_STATE ? await env.ANALYSIS_STATE.get(stateKey,'json') : null;
    if (evaluation) {
      evaluationState = evaluationState || {evaluation_mode:true,evaluation_target_sha:targetSha,evaluation_dispatches_used:0,evaluation_paused:String(env.EVALUATION_PAUSED).toLowerCase()==='true'};
      if (evaluationState.evaluation_target_sha && evaluationState.evaluation_target_sha !== targetSha) throw new Failure(409, 'Evaluation target SHA is frozen; refusing a moving target.', 'evaluation_frozen');
      if (evaluationState.evaluation_paused) throw new Failure(423, 'Evaluation is paused by an operator.', 'evaluation_paused');
      if (evaluationState.evaluation_idempotency_key === evaluationKey && evaluationState.evaluation_request_id) return json({status:'queued',request_id:evaluationState.evaluation_request_id,run_id:null,repository:repository.full_name,warning:'This deterministic evaluation request is already persisted.'},202);
      if (Number(evaluationState.evaluation_dispatches_used || 0) >= 1) throw new Failure(429, 'Evaluation dispatch budget is exhausted; operator reset required.', 'evaluation_budget');
    }
    const requestId = evaluation ? evaluationRequestId(evaluationKey) : crypto.randomUUID();
    const releases = await pages(`repos/${repository.full_name}/releases`,token);
    let queue = releases.find(value => value.tag_name === 'analysis-requests');
    if (!queue) {
      try {queue = await github(`repos/${repository.full_name}/releases`,token,{method:'POST',body:JSON.stringify({tag_name:'analysis-requests',name:'Analysis request queue',body:'Durable pending analysis requests. Processed entries are removed.',make_latest:'false'})});}
      catch {queue=(await pages(`repos/${repository.full_name}/releases`,token)).find(value=>value.tag_name==='analysis-requests');if(!queue)throw new Failure(502,'Could not persist the analysis request.','persistence_failed');}
    }
    const pending = await pages(`repos/${repository.full_name}/releases/${queue.id}/assets`,token);
    if (pending.filter(asset=>asset.name.startsWith('request-')).length>=100) throw new Failure(429,'This repository has 100 pending requests. Wait for reconciliation before submitting another.','queue_full');
    if (pending.some(asset=>asset.name===`request-${requestId}.json`)) return json({status:'queued',request_id:requestId,run_id:null,repository:repository.full_name,warning:'This deterministic analysis request is already persisted and awaiting reconciliation.'},202);
    const actor = await github('user',token);
    const selection = {repository:source.full_name,kind:evaluation?'commit':input.kind,ref:evaluation?targetSha:input.ref};
    const intent = {schema_version:'analysis-request-v1',request_id:requestId,execution_repository_id:repository.id,project_id:project.id,selection,requested_selection:evaluation?{kind:input.kind,ref:input.ref}:undefined,target_sha:targetSha,idempotency_key:evaluationKey,actor_id:actor.id,created_at:new Date().toISOString()};
    const saved = await fetch(`https://uploads.github.com/repos/${repository.full_name}/releases/${queue.id}/assets?name=request-${requestId}.json`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','User-Agent':'code-analysis-application'},body:JSON.stringify(intent)});
    if (!saved.ok) throw new Failure(502,'Could not persist the analysis request; no scan was confirmed.','persistence_failed');
    if (evaluation && env.ANALYSIS_STATE) {evaluationState={...evaluationState,evaluation_mode:true,evaluation_target_sha:targetSha,evaluation_dispatches_used:1,evaluation_idempotency_key:evaluationKey,evaluation_request_id:requestId,evaluation_status:'dispatching'};await env.ANALYSIS_STATE.put(stateKey,JSON.stringify(evaluationState));}
    let result;
    try {result=await github(`repos/${repository.full_name}/actions/workflows/code-analysis-reconcile.yml/dispatches`,token,{method:'POST',body:JSON.stringify({ref:repository.default_branch,return_run_details:true,inputs:{project_id:project.id,selection:JSON.stringify(selection),request_id:requestId}})});}
    catch {return json({status:'queued',request_id:requestId,run_id:null,repository:repository.full_name,warning:'Request saved. Immediate dispatch failed; repository reconciliation will recover it.'},202);}
    return json({status:'submitted',request_id:requestId,run_id:result?.workflow_run_id||null,repository:repository.full_name},202);
  }

  if (request.method === 'POST' && ['/api/connections/preview','/api/connections/install','/api/projects/preview'].includes(url.pathname)) {
    await executionRepository('admin');
    throw new Failure(409, 'Project profiles are managed in the trusted execution-repository registry.', 'configuration_managed');
  }
  return null;
}
