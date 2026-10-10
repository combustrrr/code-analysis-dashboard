import {publicReports} from './reports.mjs';
import {readBody, BodyLimitError, resolveLimit, DEFAULT_LIMITS} from './request-limits.mjs';
import {detectedProfile, validatePortableProfile} from './profile-policy.mjs';
export {detectedProfile, validatePortableProfile} from './profile-policy.mjs';
// Repository application API. No source code is executed by the Worker.
const PROTECTED = 'arydestroyer/kavach-agenticsoc';
const readOnly = repo => [1267340546,1278177697].includes(repo.id) || [PROTECTED,'combustrrr/agentic-kibana'].includes(repo.full_name?.toLowerCase());
const REPO = /^[\w.-]+\/[\w.-]+$/;
const SHA = /^[a-f0-9]{40}$/;
const CONFIG = '.github/code-analysis/projects.json';
const SCANNERS = ['atheris','bandit','checkov','codeql','coderabbit-ai-advisory','coverage','eslint','github-actions-security','github-secret-protection-posture','gitleaks','hadolint','openssf-scorecard','osv','pyright','radon','ruff','sbom-license-provenance','schemathesis','semgrep','shipping-image-cves','snyk','sonarqube-cloud','trivy','typescript','vulture','xenon'];
const encode = value => btoa(String.fromCharCode(...new TextEncoder().encode(value)));
const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)));
const evaluationEnabled = (env, source) => String(env.EVALUATION_MODE).toLowerCase() === 'true' && source.toLowerCase() === String(env.EVALUATION_SOURCE_REPOSITORY || 'ARYDESTROYER/Kavach-AgenticSOC').toLowerCase();
const hex = bytes => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
async function evaluationDigest(value) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))); }
function evaluationRequestId(value) { const hash = value.replace(/^evaluation-v1:/, '').toLowerCase().replace(/[^a-f0-9]/g, '').padEnd(32, '0').slice(0, 32); return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`; }

export function wrappers(toolingRepository, sha) {
  if (!REPO.test(toolingRepository) || !SHA.test(sha)) throw new Error('Immutable shared tooling required');
  return {
    '.github/workflows/code-analysis-reconcile.yml': `name: Code analysis reconciliation
on:
  workflow_dispatch:
    inputs:
      project_id:
        type: string
        required: false
      selection:
        type: string
        required: false
      request_id:
        type: string
        required: false
  workflow_run:
    workflows: ['Code analysis source']
    types: [completed]
  schedule:
    - cron: '23 * * * *'
permissions:
  contents: read
concurrency:
  group: code-analysis-reconciliation
  cancel-in-progress: false
jobs:
  reconcile:
    permissions:
      contents: write
      actions: write
      checks: write
      security-events: write
    uses: ${toolingRepository}/.github/workflows/reusable-reconcile.yml@${sha}
    with:
      tooling_sha: ${sha}
      project_id: \${{ inputs.project_id || '' }}
      selection: \${{ inputs.selection || '' }}
      request_id: \${{ inputs.request_id || '' }}
`,
    '.github/workflows/code-analysis-source.yml': `name: Code analysis source
run-name: Source analysis \${{ inputs.request_id }}
on:
  workflow_dispatch:
    inputs:
      target:
        type: string
        required: true
      tooling_sha:
        type: string
        required: true
      request_id:
        type: string
        required: true
permissions:
  contents: read
jobs:
  analyze:
    if: \${{ fromJSON(inputs.target).profile_mode == 'portable' }}
    permissions:
      contents: read
      actions: read
    uses: ${toolingRepository}/.github/workflows/reusable-source.yml@${sha}
    with:
      tooling_sha: ${sha}
      target: \${{ inputs.target }}
      request_id: \${{ inputs.request_id }}
  configured-profile:
    if: \${{ fromJSON(inputs.target).profile_mode == 'agentic-soc' }}
    permissions:
      contents: read
      actions: read
    uses: ${toolingRepository}/.github/workflows/reusable-source-full.yml@${sha}
    with:
      tooling_sha: ${sha}
      target: \${{ inputs.target }}
      request_id: \${{ inputs.request_id }}
    secrets:
      SECURITY_POSTURE_TOKEN: \${{ secrets.SECURITY_POSTURE_TOKEN }}
      SNYK_TOKEN: \${{ secrets.SNYK_TOKEN }}
      SONAR_API_TOKEN: \${{ secrets.SONAR_API_TOKEN }}
      SONAR_TOKEN: \${{ secrets.SONAR_TOKEN }}
`,
  };
}

export async function applicationApi(request, env, session, helpers) {
  const {github, json, Failure, seal, unseal} = helpers;
  const url = new URL(request.url);
  const token = session?.token;
  async function publicRepository(name) {
    if (!REPO.test(name || '')) throw new Failure(400, 'Use owner/repository.', 'invalid_repository');
    const repo = await github(`repos/${name}`, token);
    if (repo.private) throw new Failure(403, 'Only public repositories are supported.', 'repository_not_public');
    return repo;
  }
  async function installation(repo, admin = false) {
    if (readOnly(repo)) throw new Failure(403, 'This upstream repository is protected and read-only.', 'repository_protected');
    if (!(admin ? repo.permissions?.admin : repo.permissions?.push)) throw new Failure(403, admin ? 'Repository administration access required.' : 'Repository write access required.', 'repository_access_required');
    // User-token installation enumeration also proves this App is installed here.
    for (let page = 1; page <= 20; page++) {
      const installs = await github(`user/installations?per_page=100&page=${page}`, token);
      for (const item of installs.installations || []) {
        for (let rp = 1; rp <= 20; rp++) {
          const list = await github(`user/installations/${item.id}/repositories?per_page=100&page=${rp}`, token);
          if ((list.repositories || []).some(r => r.id === repo.id)) return item.id;
          if ((list.repositories || []).length < 100) break;
          if (rp === 20) throw new Failure(422, 'Installation inventory exceeds supported pagination.', 'pagination_limit');
        }
      }
      if ((installs.installations || []).length < 100) break;
      if (page === 20) throw new Failure(422, 'Installation inventory exceeds supported pagination.', 'pagination_limit');
    }
    throw new Failure(403, 'Install the GitHub App on this execution repository.', 'installation_required');
  }
  async function config(repo) {
    const file = await github(`repos/${repo.full_name}/contents/${CONFIG}?ref=${encodeURIComponent(repo.default_branch)}`, token);
    const value = JSON.parse(decode(file.content));
    if (value.schema_version !== 'analysis-projects-v1' || value.execution_repository?.id !== repo.id) throw new Failure(409, 'Repository configuration identity mismatch.', 'configuration_identity');
    return value;
  }
  async function body() {
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new Failure(415, 'JSON required.', 'unsupported_media_type');
    // Guardrail: bound every application API JSON body to a fixed budget.
    let bytes;
    try { bytes = await readBody(request, resolveLimit(env.MAX_APPLICATION_JSON_BYTES, DEFAULT_LIMITS.applicationJson)); }
    catch (error) {
      if (error instanceof BodyLimitError) throw new Failure(413, error.message, 'request_too_large');
      throw error;
    }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Failure(400, 'Invalid JSON.', 'invalid_json'); }
  }
  const identity = repo => ({id: repo.id, full_name: repo.full_name, private: false});
  if (request.method === 'GET' && url.pathname === '/api/repositories') {
    const page = Number(url.searchParams.get('page') || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100) throw new Failure(400, 'Invalid page.', 'invalid_request');
    const rows = await github(`user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=${page}`, token);
    return json({repositories: rows.filter(r => !r.private && r.permissions?.push && !readOnly(r)).map(r => ({...identity(r), default_branch:r.default_branch, can_configure:!!r.permissions?.admin})), page, has_more:rows.length===100});
  }
  if (request.method === 'POST' && url.pathname === '/api/connections/preview') {
    const input = await body();
    const execution = await publicRepository(input.execution_repository);
    await installation(execution, true);
    const source = await publicRepository(input.source_repository || execution.full_name);
    const ref = await github(`repos/${execution.full_name}/git/ref/heads/${encodeURIComponent(execution.default_branch)}`, token);
    const commit = await github(`repos/${execution.full_name}/git/commits/${ref.object.sha}`, token);
    const tree = await github(`repos/${execution.full_name}/git/trees/${commit.tree.sha}?recursive=1`, token);
    const sourceTree = source.id === execution.id ? tree : await github(`repos/${source.full_name}/git/trees/${encodeURIComponent(source.default_branch)}?recursive=1`, token);
    if (tree.truncated || sourceTree.truncated) throw new Failure(422, 'Repository inventory is incomplete; manual profile setup is required.', 'inventory_incomplete');
    const found = detectedProfile(sourceTree.tree.filter(x => x.type === 'blob').map(x => x.path));
    const tooling = env.TOOLING_FROM_SERVICE === 'true' ? (await config(await publicRepository(env.ANALYSIS_REPOSITORY))).tooling_sha : env.TOOLING_SHA;
    if(!SHA.test(tooling||''))throw new Failure(503, 'Validated tooling revision unavailable.', 'tooling_unavailable');
    const files = wrappers(env.ANALYSIS_REPOSITORY, tooling);
    let document = {schema_version:'analysis-projects-v1', execution_repository:identity(execution), tooling_sha:tooling, max_parallel_analyses:2, projects:[]};
    if (tree.tree.some(x => x.path === CONFIG)) document = await config(execution);
    if (document.projects.some(p => p.id === String(source.id))) throw new Failure(409, 'This source project is already connected.', 'already_connected');
    const project = {id:String(source.id), source_repository:identity(source), relationship:source.id === execution.id ? 'connected':'observer', preferred_branch:source.default_branch, profile:found.profile, enabled_scanners:SCANNERS, deferred_channels:{}, report_budget_bytes:900000000};
    document.projects.push(project);
    document.tooling_sha = tooling;
    files[CONFIG] = JSON.stringify(document, null, 2) + '\n';
    // Existing managed wrappers may be updated; unknown files are never overwritten.
    for (const path of Object.keys(files).filter(p => p !== CONFIG)) {
      if (tree.tree.some(x => x.path === path)) {
        const old = await github(`repos/${execution.full_name}/contents/${path}?ref=${ref.object.sha}`, token);
        if (!decode(old.content).includes(`${env.ANALYSIS_REPOSITORY}/.github/workflows/reusable-`)) throw new Failure(409, `Existing workflow ${path} is not managed by this application.`, 'unmanaged_workflow');
      }
    }
    const user = await github('user', token);
    const preview = {type:'installation', exp:Date.now()+600000, actor:user.id, repository:execution.full_name, repository_id:execution.id, branch:execution.default_branch, base:ref.object.sha, tree:commit.tree.sha, files};
    return json({execution_repository:identity(execution), project, detection:found, files, confirmation:await seal(preview, env.SESSION_KEY)});
  }
  if (request.method === 'POST' && url.pathname === '/api/projects/preview') {
    const input = await body();
    const repo = await publicRepository(input.repository); await installation(repo, true);
    const document = await config(repo);
    const project = document.projects.find(p => p.id === input.project_id);
    if (!project) throw new Failure(404, 'Unknown project.', 'unknown_project');
    const changes = input.changes;
    const allowed = ['preferred_branch','enabled_scanners','deferred_channels','report_budget_bytes','profile'];
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).some(k => !allowed.includes(k))) throw new Failure(400, 'Only branch, scanner selection, deferrals, profile and report budget can be edited here.', 'invalid_changes');
    const updated = {...project, ...changes};
    if(changes.profile){try{validatePortableProfile(changes.profile);}catch(e){throw new Failure(400,e.message,'invalid_profile');}}
    if (typeof updated.preferred_branch !== 'string' || !updated.preferred_branch.trim() || updated.preferred_branch.length > 255) throw new Failure(400, 'Preferred branch is required.', 'invalid_branch');
    if (!Array.isArray(updated.enabled_scanners) || updated.enabled_scanners.some(s => typeof s !== 'string' || !/^[a-z0-9-]+$/.test(s) || new Set(updated.enabled_scanners).size !== updated.enabled_scanners.length)) throw new Failure(400, 'Scanner IDs must be unique.', 'invalid_scanners');
    const deferred = updated.deferred_channels;
    if (!deferred || typeof deferred !== 'object' || Array.isArray(deferred) || Object.entries(deferred).some(([id,reason]) => !/^[a-z0-9-]+$/.test(id) || typeof reason !== 'string' || !reason.trim() || updated.enabled_scanners.includes(id))) throw new Failure(400, 'Every deferred scanner needs a reason and cannot also be enabled.', 'invalid_deferrals');
    if (!Number.isSafeInteger(updated.report_budget_bytes) || updated.report_budget_bytes < 1 || updated.report_budget_bytes > 900000000) throw new Failure(400, 'Report budget must be between 1 and 900000000 bytes.', 'invalid_budget');
    if (SCANNERS.some(id => !updated.enabled_scanners.includes(id) && !(id in deferred))) throw new Failure(400, 'Every registered scanner must be enabled or explicitly deferred.', 'invalid_scanners');
    const groups = [['eslint','typescript'],['shipping-image-cves','sbom-license-provenance'],['github-secret-protection-posture','github-actions-security'],['radon','xenon']];
    if (groups.some(ids => ids.some(id => updated.enabled_scanners.includes(id)) && !ids.every(id => updated.enabled_scanners.includes(id)))) throw new Failure(400, 'Scanners sharing a producer must be enabled or deferred together.', 'invalid_scanners');
    const source = await publicRepository(project.source_repository.full_name);
    if (source.id !== project.source_repository.id) throw new Failure(409, 'Source identity changed.', 'identity_changed');
    await github(`repos/${source.full_name}/branches/${encodeURIComponent(updated.preferred_branch)}`, token);
    const head = await github(`repos/${repo.full_name}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`, token);
    const commit = await github(`repos/${repo.full_name}/git/commits/${head.object.sha}`, token);
    // Bind the edited configuration to the same immutable tree used by the preview.
    const file = await github(`repos/${repo.full_name}/contents/${CONFIG}?ref=${head.object.sha}`, token);
    if (JSON.stringify(JSON.parse(decode(file.content))) !== JSON.stringify(document)) throw new Failure(409, 'Configuration changed. Review a fresh preview.', 'stale_configuration');
    document.projects = document.projects.map(p => p.id === project.id ? updated : p);
    const files = {[CONFIG]:JSON.stringify(document,null,2)+'\n'};
    const actor = await github('user',token);
    const preview = {type:'installation',exp:Date.now()+600000,actor:actor.id,repository:repo.full_name,repository_id:repo.id,branch:repo.default_branch,base:head.object.sha,tree:commit.tree.sha,files};
    return json({files,project:updated,confirmation:await seal(preview,env.SESSION_KEY)});
  }
  if (request.method === 'GET' && url.pathname === '/api/project-integration') {
    const repo = await publicRepository(url.searchParams.get('repository')); await installation(repo);
    const document = await config(repo);
    const project = document.projects.find(p => p.id === url.searchParams.get('project_id'));
    if (!project) throw new Failure(404,'Unknown project.','unknown_project');
    const source = await publicRepository(project.source_repository.full_name);
    const workflows = await Promise.all(['code-analysis-reconcile.yml','code-analysis-source.yml'].map(name=>github(`repos/${repo.full_name}/actions/workflows/${name}`,token)));
    const matches = source.id === project.source_repository.id;
    // Resolve current manifest to expose storage usage quietly in the Connections panel
    let storage={compressed_bytes:null,remaining_bytes:null,history_points:0};
    try {
      const u=new URL('/api/public/manifest',url);u.search=new URLSearchParams({repository:repo.full_name,project_id:project.id});
      const resp=await publicReports(new Request(u),env);
      if(resp.ok){const m=await resp.json();const used=Number(m?.metrics?.compressed_bytes||0);const budget=Number(project.report_budget_bytes||0);storage={compressed_bytes:used||0,remaining_bytes:(budget&&used)?Math.max(0,budget-used):null,history_points:Array.isArray(m?.report_storage_history)?m.report_storage_history.length:0};}
    } catch {}
    return json({source_repository:source.full_name,analysis_repository:repo.full_name,publishing_repository:repo.full_name,
      workflow_branch:repo.default_branch,workflow_state:workflows.map(w=>`${w.name}: ${w.state}`).join('; '),
      configuration_matches:matches,ready:matches && workflows.every(w=>w.state==='active'),enabled_scanners:project.enabled_scanners,checked_at:new Date().toISOString(),
      report_budget_bytes:project.report_budget_bytes, report_storage:storage, storage_backend:'cloudflare-r2'});
  }
  if (request.method === 'GET' && url.pathname === '/api/project-readiness') {
    const repo = await publicRepository(url.searchParams.get('repository')); await installation(repo);
    const document = await config(repo);
    const project = document.projects.find(p => p.id === url.searchParams.get('project_id'));
    if (!project) throw new Failure(404,'Unknown project.','unknown_project');
  const portable = new Set(['semgrep','gitleaks','trivy','checkov','osv','openssf-scorecard','github-secret-protection-posture','github-actions-security','coderabbit-ai-advisory']);
    if(project.profile.python_root)['bandit','ruff','radon','xenon','vulture','codeql'].forEach(c=>portable.add(c));
    if(project.profile.javascript_root)portable.add('codeql');
    Object.keys(project.profile.commands||{}).forEach(c=>portable.add(c));
    const channels = [...new Set([...project.enabled_scanners,...Object.keys(project.deferred_channels || {})])].map(channel => {
      const reason = project.deferred_channels?.[channel];
      const supported = SCANNERS.includes(channel);
      return {channel,status:reason?'deferred':!supported?'setup_required':project.profile.mode==='portable'&&!portable.has(channel)?'setup_required':'configured',reason:reason || (!supported?'No registered adapter in this tooling revision.':project.profile.mode==='portable'&&!portable.has(channel)?'Requires a reviewed language or vendor execution profile.':'Configured for execution; a completed report is required to confirm usable evidence.')};
    });
    return json({project_id:project.id,preferred_branch:project.preferred_branch,tooling_sha:document.tooling_sha,channels,checked_at:new Date().toISOString()});
  }
  if (request.method === 'POST' && url.pathname === '/api/connections/install') {
    const input = await body();
    const preview = await unseal(input.confirmation || '', env.SESSION_KEY, 'installation');
    const user = await github('user', token);
    if (user.id !== preview.actor || input.confirm !== true) throw new Failure(403, 'Explicit confirmation by the preview owner is required.', 'confirmation_required');
    const repo = await publicRepository(preview.repository);
    await installation(repo, true);
    if (repo.default_branch !== preview.branch) throw new Failure(409, 'Default branch changed. Review a fresh preview.', 'stale_preview');
    if (repo.id !== preview.repository_id) throw new Failure(409, 'Repository identity changed.', 'identity_changed');
    const head = await github(`repos/${repo.full_name}/git/ref/heads/${encodeURIComponent(preview.branch)}`, token);
    if (head.object.sha !== preview.base) throw new Failure(409, 'Default branch changed. Review a fresh preview.', 'stale_preview');
    const tree = await github(`repos/${repo.full_name}/git/trees`, token, {method:'POST', body:JSON.stringify({base_tree:preview.tree, tree:Object.entries(preview.files).map(([path,content]) => ({path, mode:'100644', type:'blob', content}))})});
    const commit = await github(`repos/${repo.full_name}/git/commits`, token, {method:'POST', body:JSON.stringify({message:'Configure repository-owned code analysis', tree:tree.sha, parents:[preview.base]})});
    await github(`repos/${repo.full_name}/git/refs/heads/${encodeURIComponent(preview.branch)}`, token, {method:'PATCH', body:JSON.stringify({sha:commit.sha, force:false})});
    return json({status:'installed', commit_sha:commit.sha, repository:repo.full_name, message:'Configuration installed. Verify Actions readiness before launching.'}, 201);
  }
  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const repo = await publicRepository(url.searchParams.get('repository'));
    await installation(repo);
    return json(await config(repo));
  }
  if (request.method === 'GET' && url.pathname === '/api/project-targets') {
    const repo = await publicRepository(url.searchParams.get('repository'));
    await installation(repo);
    const document = await config(repo);
    const project = document.projects.find(p => p.id === url.searchParams.get('project_id'));
    if (!project) throw new Failure(404,'Unknown project.','unknown_project');
    const source = await publicRepository(project.source_repository.full_name);
    if (source.id !== project.source_repository.id) throw new Failure(409, 'Source identity changed.','identity_changed');
    const branches = await helpers.pages(`repos/${source.full_name}/branches`, token);
    const prs = await helpers.pages(`repos/${source.full_name}/pulls?state=open`, token);
    if (prs.some(p => !p.head.repo)) throw new Failure(502, 'PR inventory is incomplete.','inventory_incomplete');
    return json({repository:source.full_name, checked_at:new Date().toISOString(), branches:branches.map(b=>({name:b.name,sha:b.commit.sha})), prs:prs.map(p=>({number:p.number,title:String(p.title||''),head_branch:String(p.head.ref||''),head_sha:p.head.sha,head_repository:p.head.repo.full_name,base_sha:p.base.sha,base_branch:p.base.ref}))});
  }
  if (request.method === 'POST' && url.pathname === '/api/project-launch') {
    const input = await body();
    const repo = await publicRepository(input.repository); await installation(repo);
    const document = await config(repo);
    const project = document.projects.find(p => p.id === input.project_id);
    if (!project || !['branch','pr','commit'].includes(input.kind) || typeof input.ref !== 'string' || !input.ref || input.ref.length > 255) throw new Failure(400, 'Choose a configured project and revision.', 'invalid_selection');
    if (input.kind === 'commit' && !SHA.test(input.ref)) throw new Failure(400, 'Full commit SHA required.', 'invalid_selection');
    if (input.kind === 'pr' && !/^[1-9][0-9]*$/.test(input.ref)) throw new Failure(400, 'PR number required.', 'invalid_selection');
    const source = await publicRepository(project.source_repository.full_name);
    if (source.id !== project.source_repository.id) throw new Failure(409, 'Source identity changed.', 'identity_changed');
    const path = input.kind === 'branch' ? 'branches' : input.kind === 'pr' ? 'pulls' : 'commits';
    const resolved = await github(`repos/${source.full_name}/${path}/${encodeURIComponent(input.ref)}`, token);
    const evaluation = evaluationEnabled(env, source.full_name);
    const targetSha = input.kind === 'branch' ? resolved.commit?.sha : input.kind === 'pr' ? resolved.head?.sha : input.ref;
    if (evaluation && input.kind !== 'branch') throw new Failure(409, 'Evaluation mode accepts only the configured frozen branch.', 'evaluation_frozen');
    if (evaluation && input.ref !== (env.EVALUATION_TARGET_BRANCH || 'Testing')) throw new Failure(409, 'Evaluation mode accepts only the configured frozen branch.', 'evaluation_frozen');
    if (evaluation && (!SHA.test(targetSha || '') || (env.EVALUATION_TARGET_SHA && env.EVALUATION_TARGET_SHA !== targetSha))) throw new Failure(409, 'Evaluation target SHA is missing or has moved.', 'evaluation_frozen');
    const scannerProfile = {enabled_scanners:[...(project.enabled_scanners || [])].sort(), deferred_channels:project.deferred_channels || {}, profile:project.profile || {}};
    const scannerProfileDigest = await evaluationDigest(scannerProfile);
    const evaluationKey = evaluation ? `evaluation-v1:${source.full_name}:${targetSha}:${document.tooling_sha}:${scannerProfileDigest}` : null;
    const stateKey = evaluation ? `evaluation:v1:${source.full_name.toLowerCase()}` : null;
    let evaluationState = evaluation && env.ANALYSIS_STATE ? await env.ANALYSIS_STATE.get(stateKey, 'json') : null;
    if (evaluation) {
      evaluationState = evaluationState || {evaluation_mode:true, evaluation_target_sha:targetSha, evaluation_dispatches_used:0, evaluation_paused:String(env.EVALUATION_PAUSED).toLowerCase() === 'true'};
      if (evaluationState.evaluation_target_sha && evaluationState.evaluation_target_sha !== targetSha) throw new Failure(409, 'Evaluation target SHA is frozen; refusing a moving target.', 'evaluation_frozen');
      if (evaluationState.evaluation_paused) throw new Failure(423, 'Evaluation is paused by an operator.', 'evaluation_paused');
      if (evaluationState.evaluation_idempotency_key === evaluationKey && evaluationState.evaluation_request_id) return json({status:'queued',request_id:evaluationState.evaluation_request_id,run_id:null,repository:repo.full_name,warning:'This deterministic evaluation request is already persisted.'},202);
      if (Number(evaluationState.evaluation_dispatches_used || 0) >= 1) throw new Failure(429, 'Evaluation dispatch budget is exhausted; operator reset required.', 'evaluation_budget');
    }
    const request_id = evaluation ? evaluationRequestId(evaluationKey) : crypto.randomUUID();
    let queue;
    const releases = await helpers.pages(`repos/${repo.full_name}/releases`, token);
    queue = releases.find(r => r.tag_name === 'analysis-requests');
    if (!queue) {
      try {queue=await github(`repos/${repo.full_name}/releases`,token,{method:'POST',body:JSON.stringify({tag_name:'analysis-requests',name:'Analysis request queue',body:'Durable pending analysis requests. Processed entries are removed.',make_latest:'false'})});}
      catch {queue=(await helpers.pages(`repos/${repo.full_name}/releases`,token)).find(r=>r.tag_name==='analysis-requests');if(!queue)throw new Failure(502,'Could not persist the analysis request.','persistence_failed');}
    }
    const pending=await helpers.pages(`repos/${repo.full_name}/releases/${queue.id}/assets`,token);
    if(pending.filter(a=>a.name.startsWith('request-')).length>=100)throw new Failure(429,'This repository has 100 pending requests. Wait for reconciliation before submitting another.','queue_full');
    const existingRequest = pending.find(a => a.name === `request-${request_id}.json`);
    if (existingRequest) return json({status:'queued',request_id,run_id:null,repository:repo.full_name,warning:'This deterministic analysis request is already persisted and awaiting reconciliation.'},202);
    const actor=await github('user',token);
    const intent={schema_version:'analysis-request-v1',request_id,execution_repository_id:repo.id,project_id:project.id,selection:{repository:source.full_name,kind:evaluation?'commit':input.kind,ref:evaluation?targetSha:input.ref},requested_selection:evaluation?{kind:input.kind,ref:input.ref}:undefined,target_sha:targetSha,idempotency_key:evaluationKey,actor_id:actor.id,created_at:new Date().toISOString()};
    const saved=await fetch(`https://uploads.github.com/repos/${repo.full_name}/releases/${queue.id}/assets?name=request-${request_id}.json`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','User-Agent':'code-analysis-application'},body:JSON.stringify(intent)});
    if(!saved.ok)throw new Failure(502,'Could not persist the analysis request; no scan was confirmed.','persistence_failed');
    if (evaluation && env.ANALYSIS_STATE) {
      evaluationState = {...evaluationState, evaluation_mode:true, evaluation_target_sha:targetSha, evaluation_dispatches_used:1, evaluation_idempotency_key:evaluationKey, evaluation_request_id:request_id, evaluation_status:'dispatching'};
      await env.ANALYSIS_STATE.put(stateKey, JSON.stringify(evaluationState));
    }
    let result;
    try { result = await github(`repos/${repo.full_name}/actions/workflows/code-analysis-reconcile.yml/dispatches`, token, {method:'POST', body:JSON.stringify({ref:repo.default_branch, return_run_details:true, inputs:{project_id:project.id,selection:JSON.stringify({repository:source.full_name,kind:evaluation?'commit':input.kind,ref:evaluation?targetSha:input.ref}),request_id}})}); } catch { return json({status:'queued',request_id,run_id:null,repository:repo.full_name,warning:'Request saved. Immediate dispatch failed; repository reconciliation will recover it.'},202); }
    return json({status:'submitted',request_id,run_id:result?.workflow_run_id || null,repository:repo.full_name},202);
  }
  if (request.method === 'GET' && url.pathname === '/api/project-activity') {
    const repo = await publicRepository(url.searchParams.get('repository')); await installation(repo);
    const document = await config(repo);
    const project = document.projects.find(p=>p.id===url.searchParams.get('project_id'));
    const id=url.searchParams.get('request_id');
    if(!project || !/^[a-f0-9-]{36}$/.test(id||''))throw new Failure(400,'Choose a project and request.','invalid_request');
    const reportUrl=new URL('/api/public/manifest',url);reportUrl.search=new URLSearchParams({repository:repo.full_name,project_id:project.id});
    const response=await publicReports(new Request(reportUrl),env);
    if(!response.ok)return json({phase:'queued',request_id:id,checked_at:new Date().toISOString(),publication_status:'unavailable',message:'Request is queued successfully. Publication status is temporarily unavailable; the request remains retained.'},202);
    const manifest=await response.json();
    const receipt=manifest.requests?.find(r=>r.request_id===id);
    const row=manifest.targets.find(t=>t.client_request_id===id&&(!receipt||t.head_sha===receipt.head_sha));
    if(receipt&&!row)return json({phase:'superseded',source_sha:receipt.head_sha,request_id:id,checked_at:new Date().toISOString()});
    if(!row)return json({phase:'queued',request_id:id,checked_at:new Date().toISOString()});
    const result={request_id:id,target_id:row.id,source_sha:row.head_sha,analyzed_sha:row.analyzed_sha,phase:'queued',checked_at:new Date().toISOString()};
    if(row.scan_run_id){
      const run=await github(`repos/${repo.full_name}/actions/runs/${row.scan_run_id}/attempts/${row.run_attempt}`,token);
      if(run.head_sha!==row.execution_sha)throw new Failure(409,'Producer revision does not match the request.','producer_mismatch');
      result.producer={run_id:row.scan_run_id,attempt:row.run_attempt,status:run.status,conclusion:run.conclusion,url:`https://github.com/${repo.full_name}/actions/runs/${row.scan_run_id}/attempts/${row.run_attempt}`};
      result.phase=run.status==='completed'?'publishing':'scanning';
      if(row.collected_run===`${row.scan_run_id}-${row.run_attempt}`&&row.analyzed_sha===row.head_sha){result.phase='published';result.completeness=row.report_status;}
    }
    if(row.error){result.phase='failed';result.error=row.error;}
    return json(result, 200, {'Cache-Control':'private, max-age=5, stale-while-revalidate=15'});
  }
  if (request.method === 'GET' && /^\/api\/project-runs\/[1-9][0-9]*$/.test(url.pathname)) {
    const repo = await publicRepository(url.searchParams.get('repository')); await installation(repo);
    const run = await github(`repos/${repo.full_name}/actions/runs/${url.pathname.split('/').at(-1)}`, token);
    if (!['.github/workflows/code-analysis-reconcile.yml','.github/workflows/code-analysis-source.yml'].includes(run.path?.split('@')[0])) throw new Failure(404, 'Not an application analysis run.', 'not_found');
    return json({run_id:run.id,status:run.status,conclusion:run.conclusion,attempt:run.run_attempt,checked_at:new Date().toISOString()});
  }
  return null;
}
