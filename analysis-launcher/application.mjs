// Repository application API. No source code is executed by the Worker.
const PROTECTED = 'arydestroyer/kavach-agenticsoc';
const REPO = /^[\w.-]+\/[\w.-]+$/;
const SHA = /^[a-f0-9]{40}$/;
const CONFIG = '.github/code-analysis/projects.json';
const SCANNERS = ['atheris','bandit','checkov','codeql','coderabbit-ai-advisory','coverage','eslint','github-actions-security','github-secret-protection-posture','gitleaks','hadolint','openssf-scorecard','osv','pyright','radon','ruff','sbom-license-provenance','schemathesis','semgrep','shipping-image-cves','snyk','sonarqube-cloud','trivy','typescript','vulture','xenon'];
const encode = value => btoa(String.fromCharCode(...new TextEncoder().encode(value)));
const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0)));

export function detectedProfile(paths) {
  const manifests = paths.filter(p => /(^|\/)(package.json|pyproject.toml|requirements[^/]*\.txt|Cargo.toml|go.mod|pom.xml|build.gradle)$/.test(p));
  return {profile: {mode: 'portable'}, detected_manifests: manifests,
    dockerfiles: paths.filter(p => /(^|\/)Dockerfile(?:\.[^/]*)?$/.test(p)),
    notice: 'Portable scanners can run immediately. Language build, test, fuzzing and vendor adapters require reviewed repository configuration.'};
}

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
    if (!REPO.test(name || '')) throw new Failure(400, 'Use owner/repository.');
    const repo = await github(`repos/${name}`, token);
    if (repo.private) throw new Failure(403, 'Only public repositories are supported.');
    return repo;
  }
  async function installation(repo, admin = false) {
    if (repo.full_name.toLowerCase() === PROTECTED) throw new Failure(403, 'This upstream repository is protected and read-only.');
    if (!(admin ? repo.permissions?.admin : repo.permissions?.push)) throw new Failure(403, admin ? 'Repository administration access required.' : 'Repository write access required.');
    // User-token installation enumeration also proves this App is installed here.
    for (let page = 1; page <= 20; page++) {
      const installs = await github(`user/installations?per_page=100&page=${page}`, token);
      for (const item of installs.installations || []) {
        for (let rp = 1; rp <= 20; rp++) {
          const list = await github(`user/installations/${item.id}/repositories?per_page=100&page=${rp}`, token);
          if ((list.repositories || []).some(r => r.id === repo.id)) return item.id;
          if ((list.repositories || []).length < 100) break;
          if (rp === 20) throw new Failure(422, 'Installation inventory exceeds supported pagination.');
        }
      }
      if ((installs.installations || []).length < 100) break;
      if (page === 20) throw new Failure(422, 'Installation inventory exceeds supported pagination.');
    }
    throw new Failure(403, 'Install the GitHub App on this execution repository.');
  }
  async function config(repo) {
    const file = await github(`repos/${repo.full_name}/contents/${CONFIG}?ref=${encodeURIComponent(repo.default_branch)}`, token);
    const value = JSON.parse(decode(file.content));
    if (value.schema_version !== 'analysis-projects-v1' || value.execution_repository?.id !== repo.id) throw new Failure(409, 'Repository configuration identity mismatch.');
    return value;
  }
  async function body() {
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) throw new Failure(415, 'JSON required.');
    const reader = request.body?.getReader();
    const chunks = []; let size = 0;
    if (reader) while (true) {
      const {value, done} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 65536) { await reader.cancel(); throw new Failure(413, 'Request too large.'); }
      chunks.push(value);
    }
    const joined = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(joined)); } catch { throw new Failure(400, 'Invalid JSON.'); }
  }
  const identity = repo => ({id: repo.id, full_name: repo.full_name, private: false});
  if (request.method === 'GET' && url.pathname === '/api/repositories') {
    const page = Number(url.searchParams.get('page') || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100) throw new Failure(400, 'Invalid page.');
    const rows = await github(`user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=${page}`, token);
    return json({repositories: rows.filter(r => !r.private && r.permissions?.push && r.full_name.toLowerCase() !== PROTECTED).map(r => ({...identity(r), default_branch:r.default_branch, can_configure:!!r.permissions?.admin})), page, has_more:rows.length===100});
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
    if (tree.truncated || sourceTree.truncated) throw new Failure(422, 'Repository inventory is incomplete; manual profile setup is required.');
    const found = detectedProfile(sourceTree.tree.filter(x => x.type === 'blob').map(x => x.path));
    const files = wrappers(env.ANALYSIS_REPOSITORY, env.TOOLING_SHA);
    let document = {schema_version:'analysis-projects-v1', execution_repository:identity(execution), tooling_sha:env.TOOLING_SHA, max_parallel_analyses:2, projects:[]};
    if (tree.tree.some(x => x.path === CONFIG)) document = await config(execution);
    if (document.projects.some(p => p.id === String(source.id))) throw new Failure(409, 'This source project is already connected.');
    const project = {id:String(source.id), source_repository:identity(source), relationship:source.id === execution.id ? 'connected':'observer', preferred_branch:source.default_branch, profile:found.profile, enabled_scanners:SCANNERS, deferred_channels:{}, report_budget_bytes:900000000};
    document.projects.push(project);
    document.tooling_sha = env.TOOLING_SHA;
    files[CONFIG] = JSON.stringify(document, null, 2) + '\n';
    // Existing managed wrappers may be updated; unknown files are never overwritten.
    for (const path of Object.keys(files).filter(p => p !== CONFIG)) {
      if (tree.tree.some(x => x.path === path)) {
        const old = await github(`repos/${execution.full_name}/contents/${path}?ref=${ref.object.sha}`, token);
        if (!decode(old.content).includes(`${env.ANALYSIS_REPOSITORY}/.github/workflows/reusable-`)) throw new Failure(409, `Existing workflow ${path} is not managed by this application.`);
      }
    }
    const user = await github('user', token);
    const preview = {type:'installation', exp:Date.now()+600000, actor:user.id, repository:execution.full_name, repository_id:execution.id, branch:execution.default_branch, base:ref.object.sha, tree:commit.tree.sha, files};
    return json({execution_repository:identity(execution), project, detection:found, files, confirmation:await seal(preview, env.SESSION_KEY)});
  }
  if (request.method === 'POST' && url.pathname === '/api/connections/install') {
    const input = await body();
    const preview = await unseal(input.confirmation || '', env.SESSION_KEY, 'installation');
    const user = await github('user', token);
    if (user.id !== preview.actor || input.confirm !== true) throw new Failure(403, 'Explicit confirmation by the preview owner is required.');
    const repo = await publicRepository(preview.repository);
    await installation(repo, true);
    if (repo.id !== preview.repository_id) throw new Failure(409, 'Repository identity changed.');
    const head = await github(`repos/${repo.full_name}/git/ref/heads/${encodeURIComponent(preview.branch)}`, token);
    if (head.object.sha !== preview.base) throw new Failure(409, 'Default branch changed. Review a fresh preview.');
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
    if (!project) throw new Failure(404, 'Unknown project.');
    const source = await publicRepository(project.source_repository.full_name);
    if (source.id !== project.source_repository.id) throw new Failure(409, 'Source identity changed.');
    const branches = await helpers.pages(`repos/${source.full_name}/branches`, token);
    const prs = await helpers.pages(`repos/${source.full_name}/pulls?state=open`, token);
    if (prs.some(p => !p.head.repo)) throw new Failure(502, 'PR inventory is incomplete.');
    return json({repository:source.full_name, checked_at:new Date().toISOString(), branches:branches.map(b=>({name:b.name,sha:b.commit.sha})), prs:prs.map(p=>({number:p.number,head_sha:p.head.sha,head_repository:p.head.repo.full_name,base_sha:p.base.sha,base_branch:p.base.ref}))});
  }
  if (request.method === 'POST' && url.pathname === '/api/project-launch') {
    const input = await body();
    const repo = await publicRepository(input.repository); await installation(repo);
    const document = await config(repo);
    const project = document.projects.find(p => p.id === input.project_id);
    if (!project || !['branch','pr','commit'].includes(input.kind) || typeof input.ref !== 'string' || !input.ref || input.ref.length > 255) throw new Failure(400, 'Choose a configured project and revision.');
    if (input.kind === 'commit' && !SHA.test(input.ref)) throw new Failure(400, 'Full commit SHA required.');
    if (input.kind === 'pr' && !/^[1-9][0-9]*$/.test(input.ref)) throw new Failure(400, 'PR number required.');
    const source = await publicRepository(project.source_repository.full_name);
    if (source.id !== project.source_repository.id) throw new Failure(409, 'Source identity changed.');
    const path = input.kind === 'branch' ? 'branches' : input.kind === 'pr' ? 'pulls' : 'commits';
    await github(`repos/${source.full_name}/${path}/${encodeURIComponent(input.ref)}`, token);
    const request_id = crypto.randomUUID();
    const result = await github(`repos/${repo.full_name}/actions/workflows/code-analysis-reconcile.yml/dispatches`, token, {method:'POST', body:JSON.stringify({ref:repo.default_branch, return_run_details:true, inputs:{project_id:project.id,selection:JSON.stringify({repository:source.full_name,kind:input.kind,ref:input.ref}),request_id}})});
    return json({status:'submitted',request_id,run_id:result?.workflow_run_id || null,repository:repo.full_name},202);
  }
  if (request.method === 'GET' && /^\/api\/project-runs\/[1-9][0-9]*$/.test(url.pathname)) {
    const repo = await publicRepository(url.searchParams.get('repository')); await installation(repo);
    const run = await github(`repos/${repo.full_name}/actions/runs/${url.pathname.split('/').at(-1)}`, token);
    if (!['.github/workflows/code-analysis-reconcile.yml','.github/workflows/code-analysis-source.yml'].includes(run.path?.split('@')[0])) throw new Failure(404, 'Not an application analysis run.');
    return json({run_id:run.id,status:run.status,conclusion:run.conclusion,attempt:run.run_attempt,checked_at:new Date().toISOString()});
  }
  return null;
}
