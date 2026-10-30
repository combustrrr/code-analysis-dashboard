import {readBody, BodyLimitError, resolveLimit, DEFAULT_LIMITS} from './request-limits.mjs';
import {canonicalReportTarget, publicReports} from './reports.mjs';
import {validatePortableProfile} from './profile-policy.mjs';
import {CONFIGURED_TARGETS, EXECUTION_REPOSITORY, EXECUTION_REPOSITORY_ID, SUPPORTED_SCANNERS, VENDOR_SCANNERS, UNAVAILABLE_SCANNERS, SCANNER_GROUPS, validateTargetRegistry} from './target-registry.mjs';

const CONFIG = '.github/code-analysis/projects.json';
const SHA = /^[a-f0-9]{40}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const COMPLETED_REPORT_STATUSES = new Set(['COMPLETED','COMPLETED_OPTIONAL','CONFIGURED_COMPLETE','POLICY_FINDINGS','NOT_APPLICABLE']);
const branchHeadCache = new Map();
const reportManifestCache = new Map();
const settingsAggregateCache = new Map();
const settingsAggregateFlights = new Map();
const SETTINGS_FRESH_MS=60000,SETTINGS_STALE_MS=120000,SETTINGS_CACHE_LIMIT=32;

const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
const orderedRequests = assets => (assets||[]).filter(asset=>asset.name?.startsWith('request-')&&asset.name.endsWith('.json')).sort((left,right)=>String(left.created_at||'').localeCompare(String(right.created_at||''))||Number(left.id||0)-Number(right.id||0));

