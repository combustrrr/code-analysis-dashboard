import {readBody, BodyLimitError, resolveLimit, DEFAULT_LIMITS} from './request-limits.mjs';
import {canonicalReportTarget, publicReports} from './reports.mjs';
import {validatePortableProfile} from './profile-policy.mjs';
import {CONFIGURED_TARGETS, EXECUTION_REPOSITORY, EXECUTION_REPOSITORY_ID, SUPPORTED_SCANNERS, VENDOR_SCANNERS, UNAVAILABLE_SCANNERS, SCANNER_GROUPS, validateTargetRegistry} from './target-registry.mjs';

const CONFIG = '.github/code-analysis/projects.json';
const SHA = /^[a-f0-9]{40}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;

const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const orderedRequests = assets => (assets||[]).filter(asset=>asset.name?.startsWith('request-')&&asset.name.endsWith('.json')).sort((left,right)=>String(left.created_at||'').localeCompare(String(right.created_at||''))||Number(left.id||0)-Number(right.id||0));
const CHANNEL_LANES = {'eslint':'typescript-quality','typescript':'typescript-quality','github-secret-protection-posture':'workflow-security-posture','github-actions-security':'workflow-security-posture','radon':'complexity','xenon':'complexity','shipping-image-cves':'shipping-image-security','sbom-license-provenance':'shipping-image-security','bandit':'python-bandit','ruff':'python-ruff','pyright':'python-types','coverage':'test-coverage','vulture':'dead-code','atheris':'atheris-state-machine','schemathesis':'schemathesis-fuzz','osv':'osv-scanner','snyk':'snyk','sonarqube-cloud':'sonar','coderabbit-ai-advisory':'coderabbit'};
export function channelProgress(requested, jobs, runStatus) {
  return (requested||[]).map(channel=>{
    const lane=(CHANNEL_LANES[channel]||channel).toLowerCase();
    const job=(jobs||[]).find(value=>String(value.name||'').toLowerCase().includes(lane));
    const status=job?.conclusion||job?.status||(runStatus==='completed'?'unavailable':'queued');
    return {channel,status:String(status).toLowerCase(),job_name:job?.name||null,reason:job?.conclusion==='failure'?'Scanner producer job failed.':undefined};
  });
}
async function digest(value) {
  const bytes = new TextEncoder().encode(stable(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function requestIdFromKey(value) {
  return value.toLowerCase();
}
function scannerChoices(project) {
  const portable = new Set(['semgrep','gitleaks','trivy','checkov','osv','snyk','sonarqube-cloud','openssf-scorecard','github-secret-protection-posture','github-actions-security','coderabbit-ai-advisory']);
  if (project.profile?.python_root) ['bandit','ruff','radon','xenon','vulture','codeql'].forEach(channel=>portable.add(channel));
  if (project.profile?.javascript_root) ['eslint','typescript','codeql'].forEach(channel=>portable.add(channel));
  Object.keys(project.profile?.commands || {}).forEach(channel=>portable.add(channel));
  const choices=[...new Set([...project.enabled_scanners,...Object.keys(project.deferred_channels||{})])].map(channel=>{
    const reason=project.deferred_channels?.[channel];
    const supported=SUPPORTED_SCANNERS.includes(channel);
    const mode=VENDOR_SCANNERS.has(channel)?'vendor':'portable';
    const setupRequired=project.profile?.mode==='portable'&&!portable.has(channel);
    const group=SCANNER_GROUPS.find(values=>values.includes(channel));
    const status=reason?'DEFERRED':!supported||UNAVAILABLE_SCANNERS.has(channel)?'NOT_AVAILABLE':setupRequired?'SETUP_REQUIRED':'READY';
    const unavailableReason=UNAVAILABLE_SCANNERS.has(channel)?'This lane requires a cross-repository credential and is withheld from source scanner jobs.':!supported?'No registered adapter in this tooling revision.':setupRequired?'Requires a reviewed language or execution profile.':channel==='coderabbit-ai-advisory'?'Available only when analyzing an open pull request.':'';
    return {id:channel,mode,group:group?.join('+')||channel,status,reason:reason||unavailableReason,default_selected:status==='READY'&&mode==='portable',selectable:status==='READY'};
  });
  for(const group of SCANNER_GROUPS){
    const members=choices.filter(value=>group.includes(value.id));
    if(members.some(value=>value.selectable)&&!members.every(value=>value.selectable)){
      for(const member of members){member.selectable=false;member.default_selected=false;if(member.status==='READY'){member.status='SETUP_REQUIRED';member.reason='Every channel in this shared producer lane must be selectable.';}}
    }
  }
  return choices;
}

export function cachedChannelsForSnapshot(snapshot, manifest) {
  const cached=[];
  const target=canonicalReportTarget(manifest);
  if(target?.analyzed_sha===snapshot.target_sha&&target.tooling_sha===snapshot.tooling_sha&&target.profile_digest===snapshot.profile_digest){
    const complete=new Set(['COMPLETED','COMPLETED_OPTIONAL','CONFIGURED_COMPLETE','POLICY_FINDINGS','NOT_APPLICABLE']);
    cached.push(...(target.channel_statuses||[]).filter(value=>complete.has(value.status)).map(value=>value.channel));
  }
  const overlay=manifest?.current_overlay;
  const currentPr=snapshot.pr_context;
  const overlayPr=overlay?.pr_context;
  if(currentPr&&overlay?.status==='complete'&&overlay.head_sha===snapshot.target_sha
    &&overlay.tooling_sha===snapshot.tooling_sha&&overlay.profile_digest===snapshot.profile_digest
    &&overlayPr?.number===currentPr.number&&overlayPr?.head_repository===currentPr.head_repository
    &&overlayPr?.head_repository_id===currentPr.head_repository_id
    &&overlayPr?.base_sha===currentPr.base_sha)cached.push('coderabbit-ai-advisory');
  return [...new Set(cached)];
}

export async function repositoryApi(request, env, session, helpers) {
  const {github, json, Failure, pages, serviceToken, seal, unseal} = helpers;
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
    try {
      if (!project.profile || typeof project.profile !== 'object' || Array.isArray(project.profile) || !Object.keys(project.profile).length) throw new Error('A project profile is required.');
      if (project.profile.mode === 'portable') validatePortableProfile(project.profile);
    }
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

  async function revisionSnapshot(configuration, project, source, selection) {
    if (!selection || !['branch','pr','commit'].includes(selection.kind) || typeof selection.ref !== 'string' || !selection.ref || selection.ref.length > 255) throw new Failure(400, 'Choose a configured project and revision.', 'invalid_selection');
    if (selection.kind === 'commit' && !SHA.test(selection.ref)) throw new Failure(400, 'Full commit SHA required.', 'invalid_selection');
    if (selection.kind === 'pr' && !/^[1-9][0-9]*$/.test(selection.ref)) throw new Failure(400, 'PR number required.', 'invalid_selection');
    const path = selection.kind === 'branch' ? `branches/${encodeURIComponent(selection.ref)}` : selection.kind === 'pr' ? `pulls/${selection.ref}` : `commits/${selection.ref.toLowerCase()}`;
    const resolved = await github(`repos/${source.full_name}/${path}`, token);
    const targetSha = selection.kind === 'branch' ? resolved.commit?.sha : selection.kind === 'pr' ? resolved.head?.sha : resolved.sha;
    if (!SHA.test(targetSha || '')) throw new Failure(502, 'GitHub did not resolve a full source commit SHA.', 'revision_unavailable');
    let prContext;
    if (selection.kind === 'pr') {
      if (!resolved.head?.repo?.full_name || !Number.isSafeInteger(resolved.head.repo.id) || !SHA.test(resolved.base?.sha || '') || !resolved.base?.ref) throw new Failure(409, 'Pull request source or base is unavailable; refresh the inventory.', 'revision_unavailable');
      prContext = {number:resolved.number, title:String(resolved.title || ''), draft:resolved.draft === true, head_repository:resolved.head.repo.full_name, head_repository_id:resolved.head.repo.id, head_branch:resolved.head.ref, head_sha:resolved.head.sha.toLowerCase(), base_repository:resolved.base.repo?.full_name || source.full_name, base_branch:resolved.base.ref, base_sha:resolved.base.sha.toLowerCase()};
    }
    const profile = {enabled_scanners:[...project.enabled_scanners].sort(),deferred_channels:project.deferred_channels || {},native_feedback_enabled:false,profile:project.profile || {}};
    const profileDigest = await digest(profile);
    const channels = scannerChoices(project).map(channel=>{
      if(channel.id==='coderabbit-ai-advisory'&&selection.kind!=='pr')return {...channel,status:'NOT_APPLICABLE',reason:'CodeRabbit review evidence requires an open pull request.',default_selected:false,selectable:false};
      return channel;
    });
    return {preview_id:crypto.randomUUID(),previewed_at:new Date().toISOString(),project_id:String(project.id),source_repository:source.full_name,source_repository_id:source.id,selection:{kind:selection.kind,ref:selection.kind === 'commit' ? selection.ref.toLowerCase() : selection.ref},target_sha:targetSha.toLowerCase(),pr_context:prContext || null,tooling_sha:configuration.tooling_sha,profile_digest:profileDigest,channels};
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const {repository, configuration} = await context();
    const verified = await Promise.all(configuration.projects.map(project => projectFor(configuration, project.id)));
    return json({
      execution_repository: {id:repository.id, full_name:repository.full_name},
      can_launch: repository.permissions.push === true,
      can_configure: repository.permissions.admin === true,
      projects: await Promise.all(verified.map(async ({project}) => {
        let current_report=null,current_overlay=null,queued_requests=0;
       const reportUrl=new URL('/api/public/manifest',url);
       reportUrl.search=new URLSearchParams({repository:repository.full_name,project_id:project.id});
       try {
        const response=await publicReports(new Request(reportUrl),env);
        if(response.ok){const manifest=await response.json();const target=canonicalReportTarget(manifest);const overlay=manifest.current_overlay;queued_requests=(manifest.requests||[]).filter(value=>!['published','reused','failed','superseded'].includes(value.status)).length;if(target)current_report={source_sha:target.head_sha,analyzed_sha:target.analyzed_sha,generated_at:target.generated_at||target.checked_at||null,status:target.report_status||target.status};if(overlay?.status==='complete')current_overlay={overlay_key:overlay.overlay_key,status:overlay.status,head_sha:overlay.head_sha,checked_at:overlay.checked_at,pr_context:overlay.pr_context,channel:overlay.channel};}
       } catch {}
       return {
        id: String(project.id),
        source_repository: project.source_repository.full_name,
        source_repository_id: project.source_repository.id,
        relationship: project.relationship,
        preferred_branch: project.preferred_branch,
        native_feedback_enabled: false,
        readiness_summary:{configured_channels:project.enabled_scanners.length,vendor_channels:project.enabled_scanners.filter(channel=>VENDOR_SCANNERS.has(channel)).length},
         current_report,current_overlay,queued_requests,
       };
      })),
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/project-identity') {
    const {configuration} = await context();
    const {project,source} = await projectFor(configuration,url.searchParams.get('project_id'));
    return json({project_id:String(project.id),source_repository_id:source.id});
  }

  if (request.method === 'POST' && url.pathname === '/api/project-preview') {
    const input = await requestBody();
    const {configuration} = await context();
    const {project,source} = await projectFor(configuration,input.project_id);
    const snapshot = await revisionSnapshot(configuration,project,source,input.selection);
    snapshot.cached_channels=[];
    const reportUrl=new URL('/api/public/manifest',url);
    reportUrl.search=new URLSearchParams({repository:EXECUTION_REPOSITORY,project_id:project.id});
    try {
      const response=await publicReports(new Request(reportUrl),env);
      if(response.ok){
        const manifest=await response.json();
        snapshot.cached_channels=cachedChannelsForSnapshot(snapshot,manifest);
      }
    } catch {}
    const actor = await github('user',token);
    const {channels,...identity}=snapshot;
    snapshot.preview_token = await seal({type:'revision-preview',exp:Date.now()+10*60*1000,actor_id:actor.id,snapshot:identity},env.SESSION_KEY);
    return json(snapshot);
  }

  if (request.method === 'GET' && ['/api/project-readiness', '/api/project-integration', '/api/project-targets', '/api/project-activity'].includes(url.pathname)) {
    const {repository, configuration, appToken} = await context();
    const {project, source} = await projectFor(configuration, url.searchParams.get('project_id'));

    if (url.pathname === '/api/project-readiness') {
      const channels = scannerChoices(project).map(value=>({...value,channel:value.id,status:value.status==='READY'?'configured':value.status.toLowerCase(),reason:value.reason||'Configured for execution; completed evidence is still required.'}));
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
      const unavailable = prs.filter(value => !value.head?.repo).map(value => value.number);
      return json({repository:source.full_name,project_id:project.id,checked_at:new Date().toISOString(),inventory_complete:unavailable.length===0,inventory_warning:unavailable.length?`PR head repository unavailable for ${unavailable.map(number=>`#${number}`).join(', ')}.`:null,branches:branches.map(value=>({name:value.name,sha:value.commit.sha})),prs:prs.map(value=>({number:value.number,title:String(value.title||''),draft:value.draft===true,available:!!value.head?.repo,unavailable_reason:!value.head?.repo?'Pull request head repository is unavailable.':undefined,head_branch:String(value.head?.ref||''),head_sha:value.head?.sha||'',head_repository:value.head?.repo?.full_name||null,base_sha:value.base?.sha||'',base_branch:value.base?.ref||''}))});
    }

    const id = url.searchParams.get('request_id');
    if (!/^[a-f0-9-]{36}$/.test(id || '')) throw new Failure(400, 'Choose a project and request.', 'invalid_request');
    const queuePosition = async () => {
      try {
        const releases=await pages(`repos/${repository.full_name}/releases`,appToken);
        const queue=releases.find(value=>value.tag_name==='analysis-requests');
        if(!queue)return null;
        const pending=orderedRequests(await pages(`repos/${repository.full_name}/releases/${queue.id}/assets`,appToken));
        const index=pending.findIndex(asset=>asset.name===`request-${id}.json`);
        return index<0?null:index+1;
      } catch { return null; }
    };
    const reportUrl = new URL('/api/public/manifest', url);
    reportUrl.search = new URLSearchParams({repository:repository.full_name,project_id:project.id});
    const response = await publicReports(new Request(reportUrl), env);
    if (!response.ok) return json({phase:'queued',request_id:id,queue_position:await queuePosition(),checked_at:new Date().toISOString(),publication_status:'unavailable',message:'Request is queued successfully. Publication status is temporarily unavailable; the request remains retained.'},202);
    const manifest = await response.json();
    const receipt = manifest.requests?.find(row => row.request_id === id);
    const canonical = canonicalReportTarget(manifest);
    if (receipt&&['published','reused','failed','superseded'].includes(receipt.status)) return json({phase:receipt.status,target_id:receipt.target_id||manifest.current_target_id,overlay_id:receipt.overlay_id||null,source_sha:receipt.head_sha,request_id:id,requested_channels:receipt.requested_channels,channel_progress:(receipt.channel_statuses||[]).map(value=>({...value,status:String(value.status||'unknown').toLowerCase()})),checked_at:new Date().toISOString()});
    const canonicalForRequest=canonical&&(canonical.client_request_id===id||canonical.request_id===id)?canonical:null;
    let row = receipt ? {...canonicalForRequest,...receipt,id:canonicalForRequest?.id||receipt.target_id,head_sha:receipt.head_sha,analyzed_sha:canonicalForRequest?.analyzed_sha,report_status:canonicalForRequest?.report_status} : canonicalForRequest;
    if (!row) {
      const recent = Array.isArray(manifest.recent_runs) ? manifest.recent_runs.find(run => run.client_request_id === id || run.request_id === id) : null;
      if (recent && canonical && recent.analyzed_sha === canonical.analyzed_sha && recent.original_target_id === canonical.original_target_id) row = {...canonical,...recent};
      else if (recent) return json({phase:'superseded',source_sha:recent.head_sha,request_id:id,checked_at:new Date().toISOString()});
    }
    if (!row) return json({phase:'queued',request_id:id,queue_position:await queuePosition(),checked_at:new Date().toISOString()});
    const result = {request_id:id,target_id:row.id,source_sha:row.head_sha,analyzed_sha:row.analyzed_sha,phase:'queued',queue_position:await queuePosition(),checked_at:new Date().toISOString()};
    if (row.scan_run_id) {
      const run = await github(`repos/${repository.full_name}/actions/runs/${row.scan_run_id}/attempts/${row.run_attempt}`, appToken);
      if (run.head_sha !== row.execution_sha) throw new Failure(409, 'Producer revision does not match the request.', 'producer_mismatch');
      result.producer = {run_id:row.scan_run_id,attempt:row.run_attempt,status:run.status,conclusion:run.conclusion,url:`https://github.com/${repository.full_name}/actions/runs/${row.scan_run_id}/attempts/${row.run_attempt}`};
      const producerJobs=await pages(`repos/${repository.full_name}/actions/runs/${row.scan_run_id}/jobs?filter=latest`,'jobs',appToken);
      const progress=new Map((row.channel_statuses||[]).map(value=>[value.channel,{...value,status:String(value.status||'unknown').toLowerCase()}]));
      for(const value of channelProgress(row.execution_channels||row.requested_channels,producerJobs,run.status))progress.set(value.channel,value);
      for(const channel of row.requested_channels||[])if(!progress.has(channel))progress.set(channel,{channel,status:'queued'});
      result.channel_progress=[...progress.values()];
      result.phase = run.status === 'completed' ? 'publishing' : 'scanning';
      if (row.collected_run === `${row.scan_run_id}-${row.run_attempt}` && row.analyzed_sha === row.head_sha) {result.phase='published';result.completeness=row.report_status;}
    }
    if (row.error) {result.phase='failed';result.error=row.error;}
    return json(result,200,{'Cache-Control':'private, max-age=5, stale-while-revalidate=15'});
  }

  if (request.method === 'GET' && /^\/api\/project-runs\/[1-9][0-9]*$/.test(url.pathname)) {
    const {repository,appToken} = await context();
    const run = await github(`repos/${repository.full_name}/actions/runs/${url.pathname.split('/').at(-1)}`, appToken);
    if (!['.github/workflows/code-analysis-reconcile.yml','.github/workflows/code-analysis-source.yml','.github/workflows/11-source-analysis.yml'].includes(run.path?.split('@')[0])) throw new Failure(404, 'Not an application analysis run.', 'not_found');
    return json({run_id:run.id,status:run.status,conclusion:run.conclusion,attempt:run.run_attempt,checked_at:new Date().toISOString()});
  }

  if (request.method === 'POST' && url.pathname === '/api/project-launch') {
    const input = await requestBody();
    const {repository,configuration} = await context('push');
    const {project,source} = await projectFor(configuration,input.project_id);
    if (typeof input.preview_token !== 'string' || input.preview_token.length > 4096) throw new Failure(400,'A valid revision preview is required before confirmation.','preview_required');
    let signedPreview;
    try { signedPreview = await unseal(input.preview_token,env.SESSION_KEY,'revision-preview'); }
    catch { throw new Failure(409,'The revision preview expired or is invalid. Refresh it before confirming.','preview_expired'); }
    const preview = signedPreview.snapshot;
    if (signedPreview.actor_id !== (await github('user',token)).id || !preview || preview.project_id !== String(project.id) || preview.source_repository_id !== source.id || !SHA.test(preview.target_sha || '') || !DIGEST.test(preview.profile_digest || '') || !SHA.test(preview.tooling_sha || '') || !/^[0-9a-f-]{36}$/i.test(preview.preview_id || '')) throw new Failure(400,'The revision preview does not match this user or project.','preview_required');
    if (!Array.isArray(input.requested_channels) || !input.requested_channels.length || input.requested_channels.length>SUPPORTED_SCANNERS.length || new Set(input.requested_channels).size!==input.requested_channels.length) throw new Failure(400,'Select one or more available scanner channels.','invalid_channels');
    const channelChoices=scannerChoices(project);
    if (input.requested_channels.some(channel=>!channelChoices.some(value=>value.id===channel&&value.selectable))) throw new Failure(400,'A selected scanner channel is not enabled by the trusted project profile.','invalid_channels');
    if (SCANNER_GROUPS.some(group=>group.some(channel=>input.requested_channels.includes(channel))&&!group.every(channel=>input.requested_channels.includes(channel)))) throw new Failure(400,'Select all channels produced by a shared scanner lane.','invalid_channels');
    if (!/^[0-9a-f-]{36}$/i.test(input.idempotency_key || '')) throw new Failure(400,'A request idempotency key is required.','invalid_idempotency_key');
    const current = await revisionSnapshot(configuration, project, source, preview.selection);
    if (current.target_sha !== preview.target_sha.toLowerCase() || current.profile_digest !== preview.profile_digest || current.tooling_sha !== preview.tooling_sha || stable(current.pr_context) !== stable(preview.pr_context || null)) throw new Failure(409,'The selected ref or PR context changed after preview. Refresh the preview before confirming.','stale_preview');
    if (input.requested_channels.includes('coderabbit-ai-advisory')&&!current.pr_context) throw new Failure(400,'CodeRabbit review evidence requires an open pull request.','invalid_channels');
    if (signedPreview.exp <= Date.now()) throw new Failure(409,'The revision preview expired. Refresh it before confirming.','preview_expired');
    const targetSha = current.target_sha;
    const requestId = requestIdFromKey(input.idempotency_key);
    const actor = await github('user',token);
    const releases = await pages(`repos/${repository.full_name}/releases`,token);
    let queue = releases.find(value => value.tag_name === 'analysis-requests');
    if (!queue) {
      try {queue = await github(`repos/${repository.full_name}/releases`,token,{method:'POST',body:JSON.stringify({tag_name:'analysis-requests',name:'Analysis request queue',body:'Durable pending analysis requests. Processed entries are removed.',make_latest:'false'})});}
      catch {queue=(await pages(`repos/${repository.full_name}/releases`,token)).find(value=>value.tag_name==='analysis-requests');if(!queue)throw new Failure(502,'Could not persist the analysis request.','persistence_failed');}
    }
    const pending = orderedRequests(await pages(`repos/${repository.full_name}/releases/${queue.id}/assets`,token));
    if (pending.length>=100) throw new Failure(429,'The global analysis queue has 100 pending requests. Wait for reconciliation before submitting another.','queue_full');
    const existingAsset=pending.find(asset=>asset.name===`request-${requestId}.json`);
    if (existingAsset) {
      const assetResponse=await fetch(`https://api.github.com/repos/${repository.full_name}/releases/assets/${existingAsset.id}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/octet-stream','User-Agent':'code-analysis-application'}});
      if (!assetResponse.ok) throw new Failure(502,'Could not verify the retained idempotency record.','idempotency_unavailable');
      const previous=await assetResponse.json();
      const mismatch=previous.project_id!==project.id?'project':previous.target_sha!==targetSha?'target':previous.actor_id!==actor.id?'actor':stable(previous.selection)!==stable(current.selection)?'selection':stable(previous.pr_context||null)!==stable(current.pr_context)?'pull_request':stable([...(previous.requested_channels||[])].sort())!==stable([...input.requested_channels].sort())?'channels':'';
      if (mismatch) throw new Failure(409,'This idempotency key already identifies a different analysis request.',`idempotency_conflict_${mismatch}`);
      return json({status:'queued',request_id:requestId,run_id:null,repository:repository.full_name,queue_position:pending.indexOf(existingAsset)+1,warning:'This idempotent analysis request is already persisted and awaiting reconciliation.'},202);
    }
    const reportUrl = new URL('/api/public/manifest',url);
    reportUrl.search = new URLSearchParams({repository:repository.full_name,project_id:project.id});
    const existingManifest = await publicReports(new Request(reportUrl),env);
    if (existingManifest.ok) {
      const receipt=(await existingManifest.json()).requests?.find(value=>value.request_id===requestId);
      if (receipt) {
        if (receipt.head_sha!==targetSha || stable(receipt.selection)!==stable(current.selection) || stable(receipt.pr_context||null)!==stable(current.pr_context) || stable([...(receipt.requested_channels||[])].sort())!==stable([...input.requested_channels].sort())) throw new Failure(409,'This idempotency key already identifies a different analysis request.','idempotency_conflict');
        return json({status:['published','reused'].includes(receipt.status)?receipt.status:'queued',request_id:requestId,run_id:receipt.scan_run_id||null,repository:repository.full_name,warning:'This idempotent analysis request is already retained.'},202);
      }
    }
    const selection = current.selection;
    const checkoutRepository=current.pr_context?.head_repository||source.full_name;
    const checkoutRepositoryId=current.pr_context?.head_repository_id||source.id;
    const intent = {schema_version:'analysis-request-v2',request_id:requestId,execution_repository_id:repository.id,project_id:project.id,source_repository:source.full_name,source_repository_id:source.id,selection,resolved_selection:{repository:checkoutRepository,repository_id:checkoutRepositoryId,kind:'commit',ref:targetSha},target_sha:targetSha,pr_context:current.pr_context,requested_channels:[...input.requested_channels].sort(),tooling_sha:current.tooling_sha,profile_digest:current.profile_digest,analysis_key:{project_id:String(project.id),source_repository_id:source.id,target_sha:targetSha,tooling_sha:current.tooling_sha,profile_digest:current.profile_digest},actor_id:actor.id,idempotency_key:input.idempotency_key.toLowerCase(),run_again:input.run_again===true,preview_id:preview.preview_id,created_at:new Date().toISOString()};
    const saved = await fetch(`https://uploads.github.com/repos/${repository.full_name}/releases/${queue.id}/assets?name=request-${requestId}.json`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','User-Agent':'code-analysis-application'},body:JSON.stringify(intent)});
    if (!saved.ok) throw new Failure(502,'Could not persist the analysis request; no scan was confirmed.','persistence_failed');
    let result;
    try {result=await github(`repos/${repository.full_name}/actions/workflows/code-analysis-reconcile.yml/dispatches`,token,{method:'POST',body:JSON.stringify({ref:repository.default_branch,return_run_details:true})});}
    catch {return json({status:'queued',request_id:requestId,run_id:null,repository:repository.full_name,queue_position:pending.length+1,warning:'Request saved. Immediate dispatch failed; repository reconciliation will recover it.'},202);}
    return json({status:'submitted',request_id:requestId,run_id:result?.workflow_run_id||null,repository:repository.full_name,queue_position:pending.length+1},202);
  }

  if (request.method === 'POST' && ['/api/connections/preview','/api/connections/install','/api/projects/preview'].includes(url.pathname)) {
    await executionRepository('admin');
    throw new Failure(409, 'Project profiles are managed in the trusted execution-repository registry.', 'configuration_managed');
  }
  return null;
}
