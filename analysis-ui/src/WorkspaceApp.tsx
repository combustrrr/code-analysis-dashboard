import {getProjectRegistry,markProjectPreparing} from './projectRegistry';
import {EVIDENCE_REFRESH_EVENT,invalidateEvidenceCaches} from './evidenceRefresh';
import { applicationEndpoint, repositoryJson } from './repositoryReports';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Collapse, ConfigProvider, Drawer, Empty, Grid, Input, Progress, Select, Space, Table, Tabs, Tag, message } from './ui';
import { SearchOutlined } from './icons';
import './style.css';
import './workspace.css';
import { useLaunchAuth } from './useLaunchAuth';
import { safeGithubUrl } from './safeUrls';
import type { ProjectRunRequest } from './ProjectRunTracker';
import {navigateAppHash,parseAppRoute,routeHash,type IssueRouteFilters,type ProjectView} from './appRoutes';
import {AppShell} from './AppShell';
import {displayFindingMessage,displayRuleId,isCompleteChannelStatus,plainAnalysisIssue} from './analysisPresentation';
import {RevisionRibbon} from './RevisionRibbon';
import {buildFindingIndex,filterFindingIndex} from './findingIndex';
import {MultiValuePicker} from './PathMultiPicker';
import {useWorkspacePreferences,type DefaultIssueGrouping} from './Appearance';

const ProjectLauncher=React.lazy(()=>import('./ProjectLauncher').then(module=>({default:module.ProjectLauncher})));
const ProjectRunTracker=React.lazy(()=>import('./ProjectRunTracker').then(module=>({default:module.ProjectRunTracker})));
const Settings=React.lazy(()=>import('./Settings').then(module=>({default:module.Settings})));
const OverviewTab=React.lazy(()=>import('./workspace-tabs/OverviewTab'));
const IssuesTab=React.lazy(()=>import('./workspace-tabs/IssuesTab'));
const CoverageTab=React.lazy(()=>import('./workspace-tabs/CoverageTab'));
const ReportsTab=React.lazy(()=>import('./workspace-tabs/ReportsTab'));
const ProgressTab=React.lazy(()=>import('./workspace-tabs/ProgressTab'));