export function registryReportState(target) {
  if (!target) return {report:null, attention:'No current report is available. Run analysis to create the first evidence set.'};
  const channels=Array.isArray(target.channel_statuses)?target.channel_statuses:[];
  const completed=channels.filter(value=>COMPLETED_REPORT_STATUSES.has(value.status)).length;
  const incomplete=channels.filter(value=>!COMPLETED_REPORT_STATUSES.has(value.status)&&!['NOT_SELECTED','DEFERRED'].includes(value.status));
  const notRun=channels.filter(value=>['NOT_SELECTED','DEFERRED'].includes(value.status)).length;
  const revision=target.analyzed_sha||target.head_sha;
  const report={source_sha:target.head_sha,analyzed_sha:target.analyzed_sha,generated_at:target.report_generation_timestamp||target.checked_at||target.generated_at||null,status:target.report_status||target.status,scanner_summary:{completed,total:channels.length,incomplete:incomplete.length,not_run:notRun},limitations:incomplete.slice(0,3).map(value=>({channel:value.channel||value.name||'Scanner',status:value.status||'Unavailable',reason:String(value.reason||'Evidence is incomplete.').slice(0,180)}))};
  if(!SHA.test(revision||''))return {report,attention:'The current report does not identify an immutable source revision. Run analysis to publish verifiable evidence.'};
  if(channels.length===0)return {report,attention:'The current report contains no scanner results. Run analysis to publish scanner evidence.'};
  if(report.status==='partial'||incomplete.length>0)return {report,attention:'The current report contains incomplete scanner evidence.'};
  return {report,attention:null};
}
const CHANNEL_LANES = {'eslint':'typescript-quality','typescript':'typescript-quality','ext-github-security-advisories':'ext-github-security-advisories','github-secret-protection-posture':'github-secret-protection-posture','github-actions-security':'github-actions-security','owasp-js':'owasp-js','owasp-iac-secrets':'owasp-iac-secrets','radon':'complexity','xenon':'complexity','shipping-image-cves':'shipping-image-security','sbom-license-provenance':'shipping-image-security','bandit':'python-bandit','ruff':'python-ruff','pyright':'python-types','coverage':'test-coverage','vulture':'dead-code','atheris':'atheris-state-machine','schemathesis':'schemathesis-fuzz','osv':'osv-scanner','snyk':'snyk','sonarqube-cloud':'sonar','coderabbit-ai-advisory':'coderabbit'};
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
  const portable = new Set(['semgrep','gitleaks','trivy','checkov','osv','snyk','sonarqube-cloud','openssf-scorecard','ext-github-security-advisories','github-secret-protection-posture','github-actions-security','owasp-js','owasp-iac-secrets','coderabbit-ai-advisory']);
  if (project.profile?.python_root) ['bandit','ruff','radon','xenon','vulture','codeql'].forEach(channel=>portable.add(channel));
  if (project.profile?.javascript_root) ['eslint','typescript','codeql'].forEach(channel=>portable.add(channel));
  Object.keys(project.profile?.commands || {}).forEach(channel=>portable.add(channel));
  // The launch surface is a project-specific capability list, not the global
  // scanner catalog. Deferred catalog entries stay available to operators in
  // registry diagnostics but are intentionally absent from developer choices.
  const choices=[...new Set(project.enabled_scanners)].map(channel=>{
    const reason=project.deferred_channels?.[channel];
    const supported=SUPPORTED_SCANNERS.includes(channel);
    const mode=VENDOR_SCANNERS.has(channel)?'vendor':project.profile?.mode==='portable'?'portable':'configured';
    const setupRequired=project.profile?.mode==='portable'&&!portable.has(channel);
    const group=SCANNER_GROUPS.find(values=>values.includes(channel));
    const status=reason?'DEFERRED':!supported||UNAVAILABLE_SCANNERS.has(channel)?'NOT_AVAILABLE':setupRequired?'SETUP_REQUIRED':'READY';
    const unavailableReason=UNAVAILABLE_SCANNERS.has(channel)?'This lane requires a cross-repository credential and is withheld from source scanner jobs.':!supported?'No registered adapter in this tooling revision.':setupRequired?'Requires a reviewed language or execution profile.':channel==='coderabbit-ai-advisory'?'Available only when analyzing an open pull request.':'';
    // Fast analysis removes revision/scanner setup; it does not reduce coverage.
    // CodeRabbit remains contextual because it requires an open pull request.
    const approvedDefault = channel !== 'coderabbit-ai-advisory';
    return {id:channel,mode,group:group?.join('+')||channel,status,reason:reason||unavailableReason,default_selected:status==='READY'&&approvedDefault,selectable:status==='READY'};
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

export async function repositoryApi(request, env, session, helpers, executionContext) {
  const {github,json,Failure,pages,serviceToken,seal,unseal,queue,wakeCoordinator} = helpers;
  const url = new URL(request.url);
  const token = session?.token;
  const requestedRepository = url.searchParams.get('repository');
  if (requestedRepository && requestedRepository.toLowerCase() !== EXECUTION_REPOSITORY.toLowerCase()) throw new Failure(400, 'Routes are bound to the configured execution repository.', 'repository_not_configurable');
  async function admit(intent){
    const admitted=await queue('/queue/admit',{request:intent}),body=await admitted.json();
    if(admitted.status===429)throw new Failure(429,'Too many analysis launches. Wait before starting another analysis.','launch_rate_limited',body.retry_after_seconds||60);
    if(admitted.status===409)throw new Failure(409,body.error==='analysis_active'?'This project is already being analyzed. Its newest report will open when ready.':body.error==='active_context_conflict'?'A previous analysis is finishing. Wait a moment, then try again.':'This analysis request was already submitted.',body.error||'idempotency_conflict');
    if(!admitted.ok)throw new Failure(503,body.error==='admission_paused'?(body.reset_notice||'Analysis admission is paused for maintenance.'):'The analysis control plane is temporarily unavailable; no request was accepted.',body.error==='admission_paused'?'admission_paused':'analysis_unavailable');
    let wake_status='scheduled_recovery';
    try{if(wakeCoordinator){await wakeCoordinator(body.request_id||intent.request_id,intent.source_sha);wake_status='signalled';}}catch{}
    return{...body,wake_status};
  }

  async function executionRepository(permission = 'pull') {
    const repository = await github(`repos/${env.ANALYSIS_REPOSITORY}`, token);
    if (repository.id !== EXECUTION_REPOSITORY_ID || repository.full_name?.toLowerCase() !== EXECUTION_REPOSITORY.toLowerCase() || Number(env.ANALYSIS_REPOSITORY_ID) !== EXECUTION_REPOSITORY_ID) {
      throw new Failure(409, 'Configured execution repository identity mismatch.', 'repository_identity');
    }
    if (!repository.permissions?.[permission]) {
      const code = permission === 'admin' ? 'repository_admin_required' : 'repository_read_required';
      const message = permission === 'admin' ? 'Repository administration access is required for configuration changes.' : 'Current collaborator access is required to view configured targets or launch analysis.';
      throw new Failure(403, message, code);
    }
    return repository;
  }

  async function context(permission = 'pull') {
    const [repository, appToken] = await Promise.all([executionRepository(permission), serviceToken()]);
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

  function configuredProject(configuration, id) {
    const project = configuration.projects.find(value => String(value.id) === String(id));
    if (!project || !CONFIGURED_TARGETS.some(value => value.id === String(id))) throw new Failure(404, 'Configured project is unavailable.', 'project_unavailable');
    try {
      if (!project.profile || typeof project.profile !== 'object' || Array.isArray(project.profile) || !['portable','agentic-soc'].includes(project.profile.mode)) throw new Error('A current project profile is required.');
      if (project.profile.mode === 'portable') validatePortableProfile(project.profile);
    }
    catch { throw new Failure(503, 'The configured project profile is invalid.', 'project_profile_invalid'); }
    return project;
  }

  function providerDiagnostic(status,checked_at,latency_ms=null,code=null,message=null){return{status,latency_ms,checked_at,code,message};}
  function safeProviderFailure(kind,error,checkedAt,latency){
    const code=error?.code==='github_rate_limited'?'GITHUB_RATE_LIMITED':error?.code==='github_unavailable'?'GITHUB_UNAVAILABLE':kind==='github'?'GITHUB_WORKFLOW_UNAVAILABLE':'STORAGE_UNAVAILABLE';
    const message=code==='GITHUB_RATE_LIMITED'?'GitHub is temporarily limiting workflow checks.':kind==='github'?'Workflow status is temporarily unavailable.':'Evidence storage is temporarily unavailable.';
    return providerDiagnostic('unavailable',checkedAt,latency,code,message);
  }
  function settingsCachePut(key,value){settingsAggregateCache.delete(key);settingsAggregateCache.set(key,{at:Date.now(),value});while(settingsAggregateCache.size>SETTINGS_CACHE_LIMIT)settingsAggregateCache.delete(settingsAggregateCache.keys().next().value);}
  function settingsChannels(project,target){
    const observed=new Map((target?.channel_statuses||[]).map(value=>[value.channel,value]));
    return scannerChoices(project).map(choice=>{
      const last=observed.get(choice.id),observedStatus=String(last?.status||'').toUpperCase(),complete=COMPLETED_REPORT_STATUSES.has(observedStatus);
      const status=choice.status==='DEFERRED'?'deferred':['SETUP_REQUIRED','NOT_AVAILABLE'].includes(choice.status)?'unavailable':last&&!complete?'needs_attention':'ready';
      return{channel_id:choice.id,name:choice.id,tier:choice.mode==='vendor'?'vendor':choice.default_selected?'essential':'extended',mode:choice.mode,status,selectable:choice.selectable===true,version:null,reason:String(last?.reason||choice.reason||'').slice(0,240)||null};
    });
  }
  async function buildProjectSettings(repository,configuration,appToken,project){
    const checkedAt=new Date().toISOString(),workflowStarted=Date.now(),storageStarted=Date.now();
    const reportUrl=new URL('/api/public/manifest',url);reportUrl.search=new URLSearchParams({repository:repository.full_name,project_id:String(project.id)});
    const [workflowResult,manifestResult]=await Promise.allSettled([
      github(`repos/${repository.full_name}/actions/workflows/code-analysis-coordinator.yml`,appToken),
      publicReports(new Request(reportUrl),env).then(async response=>{if(response.status===404)return null;if(!response.ok)throw Object.assign(new Error('storage unavailable'),{code:'STORAGE_UNAVAILABLE'});return response.json();}),
    ]);
    const workflow=workflowResult.status==='fulfilled'?workflowResult.value:null,manifest=manifestResult.status==='fulfilled'?manifestResult.value:null,target=manifest?canonicalReportTarget(manifest):null;
    const workflowDiagnostic=workflowResult.status==='fulfilled'?providerDiagnostic(workflow?.state==='active'?'healthy':'degraded',checkedAt,Date.now()-workflowStarted,workflow?.state==='active'?null:'GH_WORKFLOW_DISABLED',workflow?.state==='active'?null:'The analysis workflow is not active.'):safeProviderFailure('github',workflowResult.reason,checkedAt,Date.now()-workflowStarted);
    const storageDiagnostic=manifestResult.status==='fulfilled'?providerDiagnostic(manifest?'healthy':'unconfigured',checkedAt,Date.now()-storageStarted,manifest?null:'REPORT_NOT_PUBLISHED',manifest?null:'No evidence report has been published for this project.'):safeProviderFailure('storage',manifestResult.reason,checkedAt,Date.now()-storageStarted);
    const budget=Number.isFinite(Number(project.report_budget_bytes))&&Number(project.report_budget_bytes)>0?Number(project.report_budget_bytes):null,used=manifest&&Number.isFinite(Number(manifest?.metrics?.compressed_bytes))?Number(manifest.metrics.compressed_bytes):null;
    const workflowBranch=repository.default_branch||'main',drift=[];
    if(workflowBranch!==repository.default_branch)drift.push(`Workflow branch differs from the execution repository default branch.`);
    if(workflow&&workflow.state!=='active')drift.push('The analysis workflow is not active.');
    const sourceSha=target?.analyzed_sha||target?.head_sha||null,publishedAt=target?.report_generation_timestamp||target?.generated_at||target?.checked_at||null;
    const runId=target?.workflow_run_id??target?.collected_run,runAttempt=target?.workflow_run_attempt??target?.run_attempt??target?.collected_attempt;
    const payload={schema_version:'project-settings-v1',checked_at:checkedAt,freshness:{state:'fresh',age_seconds:0},project:{id:String(project.id),repository:project.source_repository.full_name,relationship:project.relationship==='connected'?'connected':'observer',branch:project.preferred_branch},execution:{repository_id:repository.id,repository:repository.full_name,workflow:'code-analysis-coordinator.yml',workflow_branch:workflowBranch,tooling_sha:SHA.test(configuration.tooling_sha||'')?configuration.tooling_sha:null,configuration_matches:drift.length===0,drift_reasons:drift},storage:{storage_managed:budget!==null,budget_bytes:budget,used_bytes:used,remaining_bytes:budget!==null&&used!==null?Math.max(0,budget-used):null,history_points:Array.isArray(manifest?.report_storage_history)?manifest.report_storage_history.length:0},readiness:{channels:settingsChannels(project,target)},provenance:{status:manifestResult.status==='rejected'?'degraded':manifest?'verified':'not_published',published_at:publishedAt,source_sha:SHA.test(sourceSha||'')?sourceSha:null,workflow_run_id:Number.isSafeInteger(Number(runId))?Number(runId):null,workflow_attempt:Number.isSafeInteger(Number(runAttempt))?Number(runAttempt):null},diagnostics:{github:workflowDiagnostic,storage:storageDiagnostic}};
    return payload;
  }
  async function resolveProjectSettings(repository,configuration,appToken,project,{force=false}={}){
    const key=`${repository.id}:${project.id}:${configuration.tooling_sha||'unknown'}`,cached=settingsAggregateCache.get(key),age=cached?Date.now()-cached.at:Infinity;
    if(!force&&cached&&age<=SETTINGS_FRESH_MS)return{...cached.value,freshness:{state:'fresh',age_seconds:Math.floor(age/1000)}};
    const refresh=()=>{if(settingsAggregateFlights.has(key))return settingsAggregateFlights.get(key);const flight=buildProjectSettings(repository,configuration,appToken,project).then(value=>{settingsCachePut(key,value);return value;}).finally(()=>settingsAggregateFlights.delete(key));settingsAggregateFlights.set(key,flight);return flight;};
    if(!force&&cached&&age<=SETTINGS_STALE_MS){executionContext?.waitUntil?.(refresh());return{...cached.value,freshness:{state:'stale',age_seconds:Math.floor(age/1000)}};}
    return refresh();
  }

  async function projectFor(configuration, id) {
    const project = configuredProject(configuration, id);
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
    const {repository, configuration, appToken} = await context();
    // The reviewed registry already pins public repository names and numeric IDs.
    // Keep the read-only register fast; launch and revision endpoints still verify
    // the live source identity before accepting an immutable SHA.
    const projectsInRegistry = configuration.projects.map(project => configuredProject(configuration, project.id));
    const checkedAt=new Date().toISOString();
    const activeByProjectPromise=(async()=>{const activeByProject=new Map();let available=true,checked_at=checkedAt,error_code;try{const response=await queue('/queue/recent',{});if(!response.ok)throw new Error('queue_unavailable');const payload=await response.json();checked_at=payload.checked_at||checkedAt;for(const row of payload.requests||[]){if(!['preparing','analyzing'].includes(row.status))continue;const key=String(row.intent?.project_id||''),existing=activeByProject.get(key);if(!existing||row.status==='analyzing')activeByProject.set(key,row);}}catch(error){available=false;error_code=error?.message==='queue_unavailable'?'QUEUE_UNAVAILABLE':'QUEUE_READ_FAILED';}return{activeByProject,available,checked_at,error_code};})();
    const settledProjects=await Promise.allSettled(projectsInRegistry.map(async project => {
      let current_report=null,current_overlay=null,reportAttention=null,publicationError=false,evidenceStatus='not_published',evidenceError;
      const reportUrl=new URL('/api/public/manifest',url);reportUrl.search=new URLSearchParams({repository:repository.full_name,project_id:project.id});
      const manifestPromise=(async()=>{const cacheKey=String(project.id);try{const response=await publicReports(new Request(reportUrl),env);if(response.status===404)return{status:'not_published',manifest:null,checked_at:checkedAt};if(!response.ok)throw Object.assign(new Error('REPORT_UNAVAILABLE'),{code:'REPORT_UNAVAILABLE'});const manifest=await response.json(),value={status:'available',manifest,checked_at:checkedAt};reportManifestCache.set(cacheKey,{at:Date.now(),value});return value;}catch(error){const cached=reportManifestCache.get(cacheKey);return{status:'temporarily_unavailable',manifest:cached?.value?.manifest||null,checked_at:cached?.value?.checked_at||checkedAt,error_code:error?.code||'REPORT_UNAVAILABLE',cached:Boolean(cached)};}})();
      const headKey=`${project.source_repository.full_name}:${project.preferred_branch}`;
      const cachedHead=branchHeadCache.get(headKey);
      const headPromise=cachedHead&&Date.now()-cachedHead.at<60000?Promise.resolve({status:'verified',sha:cachedHead.sha,checked_at:new Date(cachedHead.at).toISOString()}):github(`repos/${project.source_repository.full_name}/branches/${encodeURIComponent(project.preferred_branch)}`,appToken).then(value=>{const sha=value?.commit?.sha||null,timestamp=Date.now();branchHeadCache.set(headKey,{at:timestamp,sha});return{status:'verified',sha,checked_at:new Date(timestamp).toISOString()};}).catch(()=>({status:'temporarily_unavailable',sha:cachedHead?.sha||null,checked_at:cachedHead?new Date(cachedHead.at).toISOString():checkedAt,error_code:'GITHUB_BRANCH_UNAVAILABLE'}));
      const [activity,evidence,branch]=await Promise.all([activeByProjectPromise,manifestPromise,headPromise]);
      const preferredBranchHeadSha=branch.sha;
      try {
        evidenceStatus=evidence.status;evidenceError=evidence.error_code;if(evidence.manifest){const manifest=evidence.manifest,target=canonicalReportTarget(manifest),overlay=manifest.current_overlay;publicationError=Boolean(manifest.publication_error);const state=registryReportState(target);current_report=state.report?{...state.report,freshness:manifest.report_freshness||null}:null;reportAttention=state.attention;if(overlay?.status==='complete')current_overlay={overlay_key:overlay.overlay_key,status:overlay.status,head_sha:overlay.head_sha,checked_at:overlay.checked_at,pr_context:overlay.pr_context,channel:overlay.channel};}
      } catch {}
      const active=activity.activeByProject.get(String(project.id));let lifecycle='Ready',attention_reason=null;
      if(active)lifecycle=active.status==='analyzing'?'Analyzing':'Preparing';
      else if(evidenceStatus==='temporarily_unavailable'||branch.status==='temporarily_unavailable'||!activity.available){lifecycle='Needs attention';attention_reason='Current project evidence could not be fully verified. Retry the register check.';}
      else if(publicationError){lifecycle='Needs attention';attention_reason='The latest report could not be published. Review the project evidence before relying on it.';}
      else if(!current_report||reportAttention){lifecycle='Needs attention';attention_reason=reportAttention||'No current report is available. Run analysis to create the first evidence set.';}
      const choices=scannerChoices(project),selectable=choices.filter(channel=>channel.selectable),projectId=String(project.id),publishedSha=current_report?.analyzed_sha||current_report?.source_sha||null,providerUnavailable=evidenceStatus==='temporarily_unavailable'||branch.status==='temporarily_unavailable'||!activity.available,revision_comparison=branch.status==='temporarily_unavailable'?'UNVERIFIABLE':!SHA.test(publishedSha||'')||!SHA.test(preferredBranchHeadSha||'')?'UNKNOWN_REVISION':publishedSha.toLowerCase()===preferredBranchHeadSha.toLowerCase()?'MATCHED':'BEHIND_HEAD';
      const action=(type,label,reason)=>({type,label,project_id:projectId,disabled:false,reason});let primary_action=null,secondary_action=null;
      if(active)primary_action=action('VIEW_PROGRESS','View progress','An analysis request is already active.');
      else if(providerUnavailable){primary_action=action('RETRY_CHECK','Retry check','One or more evidence providers could not be verified.');if(current_report)secondary_action=action('REVIEW_EVIDENCE','View cached report','Previously verified evidence remains available.');}
      else if(current_report&&revision_comparison==='BEHIND_HEAD'){primary_action=action('RUN_ANALYSIS','Run analysis','A newer preferred-branch revision is available.');secondary_action=action('REVIEW_EVIDENCE','Review prior evidence','The previously published report remains reviewable.');}
      else if(current_report)primary_action=action('REVIEW_EVIDENCE','Review evidence','Published evidence is available for the selected revision.');
      else primary_action=action('RUN_ANALYSIS','Run analysis','No report has been published for this project.');
      return {id:projectId,source_repository:project.source_repository.full_name,source_repository_id:project.source_repository.id,relationship:project.relationship,preferred_branch:project.preferred_branch,preferred_branch_head_sha:preferredBranchHeadSha,published_sha:publishedSha,head_sha:preferredBranchHeadSha,display_revision:(publishedSha||preferredBranchHeadSha||'').slice(0,7)||null,revision_comparison,native_feedback_enabled:false,readiness_summary:{profile_mode:project.profile.mode,configured_channels:project.enabled_scanners.length,selectable_channels:selectable.length,vendor_channels:selectable.filter(channel=>channel.mode==='vendor').length,deferred_channels:choices.filter(channel=>channel.status==='DEFERRED').length,unavailable_channels:choices.filter(channel=>['NOT_AVAILABLE','SETUP_REQUIRED'].includes(channel.status)).length},lifecycle,attention_reason,active_analysis:active?{request_id:active.request_id,status:active.status,target_sha:active.intent?.target_sha||active.intent?.source_sha||null,created_at:active.created_at,scanner_summary:active.scanner_summary}:null,current_report,current_overlay,source_verification:{branch:{status:branch.status,checked_at:branch.checked_at,...(branch.error_code?{error_code:branch.error_code}:{})},evidence:{status:evidenceStatus,checked_at:evidence.checked_at,...(evidenceError?{error_code:evidenceError}:{})},activity:{status:activity.available?'available':'temporarily_unavailable',checked_at:activity.checked_at,...(activity.error_code?{error_code:activity.error_code}:{}),...(active?{active_request_id:active.request_id}:{})}},primary_action,secondary_action};
    }));
    const projects=settledProjects.map((result,index)=>result.status==='fulfilled'?result.value:{id:String(projectsInRegistry[index].id),source_repository:projectsInRegistry[index].source_repository.full_name,source_repository_id:projectsInRegistry[index].source_repository.id,relationship:projectsInRegistry[index].relationship,preferred_branch:projectsInRegistry[index].preferred_branch,lifecycle:'Needs attention',attention_reason:'Project configuration could not be assembled.',source_verification:{branch:{status:'temporarily_unavailable',checked_at:checkedAt,error_code:'PROJECT_ASSEMBLY_FAILED'},evidence:{status:'temporarily_unavailable',checked_at:checkedAt,error_code:'PROJECT_ASSEMBLY_FAILED'},activity:{status:'temporarily_unavailable',checked_at:checkedAt,error_code:'PROJECT_ASSEMBLY_FAILED'}},primary_action:{type:'RETRY_CHECK',label:'Retry check',project_id:String(projectsInRegistry[index].id),disabled:false,reason:'Project configuration could not be assembled.'},secondary_action:null});
    const summary={projects:projects.length,preparing:projects.filter(value=>value.lifecycle==='Preparing').length,analyzing:projects.filter(value=>value.lifecycle==='Analyzing').length,needs_attention:projects.filter(value=>value.lifecycle==='Needs attention').length};
    return json({
      schema_version:'project-register-v1',
      checked_at:checkedAt,
      refresh_after_seconds:projects.some(value=>['Preparing','Analyzing'].includes(value.lifecycle))?8:90,
      summary,
      execution_repository: {id:repository.id, full_name:repository.full_name},
      can_launch: repository.permissions.pull === true,
      can_configure: repository.permissions.admin === true,
      capabilities:{launch:repository.permissions.pull===true,configure:repository.permissions.admin===true},
      projects,
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/project-identity') {
    const {configuration} = await context();
    const {project,source} = await projectFor(configuration,url.searchParams.get('project_id'));
    return json({project_id:String(project.id),source_repository_id:source.id});
  }

  if (request.method === 'POST' && url.pathname === '/api/project-launch-fast') {
    const input=await requestBody();
    if(!input||Object.keys(input).sort().join(',')!=='projectId,strategy'||input.strategy!=='LAST_USED_OR_PREFERRED')throw new Failure(400,'Fast analysis accepts only the last-used selection strategy.','invalid_fast_path_intent');
    const idempotencyKey=request.headers.get('Idempotency-Key')||'';
    if(!/^[0-9a-f-]{36}$/i.test(idempotencyKey))throw new Failure(400,'A request idempotency key is required.','invalid_idempotency_key');
    const {repository,configuration}=await context('pull');
    const {project,source}=await projectFor(configuration,input.projectId);
    if(!project.preferred_branch)throw new Failure(409,'The trusted project has no preferred branch.','preferred_branch_unavailable');
    const requestId=requestIdFromKey(idempotencyKey);
    const prior=await queue('/queue/status',{request_id:requestId});
    if(prior.ok){
      const row=await prior.json();
      if(String(row.intent?.project_id)!==String(project.id))throw new Failure(409,'This idempotency key already identifies a different analysis request.','idempotency_conflict');
      const lifecycle=row.status==='analyzing'?'Analyzing':['published','reused'].includes(row.status)?'Ready':['failed','superseded','cancelled_cutover'].includes(row.status)?'Needs attention':'Preparing';
      return json({status:row.status,lifecycle,request_id:row.request_id,run_id:row.result?.run_id||null,repository:repository.full_name,source_repository:source.full_name,target_sha:row.intent.target_sha,selection:row.intent.selection,selection_source:row.intent.selection_source||'remembered',preferred_branch:project.preferred_branch,requested_channels:row.intent.requested_channels,pr_context:row.intent.pr_context||null,duplicate:true},202);
    }
    const actor=await github('user',token);
    let selection={kind:'branch',ref:project.preferred_branch},selectionSource='preferred_branch';
    try{
      const recent=await queue('/queue/recent',{});
      if(recent.ok){
        const rows=(await recent.json()).requests||[];
        const remembered=rows.find(row=>String(row.intent?.project_id)===String(project.id)&&row.intent?.actor_id===actor.id&&['branch','pr','commit'].includes(row.intent?.selection?.kind)&&typeof row.intent.selection.ref==='string');
        if(remembered){selection=remembered.intent.selection;selectionSource='remembered';}
      }
    }catch{}
    let current;
    try{current=await revisionSnapshot(configuration,project,source,selection);}
    catch(error){
      if(selectionSource!=='remembered'||!error||![404,409].includes(error.status))throw error;
      selection={kind:'branch',ref:project.preferred_branch};selectionSource='preferred_branch';
      current=await revisionSnapshot(configuration,project,source,selection);
    }
    // Fast analysis remembers the code selection, never an old reduced scanner
    // subset. Recompute every scanner that is selectable for the exact revision.
    const requestedChannels=current.channels.filter(channel=>channel.selectable).map(channel=>channel.id);
    if(!requestedChannels.length)throw new Failure(409,'The trusted project has no usable default scanner channel.','default_channels_unavailable');
    if(SCANNER_GROUPS.some(group=>group.some(channel=>requestedChannels.includes(channel))&&!group.every(channel=>requestedChannels.includes(channel))))throw new Failure(409,'The trusted default scanner policy contains an incomplete shared lane.','default_channels_unavailable');
    const targetSha=current.target_sha;
    const intent={schema_version:'analysis-request-v4',request_id:requestId,execution_repository_id:repository.id,project_id:project.id,source_repository:source.full_name,source_repository_id:source.id,selection:current.selection,selection_source:selectionSource,resolved_selection:{repository:source.full_name,repository_id:source.id,kind:'commit',ref:targetSha},source_sha:targetSha,target_sha:targetSha,pr_context:current.pr_context,requested_channels:[...requestedChannels].sort(),tooling_sha:current.tooling_sha,profile_digest:current.profile_digest,profile_mode:project.profile?.mode==='portable'?'portable':'agentic-soc',analysis_key:{project_id:String(project.id),source_repository_id:source.id,target_sha:targetSha,tooling_sha:current.tooling_sha,profile_digest:current.profile_digest},actor_id:actor.id,idempotency_key:idempotencyKey.toLowerCase(),run_again:false,preview_id:crypto.randomUUID(),created_at:new Date().toISOString()};
    const admittedBody=await admit(intent);
    return json({status:'preparing',lifecycle:'Preparing',request_id:admittedBody.request_id||requestId,run_id:null,repository:repository.full_name,source_repository:source.full_name,target_sha:targetSha,selection:current.selection,selection_source:selectionSource,preferred_branch:project.preferred_branch,requested_channels:admittedBody.intent?.requested_channels||[...requestedChannels].sort(),pr_context:current.pr_context,duplicate:admittedBody.duplicate===true,wake_status:admittedBody.wake_status},202);
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

  if (request.method === 'GET' && ['/api/project-settings','/api/project-readiness', '/api/project-integration', '/api/project-targets', '/api/project-activity'].includes(url.pathname)) {
    if(url.pathname==='/api/project-settings'&&[...url.searchParams.keys()].some(key=>!['project_id','refresh'].includes(key)))throw new Failure(400,'Project settings accepts only project_id and refresh.','invalid_request');
    if(url.pathname==='/api/project-settings'&&!['',null,'1'].includes(url.searchParams.get('refresh')))throw new Failure(400,'Refresh must be 1 when provided.','invalid_request');
    if(url.pathname==='/api/project-settings'&&session?.capabilities?.read!==true)throw new Failure(403,'Read access is required to inspect project settings.','settings_read_required');
    const {repository, configuration, appToken} = await context();
    const project = configuredProject(configuration, url.searchParams.get('project_id'));
    const source=url.pathname==='/api/project-settings'?{full_name:project.source_repository.full_name,id:project.source_repository.id}:(await projectFor(configuration,project.id)).source;

    if(['/api/project-settings','/api/project-readiness','/api/project-integration'].includes(url.pathname)){
      const limited=await queue('/rate/settings',{handle:session.handle});if(limited.status===429){const body=await limited.json();throw new Failure(429,'Too many settings checks. Wait before refreshing again.','settings_rate_limited',body.retry_after_seconds||60);}if(!limited.ok)throw new Failure(503,'Settings request limits are temporarily unavailable.','settings_unavailable');
      const aggregate=await resolveProjectSettings(repository,configuration,appToken,project,{force:url.pathname==='/api/project-settings'&&url.searchParams.get('refresh')==='1'});
      if(url.pathname==='/api/project-settings')return json(aggregate);
      const compatibility={'Deprecation':'@1801353600','Sunset':'Sun, 31 Jan 2027 00:00:00 GMT','Link':'</api/project-settings>; rel="successor-version"'};
      if(url.pathname==='/api/project-readiness'){
        const channels=aggregate.readiness.channels.map(value=>({id:value.channel_id,channel:value.channel_id,mode:value.mode,status:value.status==='ready'?'profile_declared':value.status==='needs_attention'?'setup_required':value.status,reason:value.reason||'Declared in the trusted profile; completed evidence is still required.',selectable:value.selectable,default_selected:value.tier==='essential',last_observed:null}));
        return json({project_id:project.id,preferred_branch:project.preferred_branch,profile_mode:project.profile.mode,tooling_sha:configuration.tooling_sha,summary:{selectable:channels.filter(value=>value.selectable).length,vendor:channels.filter(value=>value.selectable&&value.mode==='vendor').length,deferred:channels.filter(value=>value.status==='deferred').length,unavailable:channels.filter(value=>value.status==='unavailable').length,completed:0,needs_attention:channels.filter(value=>value.status==='setup_required').length},channels,checked_at:aggregate.checked_at},200,compatibility);
      }
      return json({source_repository:aggregate.project.repository,analysis_repository:aggregate.execution.repository,publishing_repository:aggregate.execution.repository,workflow_branch:aggregate.execution.workflow_branch,workflow_state:aggregate.diagnostics.github.status==='healthy'?'Code analysis coordinator: active':aggregate.diagnostics.github.message||'Workflow unavailable',configuration_matches:aggregate.execution.configuration_matches,ready:aggregate.execution.configuration_matches&&aggregate.diagnostics.github.status==='healthy',enabled_scanners:project.enabled_scanners,checked_at:aggregate.checked_at,report_budget_bytes:aggregate.storage.budget_bytes,report_storage:{compressed_bytes:aggregate.storage.used_bytes,remaining_bytes:aggregate.storage.remaining_bytes,history_points:aggregate.storage.history_points},storage_backend:'cloudflare-r2'},200,compatibility);
    }

    if (url.pathname === '/api/project-readiness') {
      let observed=new Map(),observedAt=null;
      try {
        const reportUrl=new URL('/api/public/manifest',url);reportUrl.search=new URLSearchParams({repository:repository.full_name,project_id:project.id});
        const response=await publicReports(new Request(reportUrl),env);
        if(response.ok){const manifest=await response.json();const target=canonicalReportTarget(manifest);observed=new Map((target?.channel_statuses||[]).map(value=>[value.channel,value]));observedAt=target?.generated_at||target?.checked_at||null;}
      } catch {}
      const completeStatuses=new Set(['COMPLETED','COMPLETED_OPTIONAL','CONFIGURED_COMPLETE','POLICY_FINDINGS','NOT_APPLICABLE']);
      const channels = scannerChoices(project).map(value=>{const last=observed.get(value.id),observedStatus=String(last?.status||'unknown').toUpperCase();return {...value,channel:value.id,status:value.status==='READY'?'profile_declared':value.status.toLowerCase(),reason:value.reason||'Declared in the trusted profile; completed evidence is still required.',last_observed:last?{status:observedStatus.toLowerCase(),complete:completeStatuses.has(observedStatus),reason:last.reason||null,findings:Number.isFinite(last.findings)?last.findings:null,checked_at:observedAt}:null};});
      return json({project_id:project.id,preferred_branch:project.preferred_branch,profile_mode:project.profile.mode,tooling_sha:configuration.tooling_sha,summary:{selectable:channels.filter(channel=>channel.selectable).length,vendor:channels.filter(channel=>channel.selectable&&channel.mode==='vendor').length,deferred:channels.filter(channel=>channel.status==='deferred').length,unavailable:channels.filter(channel=>['setup_required','not_available'].includes(channel.status)).length,completed:channels.filter(channel=>channel.last_observed?.complete).length,needs_attention:channels.filter(channel=>channel.last_observed&&!channel.last_observed.complete).length},channels,checked_at:new Date().toISOString()});
    }

    if (url.pathname === '/api/project-integration') {
      const workflows = await Promise.all(['code-analysis-coordinator.yml'].map(name => github(`repos/${repository.full_name}/actions/workflows/${name}`, appToken)));
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
    const activityFromQueue=async state=>{
      const queuedResult=state.result||{};
      const result={phase:state.status,request_id:id,attempts:state.attempts,source_sha:state.intent?.source_sha,requested_channels:state.intent?.requested_channels||[],checked_at:new Date().toISOString(),...queuedResult};
      const runId=state.workflow_run_id||queuedResult.run_id;
      const runAttempt=state.workflow_run_attempt||queuedResult.run_attempt||1;
      if(runId){
        try{
          const [run,producerJobs]=await Promise.all([
            github(`repos/${repository.full_name}/actions/runs/${runId}/attempts/${runAttempt}`,appToken),
            pages(`repos/${repository.full_name}/actions/runs/${runId}/jobs?filter=latest`,'jobs',appToken),
          ]);
          result.producer={run_id:runId,attempt:runAttempt,status:run.status,conclusion:run.conclusion,url:`https://github.com/${repository.full_name}/actions/runs/${runId}/attempts/${runAttempt}`};
          result.channel_progress=channelProgress(state.intent?.requested_channels,producerJobs,run.status);
          result.failed_channels=result.channel_progress.filter(value=>value.status==='failure').map(value=>value.channel);
          if(['preparing','analyzing'].includes(state.status))result.phase=run.status==='completed'?'publishing':state.status;
        }catch{}
      }
      const publicationSucceeded=queuedResult.publication_status==='success';
      if(state.status==='published')result.phase='publishing';
      if(state.status==='failed'&&publicationSucceeded)result.phase='publishing';
      if(state.status==='failed'){
        const lanes=queuedResult.scanner_lanes||{};
        const failedLanes=Object.entries(lanes).filter(([,value])=>value==='failure').map(([name])=>name);
        result.error=queuedResult.reason||(queuedResult.publication_status&&queuedResult.publication_status!=='success'?'The report could not be published. The previous report remains available.':failedLanes.length?`Analysis stopped before publication after these scanner lanes failed: ${failedLanes.join(', ')}.`:'The analysis stopped before a report was published.');
      }
      return result;
    };
    let queuedState;
    const queued=await queue('/queue/status',{request_id:id});
    if(queued.ok){queuedState=await queued.json();if(['preparing','analyzing'].includes(queuedState.status)){const activity=await activityFromQueue(queuedState);return json(activity,activity.phase==='preparing'?202:200,{'Cache-Control':'private, max-age=5'});}}
    const reportUrl = new URL('/api/public/manifest', url);
    reportUrl.search = new URLSearchParams({repository:repository.full_name,project_id:project.id});
    const response = await publicReports(new Request(reportUrl), env);
    if (!response.ok){if(queuedState)return json(await activityFromQueue(queuedState),queuedState.status==='preparing'?202:200);return json({phase:'preparing',request_id:id,checked_at:new Date().toISOString(),publication_status:'unavailable'},202);}
    const manifest = await response.json();
    const receipt = manifest.requests?.find(row => row.request_id === id);
    const canonical = canonicalReportTarget(manifest);
    if (receipt&&['published','reused','failed','superseded'].includes(receipt.status)) {
      const progress=(receipt.channel_statuses||[]).map(value=>({...value,status:String(value.status||'unknown').toLowerCase()}));
      const failedChannels=progress.filter(value=>['failed','failure'].includes(value.status)).map(value=>value.channel);
      return json({phase:receipt.status,target_id:receipt.target_id||manifest.current_target_id,overlay_id:receipt.overlay_id||null,source_sha:receipt.head_sha,request_id:id,requested_channels:receipt.requested_channels,channel_progress:progress,failed_channels:failedChannels,publication_status:['published','reused'].includes(receipt.status)?'success':receipt.publication_status||'unavailable',completeness:canonical?.report_status||canonical?.status||null,error:receipt.status==='failed'?(receipt.error||receipt.message||receipt.reason||'The analysis stopped before a report was published.'):undefined,checked_at:new Date().toISOString()});
    }
    const canonicalForRequest=canonical&&(canonical.client_request_id===id||canonical.request_id===id)?canonical:null;
    let row = receipt ? {...canonicalForRequest,...receipt,id:canonicalForRequest?.id||receipt.target_id,head_sha:receipt.head_sha,analyzed_sha:canonicalForRequest?.analyzed_sha,report_status:canonicalForRequest?.report_status} : canonicalForRequest;
    if (!row) {
      const recent = Array.isArray(manifest.recent_runs) ? manifest.recent_runs.find(run => run.client_request_id === id || run.request_id === id) : null;
      if (recent && canonical && recent.analyzed_sha === canonical.analyzed_sha && recent.original_target_id === canonical.original_target_id) row = {...canonical,...recent};
      else if (recent) return json({phase:'superseded',source_sha:recent.head_sha,request_id:id,checked_at:new Date().toISOString()});
    }
    if (!row){if(queuedState)return json(await activityFromQueue(queuedState),queuedState.status==='preparing'?202:200);return json({phase:'preparing',request_id:id,checked_at:new Date().toISOString()});}
    const result = {request_id:id,target_id:row.id,source_sha:row.head_sha,analyzed_sha:row.analyzed_sha,phase:'preparing',checked_at:new Date().toISOString()};
    if (row.scan_run_id) {
      const run = await github(`repos/${repository.full_name}/actions/runs/${row.scan_run_id}/attempts/${row.run_attempt}`, appToken);
      if (run.head_sha !== row.execution_sha) return json({
        phase:'superseded', request_id:id, source_sha:row.head_sha,
        error:'A newer analysis replaced this request. Tracking has stopped for the obsolete producer.',
        terminal_reason:'producer_mismatch', checked_at:new Date().toISOString(),
      },200,{'Cache-Control':'private, max-age=30'});
      result.producer = {run_id:row.scan_run_id,attempt:row.run_attempt,status:run.status,conclusion:run.conclusion,url:`https://github.com/${repository.full_name}/actions/runs/${row.scan_run_id}/attempts/${row.run_attempt}`};
      const producerJobs=await pages(`repos/${repository.full_name}/actions/runs/${row.scan_run_id}/jobs?filter=latest`,'jobs',appToken);
      const progress=new Map((row.channel_statuses||[]).map(value=>[value.channel,{...value,status:String(value.status||'unknown').toLowerCase()}]));
      for(const value of channelProgress(row.execution_channels||row.requested_channels,producerJobs,run.status))progress.set(value.channel,value);
      for(const channel of row.requested_channels||[])if(!progress.has(channel))progress.set(channel,{channel,status:'preparing'});
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
    if (run.path?.split('@')[0] !== '.github/workflows/code-analysis-coordinator.yml') throw new Failure(404, 'Not an application analysis run.', 'not_found');
    return json({run_id:run.id,status:run.status,conclusion:run.conclusion,attempt:run.run_attempt,checked_at:new Date().toISOString()});
  }

  if (request.method === 'POST' && url.pathname === '/api/project-launch') {
    const input = await requestBody();
    const {repository,configuration} = await context('pull');
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
    const selection = current.selection;
    const checkoutRepository=current.pr_context?.head_repository||source.full_name;
    const checkoutRepositoryId=current.pr_context?.head_repository_id||source.id;
    const intent = {schema_version:'analysis-request-v4',request_id:requestId,execution_repository_id:repository.id,project_id:project.id,source_repository:source.full_name,source_repository_id:source.id,selection,resolved_selection:{repository:checkoutRepository,repository_id:checkoutRepositoryId,kind:'commit',ref:targetSha},source_sha:targetSha,target_sha:targetSha,pr_context:current.pr_context,requested_channels:[...input.requested_channels].sort(),tooling_sha:current.tooling_sha,profile_digest:current.profile_digest,profile_mode:project.profile?.mode==='portable'?'portable':'agentic-soc',analysis_key:{project_id:String(project.id),source_repository_id:source.id,target_sha:targetSha,tooling_sha:current.tooling_sha,profile_digest:current.profile_digest},actor_id:actor.id,idempotency_key:input.idempotency_key.toLowerCase(),run_again:input.run_again===true,preview_id:preview.preview_id,created_at:new Date().toISOString()};
    const admittedBody=await admit(intent);
    return json({status:'preparing',lifecycle:'Preparing',request_id:admittedBody.request_id||requestId,run_id:null,repository:repository.full_name,source_repository:source.full_name,target_sha:targetSha,requested_channels:intent.requested_channels,duplicate:admittedBody.duplicate===true,wake_status:admittedBody.wake_status},202);
  }

  return null;
}