type Target = { scan_run_id?: number; run_attempt?: number; tooling_sha?: string; lifecycle_status?: string; id: string; label: string; repository: string; source_repository: string; head_sha: string; kind: string; branch: string; pr?: number; base_branch?: string; base_sha?: string; checked_at: string; status: string; report?: string; error?: string; audit_bundle?:{asset:string;bytes:number;sha256:string} };
type Index = { report_storage?: {compressed_bytes:number}; publishing_repository?: string; launch_endpoint?: string; source_repository?: string; analysis_default_branch?: string; metrics?: {site_bytes: number; site_limit_bytes: number; queued?: number; scanning?: number}; schema_version: string; checked_at: string; targets: Target[]; preferred_branch: string; analysis_repository: string; current_overlay?: {overlay_key:string;status:string;head_sha:string;checked_at?:string;pr_context:{number:number;title?:string;draft?:boolean;head_repository:string;head_branch:string;base_repository:string;base_branch:string;base_sha:string};channel:{status:string;reason?:string}}; discovery_error?: string; publication_error?: string };
type AnnotationMeta={source?:string;level?:string;workflow?:string;run_id?:number;run_attempt?:number;job?:string;step?:string|null;check_run_id?:number;policy?:string;contributes_to_needs_attention?:boolean;run_url?:string;check_url?:string;file_url?:string;correlation?:{status?:string;finding_id?:string|null;scanner?:string|null}};
type Finding = { id: string; severity: string; category?: string; message: string; file: string; line: number; scanners: string[]; rules: string[]; observation_count?: number; scanner_family_count?: number; page: number; annotation?:AnnotationMeta };
type Detail = Finding & { origins: { scanner_family: string; rule: string; file: string; start_line: number; raw_artifact: string; observation_id: string }[]; source: string | null; source_start: number; source_url: string | null };
type Channel = { channel: string; name: string; class: string; status: string; findings: number | null; observation_count: number; reason: string; workflow: string };
type Report = { tooling_sha?: string; producer_run_attempt?: number; analyzed_sha: string; generated_at: string; report_generation_timestamp?: string; status: string; finding_count: number; observation_count: number; channels: Channel[]; severities: Record<string, number>; producer_runs: { id: string; url: string }[]; publication_gate: { satisfied: boolean } };
type CountEntry={label:string;count:number};
type ProjectOverview={schema_version:'project-overview-v1';analyzed_sha:string;generated_at:string;findings:{total:number;observations:number;critical:number;high:number;located:number};coverage:{completed:number;total:number;publication_gate_satisfied:boolean;incomplete_channels:string[]};distributions:{severity:CountEntry[];category:CountEntry[];scanner:CountEntry[];rule:CountEntry[];directory:CountEntry[];scanner_overlap:CountEntry[]};priority_findings:Finding[];investigation_clusters:{rule:string;directory:string;finding_count:number;file_count:number;finding_ids:string[]}[]};
type FindingsCatalog={schema_version:'findings-catalog-v1';total:number;page_size:number;pages:number};
type FindingLocator={id:string;detail_page:number};
type RegistryProject = {id:string;source_repository:string;preferred_branch:string;preferred_branch_head_sha?:string|null;current_report?:{analyzed_sha?:string;generated_at?:string;status?:string}|null};
type Registry = {can_launch:boolean;can_configure:boolean;projects:RegistryProject[]};
type PrOverlay = {overlay_key:string;head_sha:string;checked_at:string;pr_context:{number:number;title?:string;draft?:boolean;head_repository:string;head_branch:string;base_repository:string;base_branch:string;base_sha:string};channel:{status:string;reason?:string};advisories:{stable_id?:string;severity?:string;message?:string;title?:string;file?:string;start_line?:number}[]};
const states: Record<string, string> = { current: 'Up to date', partial: 'Partial analysis', queued: 'Queued', scanning: 'Running scanners', running: 'Running scanners', collecting: 'Collecting results', publishing: 'Publishing report', stale: 'Newer revision pending', failed: 'Analysis failed', temporarily_unavailable: 'Temporarily unavailable', NOT_AVAILABLE: 'Unavailable', NOT_APPLICABLE: 'Not assessed', DEFERRED: 'Not assessed' };
const ranks: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4, UNKNOWN: 5 };
async function json<T>(path: string, signal?: AbortSignal): Promise<T> {
  return repositoryJson<T>(path, signal);
}
const DEFAULT_EXECUTION_REPOSITORY=import.meta.env.VITE_DEFAULT_EXECUTION_REPOSITORY||'combustrrr/code-analysis-dashboard';
function route() {const value=parseAppRoute();if(value.kind==='project')return{repository:DEFAULT_EXECUTION_REPOSITORY,project:value.projectId,target:value.target||'',tab:value.view,section:'',issue:value.issue||'',requestId:'',filters:(value.filters||{}) as IssueRouteFilters};if(value.kind==='project-run')return{repository:DEFAULT_EXECUTION_REPOSITORY,project:value.projectId,target:'',tab:'run',section:'',issue:'',requestId:'',filters:{} as IssueRouteFilters};if(value.kind==='project-progress')return{repository:DEFAULT_EXECUTION_REPOSITORY,project:value.projectId,target:'',tab:'progress',section:'',issue:'',requestId:value.requestId||'',filters:{} as IssueRouteFilters};if(value.kind==='settings')return{repository:'',project:value.projectId||'',target:'',tab:'settings',section:value.section,issue:'',requestId:'',filters:{} as IssueRouteFilters};return{repository:'',project:'',target:'',tab:value.kind,section:'',issue:'',requestId:'',filters:{} as IssueRouteFilters};}
function isRepositoryAvailabilityError(value: string) { return /retired|unsupported|not supported|project is unavailable|private reports are not supported/i.test(value); }
const PROJECT_RUNS_STORAGE_KEY = 'analysis-project-runs';
const ACTIVE_PROJECT_RUN_PHASES = new Set(['preparing', 'queued', 'running', 'scanning', 'analyzing', 'collecting', 'publishing']);
function readProjectRuns(): ProjectRunRequest[] { try { const value = JSON.parse(sessionStorage.getItem(PROJECT_RUNS_STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function navigate(target: string, tab: ProjectView, issue = '',filters?:IssueRouteFilters) { const current = route(); if(!current.project)return;const changesIssueCanvas=tab==='issues'&&current.tab==='issues'&&Boolean(issue)!==Boolean(current.issue);navigateAppHash(routeHash({kind:'project',projectId:current.project,target:target||undefined,view:tab,issue:issue||undefined,filters}),{preserveScroll:!changesIssueCanvas}); }
function date(s?: string) { return s ? new Date(s).toLocaleString() : 'Unavailable'; }
const colors: Record<string, string> = { CRITICAL: 'red', HIGH: 'volcano', MEDIUM: 'gold', LOW: 'blue', INFO: 'default', current: 'green', partial: 'orange', failed: 'red', scanning: 'blue', COMPLETED: 'green', CONFIGURED_COMPLETE: 'green', POLICY_FINDINGS: 'orange', NOT_AVAILABLE: 'orange', FAILED: 'red' };
function Badge({ value }: { value: string }) { return <Tag className={`status-tag status-${value}`} color={colors[value]}>{states[value] || value.replaceAll('_', ' ')}</Tag>; }
function directoryOf(file: string) { return file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '(root)'; }
function filterValues(value?:string|string[]) { return Array.isArray(value)?value:value?[value]:[]; }
type Relation = { label: string; reason: string; findings: Finding[] };
const chartColors = ['#D91668', '#D94F63', '#D89A3D', '#5B7DD1', '#28B8D3', '#7D9BC3'];
function DonutChart({ values, label, center, onSelect }: { values: { label: string; value: number; color?: string }[]; label: string; center: string; onSelect?:(label:string)=>void }) {
  const total = values.reduce((sum, item) => sum + item.value, 0); let offset = 0;
  return <div className="donut-layout"><svg className="donut" viewBox="0 0 42 42" role="img" aria-label={label}><circle className="donut-track" cx="21" cy="21" r="15.9155" fill="none" strokeWidth="6"/>{total > 0 && values.map((item, index) => { const share = item.value / total * 100; const start = offset; offset += share; return <circle key={item.label} cx="21" cy="21" r="15.9155" fill="none" stroke={item.color || chartColors[index]} strokeWidth="6" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={25 - start}/>; })}<text x="21" y="20" textAnchor="middle">{center}</text><text className="donut-caption" x="21" y="25" textAnchor="middle">findings</text></svg><div className="chart-legend">{values.filter(v => v.value).map((item, i) => <button type="button" disabled={!onSelect} onClick={()=>onSelect?.(item.label)} key={item.label}><i style={{ background: item.color || chartColors[i] }}/><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong></button>)}</div></div>;
}
function FindingBars({values,onSelect,label='Finding counts by severity'}:{values:{label:string;value:number;color:string}[];onSelect?:(label:string)=>void;label?:string}){
 const max=Math.max(1,...values.map(item=>item.value));
 return <div className="finding-bars" aria-label={label}>{values.map(item=><button type="button" disabled={!onSelect} onClick={()=>onSelect?.(item.label)} className="finding-bar" key={item.label}><span>{item.label}</span><div className="finding-bar-track"><i style={{width:`${item.value/max*100}%`,background:item.color}}/></div><strong>{item.value.toLocaleString()}</strong></button>)}</div>;
}

function Evidence({ detail, source, error, findings, openFinding }: { detail?: Detail; source: string[]; error: string; findings: Finding[]; openFinding: (id: string) => void }) {
  const related = useMemo<Relation[]>(() => {
    if (!detail) return [];
    const others = findings.filter(f => f.id !== detail.id);
    const relations = [
      { label: 'Same rule or concept', reason: detail.rules.join(', '), findings: others.filter(f => f.rules.some(rule => detail.rules.includes(rule))) },
      { label: 'Same file', reason: detail.file, findings: others.filter(f => f.file === detail.file) },
      { label: 'Same directory', reason: directoryOf(detail.file), findings: others.filter(f => directoryOf(f.file) === directoryOf(detail.file)) },
      { label: 'Same scanner', reason: detail.scanners.join(', '), findings: others.filter(f => f.scanners.some(scanner => detail.scanners.includes(scanner))) },
    ];
    return relations.filter(r => r.findings.length);
  }, [detail, findings]);
  return <div className="evidence-content">{detail ? <><Badge value={detail.severity}/><h2>{detail.message}</h2><div className="issue-evidence-map" aria-label="Finding evidence map"><div><span>Source location</span><strong>{detail.file}:{detail.line}</strong></div><div><span>Reported by</span><strong>{detail.scanners.join(', ')||'Scanner unavailable'}</strong></div><div><span>Rules applied</span><strong>{detail.rules.join(', ')||'Rule unavailable'}</strong></div><div><span>Observations</span><strong>{detail.origins.length.toLocaleString()}</strong></div></div><Space className="issue-utilities" wrap>{safeGithubUrl(detail.source_url)&&<Button type="primary" size="small" href={safeGithubUrl(detail.source_url)} target="_blank" rel="noreferrer">Open code on GitHub</Button>}<Button size="small" onClick={()=>navigator.clipboard?.writeText(`${detail.file}:${detail.line}`)}>Copy source path</Button>{detail.rules[0]&&<Button size="small" onClick={()=>navigator.clipboard?.writeText(detail.rules[0])}>Copy rule ID</Button>}{safeGithubUrl(detail.source_url)&&<Button size="small" onClick={()=>navigator.clipboard?.writeText(safeGithubUrl(detail.source_url)!)}>Copy immutable link</Button>}<Button size="small" onClick={()=>navigator.clipboard?.writeText(`[${detail.severity}] ${detail.message}\n${detail.file}:${detail.line}\nScanner: ${detail.scanners.join(', ')}\nRule: ${detail.rules.join(', ')||'Unavailable'}`)}>Copy evidence summary</Button></Space>
          {detail.annotation&&<section className="explanation-block workflow-annotation-detail"><h3>Workflow annotation provenance</h3><p>{detail.annotation.source||'GitHub Actions'} observation from <strong>{detail.annotation.workflow||'workflow'}</strong>, run {detail.annotation.run_id||'unknown'} attempt {detail.annotation.run_attempt||'unknown'}, job <strong>{detail.annotation.job||'unknown'}</strong>, step {detail.annotation.step||'not supplied by GitHub'}.</p><p>Level: <strong>{detail.annotation.level||'unknown'}</strong>. Policy: <strong>{detail.annotation.policy||'advisory'}</strong>. Correlation: <strong>{detail.annotation.correlation?.status||'unmatched'}</strong>{detail.annotation.correlation?.scanner?` with ${detail.annotation.correlation.scanner}`:''}.</p><Space wrap>{safeGithubUrl(detail.annotation.run_url)&&<Button href={safeGithubUrl(detail.annotation.run_url)} target="_blank" rel="noopener noreferrer">Open trusted run</Button>}{safeGithubUrl(detail.annotation.check_url)&&<Button href={safeGithubUrl(detail.annotation.check_url)} target="_blank" rel="noopener noreferrer">Open trusted check</Button>}{safeGithubUrl(detail.annotation.file_url)&&<Button href={safeGithubUrl(detail.annotation.file_url)} target="_blank" rel="noopener noreferrer">Open immutable file</Button>}</Space></section>}
          <section className="explanation-block"><h3>Why this was reported</h3><p><strong>{detail.scanners.join(', ')}</strong> emitted {detail.rules.length ? <>rule <code>{detail.rules.join(', ')}</code></> : 'a finding'} at this source location. The message above is the scanner's retained explanation.</p><Alert type="info" showIcon title="Detected condition, not a proven root cause" description="Start with the highlighted code, then inspect its inputs, callers, configuration, and repeated uses before changing it. Similar findings below can reveal whether the condition is local or systematic."/></section>
          <section className="source-evidence"><h3>Code at the reported location</h3><p>The highlighted line is the exact location retained by the scanner. Review nearby control flow before changing it.</p>{source.length ? <div className="source-editor" aria-label={`Read-only source context for ${detail.file}`}><header><div><i aria-hidden="true"/><i aria-hidden="true"/><i aria-hidden="true"/></div><code>{detail.file}</code><span>Line {detail.line} · Read only</span></header><pre className="source">{source.slice(Math.max(0, detail.line - 6), Math.max(0, detail.line - 6) + 16).map((line, i) => <div key={i} className={Math.max(1, detail.line - 5) + i === detail.line ? 'highlight' : ''}><span>{Math.max(1, detail.line - 5) + i}</span>{line}</div>)}</pre></div> : <p>Source preview unavailable or withheld. Use the immutable GitHub source link when available.</p>}</section>
          <h3>Supporting observations</h3><p>These retained observations identify which scanner and rule produced the issue.</p>{detail.origins.map(o => <div className="origin" key={o.observation_id}><strong>{o.scanner_family} | {o.rule}</strong><small>{o.file}:{o.start_line}</small><small>Observation: {o.observation_id}</small><small>Artifact: {o.raw_artifact || 'Unavailable'}</small></div>)}
          <section className="relationships"><h3>Related findings</h3><p>Relationships are derived from the current report's scanner, rule, and source paths. They do not imply a shared defect.</p>{related.length ? related.map(relation => <div className="relation" key={relation.label}><div><strong>{relation.label}</strong><small>{relation.reason} · {relation.findings.length.toLocaleString()} related</small></div>{relation.findings.slice(0, 4).map(f => <Button type="link" className="related-finding" key={f.id} onClick={() => openFinding(f.id)}><Badge value={f.severity}/><span>{f.message}</span><small>{f.file}:{f.line}</small></Button>)}</div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No relationships found in the current report"/>}</section>
        </> : <Empty description={error || 'Issue evidence is unavailable or still loading…'}/>}</div>;
}

export function WorkspaceApp({viewerAuth}:{viewerAuth?:ReturnType<typeof useLaunchAuth>}) {
  const screens = Grid.useBreakpoint();
  const [projectRuns, setProjectRuns] = useState<ProjectRunRequest[]>(readProjectRuns);
  const projectRunsRef = useRef(projectRuns);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastRefresh, setLastRefresh] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [hostAccess,setHostAccess]=useState<{can_launch:boolean;can_configure:boolean}>({can_launch:false,can_configure:false});
  const [registryProjects,setRegistryProjects]=useState<RegistryProject[]>([]);
  useEffect(()=>{const refresh=()=>setRefreshTick(t=>t+1);window.addEventListener(EVIDENCE_REFRESH_EVENT,refresh);return()=>window.removeEventListener(EVIDENCE_REFRESH_EVENT,refresh);},[]);
  const [selectedDirectories, setSelectedDirectories] = useState<string[]>([]);
  const [annotationSources,setAnnotationSources]=useState<string[]>([]),[workflows,setWorkflows]=useState<string[]>([]),[jobs,setJobs]=useState<string[]>([]),[annotationLevels,setAnnotationLevels]=useState<string[]>([]),[correlatedScanners,setCorrelatedScanners]=useState<string[]>([]);
  const [selectedRules,setSelectedRules]=useState<string[]>([]); const [files,setFiles]=useState<string[]>([]); const [locationFilter,setLocationFilter]=useState(''); const [overlap,setOverlap]=useState('');
   const [index, setIndex] = useState<Index>(); const [error, setError] = useState(''); const [r, setRoute] = useState(route());
   const [currentOverlay,setCurrentOverlay]=useState<PrOverlay>(); const [overlayError,setOverlayError]=useState('');
   const refreshSequence = useRef(0);
  const [report, setReport] = useState<Report>(); const [overview,setOverview]=useState<ProjectOverview>(); const [findings, setFindings] = useState<Finding[]>([]); const findingsRef=useRef(findings);findingsRef.current=findings; const [detail, setDetail] = useState<Detail>(); const [source, setSource] = useState<string[]>([]);
  const [findingsCatalog,setFindingsCatalog]=useState<FindingsCatalog>();const [catalogReady,setCatalogReady]=useState(false);const [catalogLoading,setCatalogLoading]=useState(false);
  const issueDetailRef=useRef<HTMLElement>(null),returnFindingRef=useRef(''),previousIssueRef=useRef('');
  const {issueGrouping}=useWorkspacePreferences();
  const [query, setQuery] = useState(''); const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]); const [selectedCategories,setSelectedCategories]=useState<string[]>([]); const [selectedScanners, setSelectedScanners] = useState<string[]>([]); const [groupBy, setGroupBy] = useState(issueGrouping); const [moreFilters,setMoreFilters]=useState(false); const [page, setPage] = useState(0); const [loading, setLoading] = useState(false);
    useEffect(() => {
      const sequence = ++refreshSequence.current;
      const c = new AbortController();
      const refresh = () => json<Index>('data/index.json', c.signal).then(value => { if (sequence !== refreshSequence.current) return; setIndex(value); setError(''); setLastRefresh(new Date().toISOString()); }).catch(e => { if (e.name !== 'AbortError' && sequence === refreshSequence.current) { setIndex(undefined); setError(e.message); } }).finally(()=>{ if (sequence === refreshSequence.current) setRefreshing(false); });
      const change = () => setRoute(route());
      let timer: number | undefined;
      if (r.repository && r.project) {
        refresh(); timer = window.setInterval(refresh, 5*60*1000);
      } else if (r.tab === 'repositories' && !r.repository && !applicationEndpoint) {
        json<Index>('data/index.json', c.signal).then(value => { if (sequence === refreshSequence.current) { setIndex(value); setError(''); } }).catch(e => { if (e.name !== 'AbortError' && sequence === refreshSequence.current) { setIndex(undefined); setError(e.message); } });
      } else {
        setIndex(undefined); setError(''); setLastRefresh(''); setRefreshing(false);
      }
     window.addEventListener('hashchange', change);
      return () => { c.abort(); if (timer !== undefined) window.clearInterval(timer); window.removeEventListener('hashchange', change); };
    }, [refreshTick, r.repository, r.project]);
   useEffect(()=>{
     setCurrentOverlay(undefined);setOverlayError('');
     if(!r.repository||!r.project||!index?.current_overlay?.overlay_key)return;
     const c=new AbortController();
     json<PrOverlay>('data/current-overlay/pr-overlay.json',c.signal).then(value=>{if(value.overlay_key===index.current_overlay?.overlay_key)setCurrentOverlay(value);})
       .catch(reason=>{if(reason.name!=='AbortError')setOverlayError(reason.message);});
     return()=>c.abort();
   },[r.repository,r.project,index?.current_overlay?.overlay_key,index?.current_overlay?.checked_at]);
  const localAuth = useLaunchAuth(applicationEndpoint || index?.launch_endpoint, !viewerAuth);
  const launchAuth = viewerAuth || localAuth;
  const mayLaunch = viewerAuth ? hostAccess.can_launch : import.meta.env.VITE_APPLICATION_MODE !== 'repositories' || hostAccess.can_launch;
  useEffect(()=>{
    let active=true;
    setHostAccess({can_launch:false,can_configure:false});
    setRegistryProjects([]);
    if(!launchAuth.session)return;
    const load=(force=false)=>getProjectRegistry<Registry>(launchAuth,force).then(value=>{if(active){setHostAccess(value);setRegistryProjects(value.projects||[]);}}).catch(()=>{});
    const visible=()=>{if(document.visibilityState==='visible')void load(true);};
    void load();document.addEventListener('visibilitychange',visible);window.addEventListener(EVIDENCE_REFRESH_EVENT,visible);
    return()=>{active=false;document.removeEventListener('visibilitychange',visible);window.removeEventListener(EVIDENCE_REFRESH_EVENT,visible);};
  },[launchAuth.session?.token]);
  const registryProject=registryProjects.find(project=>String(project.id)===String(r.project));
  const newestTarget=index?.targets.find(t => t.kind === 'branch' && t.branch === index.preferred_branch) || index?.targets[0];
  const target = index?.targets.find(t => t.id === r.target) || newestTarget;
  useEffect(()=>{if(r.target&&index&&!index.targets.some(item=>item.id===r.target)&&newestTarget)navigate(newestTarget.id,['issues','coverage','report'].includes(r.tab)?r.tab as ProjectView:'overview');},[r.target,r.tab,index,newestTarget?.id]);
  useEffect(() => {
    if (r.tab === 'repositories' && !r.repository) {
      try { sessionStorage.removeItem('analysis-workspace-requested'); } catch {}
    }
  }, [r.tab, r.repository]);
  const persistProjectRuns = (next: ProjectRunRequest[]) => {
    projectRunsRef.current = next;
    setProjectRuns(next);
    try { sessionStorage.setItem(PROJECT_RUNS_STORAGE_KEY, JSON.stringify(next)); } catch {}
  };
  const handleProjectSubmitted = (request: ProjectRunRequest) => {
    const run = {
      ...request,
      previousReport: request.previousReport || target?.report,
      previousTargetLabel: request.previousTargetLabel || target?.label || target?.branch || (target?.kind === 'pr' ? `PR #${target.pr}` : target?.id),
      previousAnalyzedSha: request.previousAnalyzedSha || report?.analyzed_sha,
      previousGeneratedAt: request.previousGeneratedAt || report?.generated_at,
    };
    persistProjectRuns([...projectRunsRef.current.filter(item => item.project !== run.project), run]);
    markProjectPreparing(run.project,run.request_id,run.target_sha);
    window.dispatchEvent(new Event(EVIDENCE_REFRESH_EVENT));
  };
  const updateProjectRunPhase = (requestId: string, phase: string) => {
    const current = projectRunsRef.current;
    const next = current.map(item => item.request_id === requestId ? { ...item, phase } : item);
    if (next.some((item, index) => item.phase !== current[index]?.phase)) persistProjectRuns(next);
  };
  const dismissProjectRun = (requestId: string) => persistProjectRuns(projectRunsRef.current.filter(item => item.request_id !== requestId));
  const openProjectRunReport = (request: ProjectRunRequest, targetId: string) => {
    navigateAppHash(routeHash({kind:'project',projectId:request.project,target:targetId,view:'report'}));
  };
  const projectRunCandidates = projectRuns.filter(request => request.project === r.project).sort((a,b)=>Date.parse(b.submittedAt)-Date.parse(a.submittedAt));
  const authoritativeProjectRun = r.tab==='progress'&&r.requestId?projectRunCandidates.find(request=>request.request_id===r.requestId):projectRunCandidates[0];
  const projectRunTrackers = authoritativeProjectRun?[<ProjectRunTracker key={authoritativeProjectRun.request_id} auth={launchAuth} request={authoritativeProjectRun} autoOpenOnPublished={r.tab==='progress'} onPhase={updateProjectRunPhase} onDismiss={() => dismissProjectRun(authoritativeProjectRun.request_id)} onOpenReport={id => openProjectRunReport(authoritativeProjectRun, id)}/>]:[];
  const activeProjectRun = authoritativeProjectRun&&(!authoritativeProjectRun.phase||ACTIVE_PROJECT_RUN_PHASES.has(authoritativeProjectRun.phase))?authoritativeProjectRun:undefined;
  const completedProjectRun=authoritativeProjectRun&&['published','reused'].includes(authoritativeProjectRun.phase||'')?authoritativeProjectRun:undefined;
  const failedProjectRun=authoritativeProjectRun&&['failed','cancelled_cutover'].includes(authoritativeProjectRun.phase||'')?authoritativeProjectRun:undefined;
  const bannerProjectRun=activeProjectRun||completedProjectRun||failedProjectRun;
  useEffect(() => { setReport(undefined); setOverview(undefined); setFindings([]); setFindingsCatalog(undefined); setCatalogReady(false); setCatalogLoading(false); setDetail(undefined); setSource([]); setPage(0); setError(''); setLoading(false); }, [target?.id, target?.report]);
  useEffect(() => {
    if (!target?.report || r.tab!=='coverage') return;
    const c = new AbortController(); setLoading(true); json<Report>(`data/${target.report}/coverage.json`, c.signal).catch(()=>json<Report>(`data/${target.report}/report.json`,c.signal)).then(setReport).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!c.signal.aborted) setLoading(false); }); return () => c.abort();
  }, [r.tab, target?.id, target?.report]);
  useEffect(()=>{if(!['overview','issues','report'].includes(r.tab)||!target?.report)return;const c=new AbortController();setLoading(true);json<ProjectOverview>(`data/${target.report}/project-overview.json`,c.signal).then(value=>{if(value.schema_version==='project-overview-v1')setOverview(value);}).catch(()=>{Promise.all([json<Finding[]>(`data/${target.report}/findings.json`,c.signal),json<Report>(`data/${target.report}/report.json`,c.signal)]).then(([legacyFindings,legacyReport])=>{setFindings(legacyFindings);setReport(legacyReport)}).catch(()=>{});}).finally(()=>{if(!c.signal.aborted)setLoading(false)});return()=>c.abort();},[r.tab,target?.id,target?.report]);
  useEffect(()=>{if(r.tab!=='issues'||r.issue||!target?.report)return;const c=new AbortController();(async()=>{try{const catalog=await json<FindingsCatalog>(`data/${target.report}/findings-catalog.json`,c.signal);if(catalog.schema_version!=='findings-catalog-v1'||catalog.pages<0||catalog.pages>1000)throw new Error('Invalid findings catalog');setFindingsCatalog(catalog);if(!catalog.pages){setFindings([]);setCatalogReady(true);return;}setFindings(await json<Finding[]>(`data/${target.report}/findings-pages/0.json`,c.signal));setCatalogReady(catalog.pages===1);}catch{try{setFindings(await json<Finding[]>(`data/${target.report}/findings.json`,c.signal));setCatalogReady(true);}catch(e){if(e instanceof Error&&e.name!=='AbortError')setError(e.message);}}})();return()=>c.abort();},[r.tab,r.issue,target?.id,target?.report]);
  useEffect(() => { setDetail(undefined); setSource([]); if (!r.issue || !target?.report) return; const c = new AbortController();
    const load=async()=>{let detailPage:number|undefined;try{const suffix=r.issue.includes(':')?r.issue.slice(r.issue.lastIndexOf(':')+1):r.issue;const bucket=/^[0-9a-f]/i.test(suffix)?suffix[0].toLowerCase():'other';const locators=await json<FindingLocator[]>(`data/${target.report}/finding-locators/${bucket}.json`,c.signal);detailPage=locators.find(row=>row.id===r.issue)?.detail_page;}catch{detailPage=findings.find(row=>row.id===r.issue)?.page;}if(detailPage===undefined)return;const rows=await json<Detail[]>(`data/${target.report}/details/${detailPage}.json`,c.signal);const d=rows.find(row=>row.id===r.issue);setDetail(d);if(d?.source)setSource(await json<string[]>(`data/${target.report}/${d.source}`,c.signal));};
    load().catch(e => { if (e.name !== 'AbortError') setError(e.message); }); return () => c.abort();
  }, [r.issue, findings, target?.report]);
  const locationOf=(finding:Finding)=>finding.file&&finding.line>0?`${finding.file}#L${finding.line}`:'';
  const findingIndex=useMemo(()=>buildFindingIndex(findings),[findings]);
  const filtered = useMemo(() => filterFindingIndex(findingIndex,{directory:selectedDirectories,rule:selectedRules,file:files,location:locationFilter?[locationFilter]:[],overlap:overlap?[overlap]:[],severity:selectedSeverities,category:selectedCategories,scanner:selectedScanners,annotationSource:annotationSources,workflow:workflows,job:jobs,annotationLevel:annotationLevels,correlatedScanner:correlatedScanners},{query}).sort((a, b) => (ranks[a.severity] ?? 9) - (ranks[b.severity] ?? 9) || a.file.localeCompare(b.file)), [findingIndex, query, selectedSeverities, selectedCategories, selectedScanners, selectedDirectories, selectedRules, files, locationFilter, overlap, annotationSources, workflows, jobs, annotationLevels, correlatedScanners]);
  const issueOptions = useMemo(()=>({rules:[...new Set(findings.flatMap(f=>f.rules))].sort(),categories:[...new Set(findings.map(f=>f.category||'Uncategorized'))].sort(),files:[...new Set(findings.map(f=>f.file).filter(Boolean))].sort(),directories:[...new Set(findings.map(f=>directoryOf(f.file)))].sort(),locations:[...new Set(findings.map(locationOf).filter(Boolean))].sort(),annotationSources:[...new Set(findings.map(f=>f.annotation?.source).filter((v):v is string=>!!v))].sort(),workflows:[...new Set(findings.map(f=>f.annotation?.workflow).filter((v):v is string=>!!v))].sort(),jobs:[...new Set(findings.map(f=>f.annotation?.job).filter((v):v is string=>!!v))].sort(),annotationLevels:[...new Set(findings.map(f=>f.annotation?.level).filter((v):v is string=>!!v))].sort(),correlatedScanners:[...new Set(findings.map(f=>f.annotation?.correlation?.scanner).filter((v):v is string=>!!v))].sort()}),[findings]);
  const loadCompleteCatalog=async()=>{if(!target?.report||!findingsCatalog||catalogReady||catalogLoading)return;setCatalogLoading(true);try{const pages=await Promise.all(Array.from({length:Math.max(0,findingsCatalog.pages-1)},(_,index)=>json<Finding[]>(`data/${target.report}/findings-pages/${index+1}.json`)));setFindings(current=>[...current,...pages.flat()]);setCatalogReady(true);}catch(e){setError(e instanceof Error?e.message:'The complete findings catalog is temporarily unavailable.');}finally{setCatalogLoading(false);}};
  const resetFilters=()=>{setQuery('');setSelectedSeverities([]);setSelectedCategories([]);setSelectedScanners([]);setSelectedDirectories([]);setSelectedRules([]);setFiles([]);setLocationFilter('');setOverlap('');setAnnotationSources([]);setWorkflows([]);setJobs([]);setAnnotationLevels([]);setCorrelatedScanners([]);setGroupBy(issueGrouping);setPage(0);};
  useEffect(resetFilters,[r.repository,r.project,target?.id]);
  const grouped = useMemo(() => {
    if (groupBy === 'none') return [] as [string, Finding[]][];
    const groups = new Map<string, Finding[]>();
    filtered.forEach(f => { const key = groupBy === 'rule' ? f.rules[0] || 'No rule' : groupBy === 'scanner' ? f.scanners[0] || 'No scanner' : groupBy === 'file' ? f.file || 'No file' : groupBy==='category'?f.category||'Uncategorized':directoryOf(f.file); groups.set(key, [...(groups.get(key) || []), f]); });
    return [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [filtered, groupBy]);
  useEffect(() => setPage(0), [query, selectedSeverities, selectedCategories, selectedScanners, selectedDirectories, selectedRules, files, locationFilter, overlap]);
  useEffect(()=>{if(r.tab!=='issues')return;const filters=r.filters||{};setQuery(filters.query||'');setSelectedSeverities(filterValues(filters.severity));setSelectedCategories(filterValues(filters.category));setSelectedScanners(filterValues(filters.scanner));setSelectedRules(filterValues(filters.rule));setFiles(filters.files||[]);setSelectedDirectories(filterValues(filters.directory));setLocationFilter(filters.location||'');setOverlap(filters.overlap||'');setAnnotationSources(filterValues(filters.annotationSource));setWorkflows(filterValues(filters.workflow));setJobs(filterValues(filters.job));setAnnotationLevels(filterValues(filters.annotationLevel));setCorrelatedScanners(filterValues(filters.correlatedScanner));setGroupBy((filters.group as DefaultIssueGrouping)||issueGrouping);},[r.tab,r.filters,issueGrouping]);
  const fallbackDirectories = useMemo(() => {
    const counts = new Map<string, number>();
    findings.forEach(f => { const dir = f.file.includes('/') ? f.file.slice(0, f.file.lastIndexOf('/')) : '(root)'; counts.set(dir, (counts.get(dir) || 0) + 1); });
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [findings]);
  const fallbackSupport = useMemo(() => [1, 2, 3].map(n => ({ n, count: findings.filter(f => n === 3 ? new Set(f.scanners).size >= 3 : new Set(f.scanners).size === n).length })), [findings]);
  const fallbackCategories=useMemo(()=>{const counts=new Map<string,number>();findings.forEach(f=>{const value=f.category||'Uncategorized';counts.set(value,(counts.get(value)||0)+1);});return[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6);},[findings]);
  const fallbackScannerCounts=useMemo(()=>{const counts=new Map<string,number>();findings.forEach(f=>new Set(f.scanners).forEach(value=>counts.set(value,(counts.get(value)||0)+1)));return[...counts].sort((a,b)=>b[1]-a[1]).slice(0,7);},[findings]);
  const fallbackRuleCounts=useMemo(()=>{const counts=new Map<string,number>();findings.forEach(f=>(f.rules.length?f.rules:['Rule unavailable']).forEach(value=>counts.set(value,(counts.get(value)||0)+1)));return[...counts].sort((a,b)=>b[1]-a[1]).slice(0,7);},[findings]);
  const fallbackInvestigationCandidates = useMemo(() => {
    const clusters = new Map<string, { rule: string; directory: string; rows: Finding[]; score: number }>();
    findings.forEach(f => (f.rules.length ? f.rules : ['No rule']).forEach(rule => {
      const directory = directoryOf(f.file); const key = `${rule}\u0000${directory}`;
      const cluster = clusters.get(key) || { rule, directory, rows: [], score: 0 };
      cluster.rows.push(f); cluster.score += Math.max(1, 6 - (ranks[f.severity] ?? 5)); clusters.set(key, cluster);
    }));
    return [...clusters.values()].filter(c => c.rows.length > 1).sort((a, b) => b.score - a.score || b.rows.length - a.rows.length).slice(0, 5);
  }, [findings]);
  const directories=overview?.distributions.directory.map(row=>[row.label,row.count] as [string,number])||fallbackDirectories;
  const support=overview?.distributions.scanner_overlap.map(row=>({n:row.label.startsWith('3+')?3:Number.parseInt(row.label,10)||1,count:row.count}))||fallbackSupport;
  const categories=overview?.distributions.category.map(row=>[row.label,row.count] as [string,number])||fallbackCategories;
  const scannerCounts=overview?.distributions.scanner.map(row=>[row.label,row.count] as [string,number])||fallbackScannerCounts;
  const ruleCounts=overview?.distributions.rule.map(row=>[row.label,row.count] as [string,number])||fallbackRuleCounts;
  const priorityFindings=overview?.priority_findings||findings;
  const investigationCandidates=overview?.investigation_clusters||fallbackInvestigationCandidates.map(value=>({rule:value.rule,directory:value.directory,finding_count:value.rows.length,file_count:new Set(value.rows.map(row=>row.file)).size,finding_ids:value.rows.map(row=>row.id)}));
  useEffect(() => {
    if (!r.issue || !screens.lg) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') navigate(target?.id || '', 'issues'); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [r.issue, screens.lg, target?.id]);
  const overviewReport=useMemo<Report|undefined>(()=>overview?{
    analyzed_sha:overview.analyzed_sha,generated_at:overview.generated_at,report_generation_timestamp:overview.generated_at,
    status:overview.coverage.incomplete_channels.length?'partial':'complete',finding_count:overview.findings.total,observation_count:overview.findings.observations,
    channels:[...Array.from({length:overview.coverage.completed},(_,index)=>({channel:`completed-${index}`,name:'Completed scanner',class:'',status:'COMPLETED',findings:null,observation_count:0,reason:'',workflow:''})),...overview.coverage.incomplete_channels.map((name,index)=>({channel:`incomplete-${index}`,name,class:'',status:'NOT_AVAILABLE',findings:null,observation_count:0,reason:'See Coverage for details.',workflow:''}))],
    severities:Object.fromEntries(overview.distributions.severity.map(item=>[item.label,item.count])),producer_runs:[],publication_gate:{satisfied:overview.coverage.publication_gate_satisfied}
  }:undefined,[overview]);
  const workspaceReport=report||overviewReport;
  const fresh = !!workspaceReport && !!registryProject?.preferred_branch_head_sha && workspaceReport.analyzed_sha === registryProject.preferred_branch_head_sha;
  const coverageLimitations=workspaceReport?.channels.filter(c=>!isCompleteChannelStatus(c.status))||[];
  const completed = workspaceReport ? workspaceReport.channels.length-coverageLimitations.length : 0;
  const criticalCount=workspaceReport?.severities.CRITICAL||0;const highCount=workspaceReport?.severities.HIGH||0;
  const incompleteCount=coverageLimitations.length;
  const locatedCount=overview?.findings.located??findings.filter(f=>f.file&&f.line).length;
  const reviewObjective=criticalCount?'Validate critical findings before making a release decision.':highCount?'Triage high-severity findings and confirm whether they are reachable in production.':incompleteCount?'Close the scanner coverage gaps before treating this review as complete.':'Review the leading evidence clusters and record the engineering decision.';
  const issueRoute=(filters:IssueRouteFilters={},issue='')=>{if(!target)return;navigateAppHash(routeHash({kind:'project',projectId:r.project,target:target.id,view:'issues',issue:issue||undefined,filters}),{preserveScroll:true});};
  useEffect(()=>{
    if(r.tab!=='issues')return;
    const previous=previousIssueRef.current;
    previousIssueRef.current=r.issue;
    if(r.issue){
      returnFindingRef.current=r.issue;
      if(!screens.lg)return;
      const frame=window.requestAnimationFrame(()=>{issueDetailRef.current?.focus({preventScroll:true});issueDetailRef.current?.scrollIntoView({block:'start'});});
      return()=>window.cancelAnimationFrame(frame);
    }
    if(!previous)return;
    const id=returnFindingRef.current||previous,message=findingsRef.current.find(item=>item.id===id)?.message;
    const frame=window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{const candidates=Array.from(document.querySelectorAll<HTMLElement>('.issue-link,.related-finding'));const row=candidates.find(item=>item.classList.contains('issue-link')?item.textContent?.trim()===message:item.querySelector('span')?.textContent?.trim()===message)||document.getElementById('issues-title');row?.focus({preventScroll:true});row?.scrollIntoView({block:'nearest'});}));
    return()=>window.cancelAnimationFrame(frame);
  },[r.tab,r.issue,screens.lg]);
  useEffect(()=>{if(r.tab!=='issues'||!target)return;const timer=window.setTimeout(()=>{const current=parseAppRoute();if(current.kind!=='project'||current.view!=='issues'||(current.issue||'')!==(r.issue||''))return;const filters={query,severity:selectedSeverities,category:selectedCategories,scanner:selectedScanners,rule:selectedRules,files,directory:selectedDirectories,location:locationFilter,overlap,annotationSource:annotationSources,workflow:workflows,job:jobs,annotationLevel:annotationLevels,correlatedScanner:correlatedScanners,group:groupBy==='none'?'':groupBy};const next=routeHash({kind:'project',projectId:r.project,target:target.id,view:'issues',issue:r.issue||undefined,filters});if(location.hash!==next)history.replaceState(null,'',next);},50);return()=>window.clearTimeout(timer);},[r.tab,r.project,r.issue,target?.id,query,selectedSeverities,selectedCategories,selectedScanners,selectedRules,files,selectedDirectories,locationFilter,overlap,annotationSources,workflows,jobs,annotationLevels,correlatedScanners,groupBy]);
    if (!r.repository) {
      if(r.tab==='settings')return <ConfigProvider><AppShell auth={viewerAuth}><Settings auth={launchAuth} onRun={projectId=>location.hash=routeHash({kind:'project-run',projectId})}/></AppShell></ConfigProvider>;
      return null;
    }
    const awaitingManifest=!index&&!error;
    const awaitingTabEvidence=!!index&&!!target?.report&&!error&&(
      (r.tab==='coverage'&&!report)||
      (['overview','issues','report'].includes(r.tab)&&!workspaceReport)
    );
    if(awaitingManifest||awaitingTabEvidence)return <ConfigProvider><AppShell auth={viewerAuth}><main className="project-workspace project-workspace-loading" role="status" aria-label="Loading project evidence"><div className="workspace-project-skeleton" aria-hidden="true"><i/><i/><i/><i/></div></main></AppShell></ConfigProvider>;
    return <ConfigProvider><AppShell auth={viewerAuth}>
     {r.tab==='run'&&r.repository&&r.project&&<ProjectLauncher auth={launchAuth} repository={r.repository} project={r.project} preferredBranch={registryProject?.preferred_branch||index?.preferred_branch} canLaunch={mayLaunch} active={!!activeProjectRun} close={()=>navigateAppHash(routeHash({kind:'project',projectId:r.project,view:'overview'}))} onSubmitted={handleProjectSubmitted}/>}
    <main className="project-workspace">
      {r.tab==='progress' ? <React.Suspense fallback={<div className="workspace-tab-loading" role="status">Opening analysis progress…</div>}><ProgressTab>{projectRunTrackers.length?projectRunTrackers:undefined}</ProgressTab></React.Suspense> : <>
      {authoritativeProjectRun&&<div className="background-run-poller" aria-hidden="true">{projectRunTrackers}</div>}
      {bannerProjectRun&&<section className="analysis-progress-banner" aria-live="polite"><div><span className="eyebrow">{activeProjectRun?'ANALYSIS IN PROGRESS':completedProjectRun?'NEW ANALYSIS PUBLISHED':'ANALYSIS NEEDS ATTENTION'}</span><strong>{activeProjectRun?`New evidence is being prepared for ${activeProjectRun.target_sha?.slice(0,12)||activeProjectRun.ref}.`:completedProjectRun?'A verified report is ready. Switch when you are ready.':'The newer analysis stopped. The published report remains available.'}</strong><small>{activeProjectRun?'The published report remains available while scanners run.':completedProjectRun?'Your current report and review state have not been replaced.':'Open progress for the safe failure summary and GitHub Actions link.'}</small></div><Button href={routeHash({kind:'project-progress',projectId:r.project,requestId:bannerProjectRun.request_id})}>{activeProjectRun?'View live progress':completedProjectRun?'Switch to new revision':'View analysis details'}</Button></section>}
      <RevisionRibbon repository={registryProject?.source_repository||index?.source_repository||target?.repository||'Configured project'} target={target} targets={index?.targets||[]} fresh={fresh} statusLabel={workspaceReport?(workspaceReport.status==='partial'?'Partial':'Published'):'Unavailable'} coverage={workspaceReport?`${completed} of ${workspaceReport.channels.length}`:'Unavailable'} published={workspaceReport?.report_generation_timestamp||workspaceReport?.generated_at} repositoryHead={registryProject?.preferred_branch_head_sha||undefined} publishedRevision={workspaceReport?.analyzed_sha} onTarget={value=>navigate(value,['issues','coverage','report'].includes(r.tab)?r.tab as ProjectView:'overview')}/>
      <div className="project-context-actions"><span>Reports checked {date(lastRefresh)}</span><Button size="small" loading={refreshing} onClick={() => { setRefreshing(true); invalidateEvidenceCaches(); message.loading({ content: 'Checking for a new report…', key: 'refresh', duration: 1.2 }); }}>{refreshing ? 'Refreshing…' : 'Refresh results'}</Button><a href={routeHash({kind:'settings',section:'provenance',projectId:r.project})}>Full provenance</a></div>
       {r.tab!=='run'&&!activeProjectRun&&<section className="analysis-entry"><div><span className="eyebrow">NEW EVIDENCE</span><h2>Run analysis</h2><p>Repeat your last selection with Fast analysis, or configure a branch, pull request, exact commit, and scanner coverage.</p></div><Button type="primary" href={routeHash({kind:'project-run',projectId:r.project})} disabled={!mayLaunch}>Run analysis</Button></section>}
       {index?.current_overlay&&<section className="panel pr-overlay" aria-label="Current pull request review overlay">
         <div className="pr-overlay-heading"><div><h2>Separate PR review overlay · #{index.current_overlay.pr_context.number}</h2><p>This CodeRabbit evidence is stored separately and is not part of the canonical source-only report.</p></div><Tag color="purple">{index.current_overlay.channel.status.replaceAll('_',' ')}</Tag></div>
         <p><strong>{index.current_overlay.pr_context.head_repository}:{index.current_overlay.pr_context.head_branch}</strong> at <code>{index.current_overlay.head_sha}</code> against <strong>{index.current_overlay.pr_context.base_repository}:{index.current_overlay.pr_context.base_branch}</strong> at <code>{index.current_overlay.pr_context.base_sha}</code>{index.current_overlay.pr_context.draft?' · draft PR':''}</p>
         {overlayError?<Alert type="warning" showIcon title="PR overlay details unavailable" description={overlayError}/>:currentOverlay?<><p>{currentOverlay.advisories.length} advisory finding{currentOverlay.advisories.length===1?'':'s'} · checked {date(currentOverlay.checked_at)}</p>{currentOverlay.advisories.length>0&&<ul className="pr-overlay-advisories">{currentOverlay.advisories.map((advisory,index)=><li key={advisory.stable_id||index}><Tag color={colors[advisory.severity||'']}>{advisory.severity||'Advisory'}</Tag><strong>{advisory.message||advisory.title||'CodeRabbit advisory'}</strong>{(advisory.file||advisory.start_line)&&<small>{advisory.file||'Source location'}{advisory.start_line?`:${advisory.start_line}`:''}</small>}</li>)}</ul>}</>:<p role="status">Loading the current PR overlay…</p>}
       </section>}
       {(error || index?.discovery_error || index?.publication_error || target?.error) && (() => {
        const desc = error || index?.discovery_error || index?.publication_error || target?.error || '';
        const isNoCurrent = typeof desc === 'string' && desc.toLowerCase().includes('report not found in storage');
        const isRepositoryUnavailable = !!applicationEndpoint && isRepositoryAvailabilityError(desc);
         const guidance=isRepositoryUnavailable?(r.repository||'This repository')+' is no longer available in this workspace.':isNoCurrent?'Run analysis to create the first report for this project.':plainAnalysisIssue(desc);
         return <Alert showIcon type={isNoCurrent ? 'info' : 'error'} title={isRepositoryUnavailable ? 'Project unavailable' : isNoCurrent ? 'No report yet' : 'Report needs attention'} description={<>{guidance}{!isNoCurrent&&<Collapse ghost size="small" className="run-technical-details" items={[{key:'details',label:'Technical details',children:<p>{desc}</p>}]} />}</>}/>;
      })()}
       {workspaceReport && (target?.status === 'failed' || !fresh || workspaceReport.status === 'partial') &&
        <Alert showIcon type="warning" title={target?.status === 'failed' ? 'Showing last successful report' : !fresh ? 'Newer head awaiting analysis' : 'Analysis is incomplete'} description={target?.status === 'failed' ? `The newer analysis failed. These findings belong to commit ${workspaceReport.analyzed_sha} and are retained as the last successful report; inspect the failure above before treating them as current.` : !fresh ? 'These findings belong to the older analyzed commit shown above.' : `Available findings are shown. Coverage limitations: ${coverageLimitations.map(c=>c.name).join(', ') || 'see Coverage for evidence details'}. Open Coverage for each channel status and limitation.`}/>
       }
        <Tabs className="project-navigation" activeKey={r.tab==='run'?'overview':r.tab} onChange={tab=>navigate(target?.id||'',tab as ProjectView)} items={[{key:'overview',label:'Overview'},{key:'issues',label:`Issues${workspaceReport?` (${workspaceReport.finding_count.toLocaleString()})`:''}`,disabled:!workspaceReport},{key:'coverage',label:'Coverage',disabled:!workspaceReport},{key:'report',label:'Reports',disabled:!workspaceReport}]}/>
        {r.tab==='coverage'&&report?<React.Suspense fallback={<div className="workspace-tab-loading" role="status">Opening coverage…</div>}><CoverageTab report={report}/></React.Suspense>:r.tab==='report'&&workspaceReport&&target?<React.Suspense fallback={<div className="workspace-tab-loading" role="status">Opening reports…</div>}><ReportsTab target={target}/></React.Suspense>:!workspaceReport?(activeProjectRun?<section className="awaiting-first-report" role="status"><span className="eyebrow">ANALYSIS IN PROGRESS</span><h2>Building the first reviewable report</h2><p>Scanner results will appear here after they are collected and published for <code>{activeProjectRun.target_sha?.slice(0,12)||activeProjectRun.ref}</code>.</p><small>No empty or previous report is being presented as current evidence.</small></section>:<div className="empty" role="status"><Empty description={loading?'Loading the selected report...':r.target&&!target?'Target no longer active':'No report available yet. Run analysis to publish the first report.'}/></div>):<>
        {r.tab === 'overview' && <React.Suspense fallback={<div className="workspace-tab-loading" role="status">Opening overview…</div>}><OverviewTab><>
          <section className="overview-brief" aria-labelledby="overview-objective">
            <div className="overview-brief-copy"><span className="eyebrow">CURRENT REVIEW OBJECTIVE</span><h2 id="overview-objective">{reviewObjective}</h2><p>This overview prioritizes retained scanner evidence for <code>{workspaceReport.analyzed_sha.slice(0,12)}</code>. It supports triage; it does not declare that a finding is exploitable or that one change resolves related observations.</p><Space wrap><Button type="primary" onClick={() => issueRoute(criticalCount?{severity:'CRITICAL'}:highCount?{severity:'HIGH'}:{})}>{criticalCount?'Review critical findings':highCount?'Review high findings':'Review all issues'}</Button>{incompleteCount>0&&<Button onClick={() => navigate(target!.id,'coverage')}>Inspect {incompleteCount} coverage limitation{incompleteCount===1?'':'s'}</Button>}<Button onClick={() => navigate(target!.id,'report')}>Download issues PDF</Button></Space></div>
            <dl className="overview-evidence-state"><div><dt>Canonical findings</dt><dd>{workspaceReport.finding_count.toLocaleString()}<small>from {workspaceReport.observation_count.toLocaleString()} observations</small></dd></div><div><dt>Immediate review</dt><dd>{(criticalCount+highCount).toLocaleString()}<small>critical and high severity</small></dd></div><div><dt>Source located</dt><dd>{Math.round(locatedCount/Math.max(1,overview?.findings.total??findings.length)*100)}%<small>{locatedCount.toLocaleString()} of {(overview?.findings.total??findings.length).toLocaleString()} findings</small></dd></div><div><dt>Scanner coverage</dt><dd>{completed}/{workspaceReport.channels.length}<small>{workspaceReport.publication_gate.satisfied?'evidence gate passed':'coverage needs attention'}</small></dd></div></dl>
          </section>
          <section className="overview-guidance" aria-label="How to use this overview"><article><span>01 · Establish scope</span><h3>Start with severity, then verify location</h3><p>Severity is scanner-reported priority. Confirm the exact file, line, inputs, and reachable control flow before deciding impact.</p></article><article><span>02 · Strengthen evidence</span><h3>Use overlap as a lead</h3><p>Multiple scanners add independent observations. They strengthen the evidence trail but do not prove a shared root cause.</p></article><article><span>03 · Make a decision</span><h3>Record what requires action</h3><p>Investigate clusters, reproduce where practical, and separate confirmed work from accepted risk or false positives.</p></article></section>
         </></OverviewTab></React.Suspense>}
        {r.tab === 'overview' && <React.Suspense fallback={<div className="workspace-tab-loading" role="status">Opening overview…</div>}><OverviewTab><><header className="overview-section-heading"><div><span className="eyebrow">EVIDENCE MAP</span><h2>Where should the review focus?</h2></div><p>Select any chart element to open the matching evidence in Issues.</p></header><section className="insights-grid overview-evidence-grid">
          <article className="panel overview-chart"><div className="chart-heading"><div><span className="eyebrow">RISK SHAPE</span><h2>Severity distribution</h2></div><strong>{workspaceReport.finding_count.toLocaleString()}</strong></div><p>Available findings at this immutable revision. Select a bar to investigate.</p><FindingBars onSelect={value=>issueRoute({severity:value})} values={Object.keys(ranks).map((level,i)=>({label:level,value:workspaceReport.severities[level]||0,color:chartColors[i]}))}/></article>
          <article className="panel overview-chart"><div className="chart-heading"><div><span className="eyebrow">EVIDENCE SUPPORT</span><h2>Scanner overlap</h2></div><strong>{support.filter(item=>item.count).length}</strong></div><p>Distinct scanner families supporting each canonical finding. Overlap is not confidence.</p><DonutChart onSelect={value=>issueRoute({overlap:value.startsWith('1 ')?'single':'multiple'})} label="Finding distribution by scanner overlap" center={workspaceReport.finding_count.toLocaleString()} values={support.map(({ n, count }, i) => ({ label: n === 3 ? '3+ scanners' : `${n} scanner${n === 1 ? '' : 's'}`, value: count, color: ['#5B7DD1', '#28B8D3', '#D91668'][i] }))}/></article>
          <article className="panel overview-chart"><div className="chart-heading"><div><span className="eyebrow">FINDING TYPE</span><h2>Evidence categories</h2></div><strong>{categories[0]?.[0]==='Uncategorized'&&categories.length===1?'—':categories.length}</strong></div>{categories.length===1&&categories[0][0]==='Uncategorized'?<div className="chart-unavailable"><strong>Category metadata is unavailable</strong><p>The scanners reported findings but did not provide a normalized category. Use scanner and rule views instead; findings are not treated as zero.</p><Button onClick={()=>issueRoute({category:'Uncategorized'})}>Review uncategorized findings</Button></div>:<><p>Categories reported for this revision. Select a bar to investigate.</p><FindingBars label="Finding counts by category" onSelect={value=>issueRoute({category:value})} values={categories.map(([label,value],i)=>({label,value,color:chartColors[(i+2)%chartColors.length]}))}/></>}</article>
          <article className="panel overview-chart"><div className="chart-heading"><div><span className="eyebrow">SCANNER SIGNAL</span><h2>Findings by scanner</h2></div><strong>{scannerCounts.length}</strong></div><p>A finding can appear under more than one scanner when evidence overlaps.</p><FindingBars label="Finding counts by scanner" onSelect={value=>issueRoute({scanner:value})} values={scannerCounts.map(([label,value],i)=>({label,value,color:chartColors[(i+1)%chartColors.length]}))}/></article>
          <article className="panel overview-chart"><div className="chart-heading"><div><span className="eyebrow">RULE CONCENTRATION</span><h2>Most active rules</h2></div><strong>{ruleCounts.length}</strong></div><p>Rules producing the most retained findings. Select a rule to inspect every location.</p><FindingBars label="Finding counts by rule" onSelect={label=>issueRoute({rule:ruleCounts.find(([raw])=>displayRuleId(raw)===label)?.[0]||label,group:'file'})} values={ruleCounts.map(([label,value],i)=>({label:displayRuleId(label),value,color:chartColors[(i+3)%chartColors.length]}))}/></article>
          <article className="panel"><h2>Directories with most findings</h2><p>Finding counts, without normalization by code size.</p>{directories.map(([dir, count]) => <div className="directory-row" key={dir}><Button type="link" onClick={() => issueRoute({directory:dir})}>{dir}</Button><strong>{count.toLocaleString()}</strong><Progress aria-label={`${dir}: ${count.toLocaleString()} findings`} strokeColor="#7bd0ff" percent={count / Math.max(1, directories[0][1]) * 100} showInfo={false}/></div>)}</article>
           <article className="panel priority-panel"><div className="panel-heading"><div><span className="eyebrow">NEXT EVIDENCE</span><h2>Highest-severity findings</h2></div><Button onClick={()=>issueRoute()}>Open all issues</Button></div><p>Open a finding to validate its source location, rule, and scanner support.</p><div className="priority-list">{priorityFindings.slice(0, 4).map(f => <div className="priority-row" key={f.id}><Badge value={f.severity}/><Button type="link" title={f.message} onClick={() => issueRoute({},f.id)}>{displayFindingMessage(f.message)}</Button><small>{f.file}:{f.line}</small></div>)}</div></article>
           <article className="panel investigation-panel"><span className="eyebrow">SUGGESTED STARTING POINTS</span><h2>Investigation plan</h2><p>These repeated rule and source-area clusters can reduce review effort. They are leads, not proof that one change resolves every finding.</p><Alert type="warning" showIcon title="Validate before changing code" description="Confirm control flow, runtime behavior, configuration, and tests. Static correlation can group symptoms with different causes."/>{investigationCandidates.length?investigationCandidates.map((candidate, i) => <div className="candidate" key={`${candidate.rule}:${candidate.directory}`}><span>{i + 1}</span><div><strong title={candidate.rule}>{displayRuleId(candidate.rule)}</strong><small>{candidate.directory} · {candidate.finding_count.toLocaleString()} findings · {candidate.file_count.toLocaleString()} files</small></div><Button onClick={() => issueRoute({rule:candidate.rule,directory:candidate.directory,group:'rule'})}>Investigate cluster</Button></div>):<div className="overview-no-clusters"><strong>No repeated high-priority clusters found</strong><p>Review the highest-severity individual findings and scanner coverage instead.</p></div>}</article>
         </section></></OverviewTab></React.Suspense>}
        {r.tab === 'issues' && <React.Suspense fallback={<div className="workspace-tab-loading" role="status">Opening issues…</div>}><IssuesTab><>
          <section className="issues-heading" aria-labelledby="issues-title">
            <div className="issues-heading-copy"><span className="eyebrow">EVIDENCE QUEUE</span><h2 id="issues-title" tabIndex={-1}>Findings to investigate</h2><p>Filter the current report, open one finding, and verify its exact source context before deciding whether code must change.</p></div>
            <dl className="issues-summary" aria-label="Current finding scope"><div><dt>In view</dt><dd>{filtered.length.toLocaleString()}</dd></div><div><dt>Critical</dt><dd>{filtered.filter(f=>f.severity==='CRITICAL').length.toLocaleString()}</dd></div><div className="summary-correlation"><dt>Multiple scanners</dt><dd>{filtered.filter(f=>f.scanners.length>1).length.toLocaleString()}</dd></div><div><dt>Missing location</dt><dd>{filtered.filter(f=>!f.file||!f.line).length.toLocaleString()}</dd></div></dl>
          </section>
          <div className="issues-guidance"><strong>How to read this evidence</strong><span>One finding may contain observations from several scanners. That overlap strengthens the evidence trail, but it does not by itself prove impact or a common root cause.</span></div>
          {!r.issue&&!catalogReady&&findingsCatalog&&<Alert type="info" showIcon title={`Showing the first ${findings.length.toLocaleString()} of ${findingsCatalog.total.toLocaleString()} findings`} description={<span>Load the complete immutable catalog before searching or applying report-wide filters. <Button loading={catalogLoading} onClick={loadCompleteCatalog}>Load complete catalog</Button></span>}/>}
          {!r.issue&&catalogReady&&<div className="filters"><Input aria-label="Search issues" prefix={<SearchOutlined/>} placeholder="Search message, file, rule, or scanner" allowClear value={query} onChange={e => setQuery(e.target.value)}/>
            <MultiValuePicker label="Severities" itemName="severity" options={Object.keys(ranks)} value={selectedSeverities} onChange={setSelectedSeverities}/>
            <MultiValuePicker label="Categories" itemName="category" options={issueOptions.categories} value={selectedCategories} onChange={setSelectedCategories}/>
            <MultiValuePicker label="Scanners" itemName="scanner" options={[...new Set(findings.flatMap(f => f.scanners))].sort()} value={selectedScanners} onChange={setSelectedScanners}/>
            <Select className="location-filter" aria-label="Location" showSearch optionFilterProp="label" value={locationFilter} onChange={setLocationFilter} options={[{value:'',label:'All locations'},{value:'located',label:'Any file and line'},{value:'unlocated',label:'Missing file or line'},...issueOptions.locations.map(value=>({value,label:value.replace('#L',':')}))]}/>
            <Button aria-expanded={moreFilters} onClick={()=>setMoreFilters(value=>!value)}>{moreFilters?'Fewer filters':'More filters'}</Button>
            {moreFilters&&<><MultiValuePicker label="Rules" itemName="rule" options={issueOptions.rules} value={selectedRules} onChange={setSelectedRules}/>
            <MultiValuePicker label="Files" itemName="file" searchPlaceholder="Search repository paths" options={issueOptions.files} value={files} onChange={setFiles}/>
            <MultiValuePicker label="Directories" itemName="directory" options={issueOptions.directories} value={selectedDirectories} onChange={setSelectedDirectories}/>
            <Select aria-label="Scanner overlap" value={overlap} onChange={setOverlap} options={[{value:'',label:'Any scanner support'},{value:'multiple',label:'Multiple scanners'},{value:'single',label:'Single scanner'}]}/><MultiValuePicker label="Annotation sources" itemName="annotation source" options={issueOptions.annotationSources} value={annotationSources} onChange={setAnnotationSources}/><MultiValuePicker label="Workflows" itemName="workflow" options={issueOptions.workflows} value={workflows} onChange={setWorkflows}/><MultiValuePicker label="Jobs" itemName="job" options={issueOptions.jobs} value={jobs} onChange={setJobs}/><MultiValuePicker label="Annotation levels" itemName="annotation level" options={issueOptions.annotationLevels} value={annotationLevels} onChange={setAnnotationLevels}/><MultiValuePicker label="Correlated scanners" itemName="correlated scanner" options={issueOptions.correlatedScanners} value={correlatedScanners} onChange={setCorrelatedScanners}/></>}
            <Button onClick={resetFilters}>Clear filters</Button>
            <Select aria-label="Group issues" value={groupBy} onChange={setGroupBy} options={[{ value: 'none', label: 'No grouping' }, {value:'category',label:'Group by category'}, { value: 'rule', label: 'Group by rule' }, { value: 'file', label: 'Group by file' }, { value: 'directory', label: 'Group by directory' }, { value: 'scanner', label: 'Group by scanner' }]}/>
            <span>{filtered.length.toLocaleString()} results</span>
          </div>}
          <div className={r.issue && screens.lg ? "findings-workspace split" : "findings-workspace"}><div className="findings-list">{groupBy !== 'none' ? <Collapse className="issue-groups" items={grouped.map(([name, rows]) => ({ key: name, label: <span><strong>{name}</strong><Tag>{rows.length.toLocaleString()} findings</Tag></span>, children: <div className="group-findings">{rows.slice(0, screens.sm?100:20).map(f => <Button type="link" className="related-finding" key={f.id} onClick={() => navigate(target!.id, 'issues', f.id)}><Badge value={f.severity}/><span>{f.message}</span><small>{f.file}:{f.line} · {f.scanners.length>1?`${f.scanners.length} scanners: `:'Scanner: '}{f.scanners.join(', ')}</small></Button>)}{rows.length > (screens.sm?100:20) && <p>Showing the first {screens.sm?100:20} findings in this group. Narrow the filters to inspect more.</p>}</div> }))}/> : <Table<Finding> className="issues-table" rowKey="id" size="middle" dataSource={filtered} scroll={{ x: screens.sm ? 820 : undefined }} rowClassName={f => `${r.issue === f.id ? 'selected ' : ''}${f.scanners.length>1?'has-correlation':''}`} locale={{ emptyText: 'No findings match these filters.' }} pagination={{ current: page + 1, pageSize: screens.sm?50:20, showSizeChanger: false, onChange: p => setPage(p - 1), showTotal: total => `${total.toLocaleString()} findings` }} columns={r.issue && screens.lg ? [{title:'Findings',key:'compact',render:(_,f) => <div className="compact-finding"><div className="finding-row-heading"><Badge value={f.severity}/>{f.scanners.length>1&&<span className="scanner-correlation">{f.scanners.length} scanners</span>}</div><Button type="link" className="issue-link" onClick={() => navigate(target!.id, 'issues', f.id)}>{f.message}</Button><small className="finding-location">{f.file}{f.line?`:${f.line}`:''}</small><small>{f.scanners.join(', ')}</small><code>{f.rules.join(', ')||'Rule unavailable'}</code></div>}] : [
            { title: 'Severity', key: 'severity', width: 120, render: (_, f) => <Badge value={f.severity}/> },
            { title: 'Finding and immutable source', key: 'issue', render: (_, f) => <div className="finding-primary"><Button type="link" className="issue-link" onClick={() => navigate(target!.id, 'issues', f.id)}>{f.message}</Button><small className="finding-location">{f.file||'Source file unavailable'}{f.line ? `:${f.line}` : ''}</small><code>{f.rules.join(', ')||'Rule unavailable'}</code></div> },
            { title: 'Scanner support', key: 'scanner', width: 280, render: (_, f) => <div className="scanner-support"><span className={f.scanners.length>1?'scanner-correlation':'scanner-single'}>{f.scanners.length>1?`${f.scanners.length} scanners support this finding`:'One scanner supports this finding'}</span><small>{f.scanners.join(', ')||'Scanner unavailable'}</small><small>{(f.observation_count??f.scanners.length).toLocaleString()} retained observation{(f.observation_count??f.scanners.length)===1?'':'s'}</small></div> }
          ]}/>}</div>
          {r.issue && screens.lg && <section ref={issueDetailRef} tabIndex={-1} className="evidence-panel" aria-label="Issue detail"><div className="pane-heading"><div><span className="eyebrow">SELECTED FINDING</span><h2>Issue detail</h2></div><Button onClick={() => navigate(target!.id, 'issues','',r.filters)}>Back to findings</Button></div><Evidence detail={detail} source={source} error={error} findings={findings} openFinding={id => navigate(target!.id, 'issues', id,r.filters)}/></section>}
          </div>
       </></IssuesTab></React.Suspense>}</>}
      </>}
      <Drawer title="Issue detail" open={!!r.issue && r.tab === 'issues' && !screens.lg} onClose={() => navigate(target?.id || '', 'issues','',r.filters)} size="min(850px, 100vw)" destroyOnHidden>
        <Evidence detail={detail} source={source} error={error} findings={findings} openFinding={id => navigate(target?.id || '', 'issues', id,r.filters)}/>
      </Drawer>
      <footer>Findings are scanner observations, not confirmed defects.</footer>
    </main>
  </AppShell></ConfigProvider>;
}
