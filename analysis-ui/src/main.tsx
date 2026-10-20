import { DashboardAccess } from './DashboardAccess';
import { refreshRepositoryReports } from './repositoryReports';
import { ProjectLauncher } from './ProjectLauncher';
import { applicationEndpoint, repositoryJson } from './repositoryReports';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Button, Collapse, ConfigProvider, Drawer, Empty, Grid, Input, Progress, Select, Space, Statistic, Table, Tabs, Tag, message } from 'antd';
import { GithubOutlined, SearchOutlined } from '@ant-design/icons';
import 'antd/dist/reset.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/sora/500.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';
import './workspace.css';
import { useLaunchAuth } from './useLaunchAuth';
import { ThreatReport } from './ThreatReport';
import { Settings } from './Settings';
import { safeGithubUrl } from './safeUrls';
import { Repositories } from './Repositories';
import { LandingPage } from './LandingPage';
import { AppearanceProvider, useAppearance } from './Appearance';
import { ProjectRunTracker, type ProjectRunRequest } from './ProjectRunTracker';
import {parseAppRoute,routeHash,type IssueRouteFilters,type ProjectView} from './appRoutes';
import {AppShell} from './AppShell';
import {RevisionRibbon} from './RevisionRibbon';
import {applicationTheme} from './brand';

type Target = { scan_run_id?: number; run_attempt?: number; tooling_sha?: string; lifecycle_status?: string; id: string; label: string; repository: string; source_repository: string; head_sha: string; kind: string; branch: string; pr?: number; base_branch?: string; base_sha?: string; checked_at: string; status: string; report?: string; error?: string };
type Index = { report_storage?: {compressed_bytes:number}; publishing_repository?: string; launch_endpoint?: string; source_repository?: string; analysis_default_branch?: string; metrics?: {site_bytes: number; site_limit_bytes: number; queued?: number; scanning?: number}; schema_version: string; checked_at: string; targets: Target[]; preferred_branch: string; analysis_repository: string; current_overlay?: {overlay_key:string;status:string;head_sha:string;checked_at?:string;pr_context:{number:number;title?:string;draft?:boolean;head_repository:string;head_branch:string;base_repository:string;base_branch:string;base_sha:string};channel:{status:string;reason?:string}}; discovery_error?: string; publication_error?: string };
type Finding = { id: string; severity: string; category?: string; message: string; file: string; line: number; scanners: string[]; rules: string[]; page: number };
type Detail = Finding & { origins: { scanner_family: string; rule: string; file: string; start_line: number; raw_artifact: string; observation_id: string }[]; source: string | null; source_start: number; source_url: string | null };
type Channel = { channel: string; name: string; class: string; status: string; findings: number | null; observation_count: number; reason: string; workflow: string };
type Report = { tooling_sha?: string; producer_run_attempt?: number; analyzed_sha: string; generated_at: string; status: string; finding_count: number; observation_count: number; channels: Channel[]; severities: Record<string, number>; producer_runs: { id: string; url: string }[]; publication_gate: { satisfied: boolean } };
type PrOverlay = {overlay_key:string;head_sha:string;checked_at:string;pr_context:{number:number;title?:string;draft?:boolean;head_repository:string;head_branch:string;base_repository:string;base_branch:string;base_sha:string};channel:{status:string;reason?:string};advisories:{stable_id?:string;severity?:string;message?:string;title?:string;file?:string;start_line?:number}[]};
const states: Record<string, string> = { current: 'Up to date', partial: 'Partial analysis', queued: 'Queued', scanning: 'Running scanners', running: 'Running scanners', collecting: 'Collecting results', publishing: 'Publishing report', stale: 'Newer revision pending', failed: 'Analysis failed', temporarily_unavailable: 'Temporarily unavailable', NOT_AVAILABLE: 'Unavailable', NOT_APPLICABLE: 'Not assessed', DEFERRED: 'Not assessed' };
const ranks: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4, UNKNOWN: 5 };
async function json<T>(path: string, signal?: AbortSignal): Promise<T> {
  return repositoryJson<T>(path, signal);
}
const DEFAULT_EXECUTION_REPOSITORY=import.meta.env.VITE_DEFAULT_EXECUTION_REPOSITORY||'combustrrr/code-analysis-dashboard';
function route() {const value=parseAppRoute();if(value.kind==='project')return{repository:DEFAULT_EXECUTION_REPOSITORY,project:value.projectId,target:value.target||'',tab:value.view,section:'',issue:value.issue||'',filters:(value.filters||{}) as IssueRouteFilters};if(value.kind==='project-run')return{repository:DEFAULT_EXECUTION_REPOSITORY,project:value.projectId,target:'',tab:'run',section:'',issue:'',filters:{} as IssueRouteFilters};if(value.kind==='settings')return{repository:'',project:value.projectId||'',target:'',tab:'settings',section:value.section,issue:'',filters:{} as IssueRouteFilters};return{repository:'',project:'',target:'',tab:value.kind,section:'',issue:'',filters:{} as IssueRouteFilters};}
function isRepositoryAvailabilityError(value: string) { return /retired|unsupported|not supported|project is unavailable|private reports are not supported/i.test(value); }
const PROJECT_RUNS_STORAGE_KEY = 'analysis-project-runs';
const ACTIVE_PROJECT_RUN_PHASES = new Set(['preparing', 'queued', 'running', 'scanning', 'analyzing', 'collecting', 'publishing']);
function readProjectRuns(): ProjectRunRequest[] { try { const value = JSON.parse(sessionStorage.getItem(PROJECT_RUNS_STORAGE_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function navigate(target: string, tab: ProjectView, issue = '',filters?:IssueRouteFilters) { const current = route(); if(!current.project)return;location.hash=routeHash({kind:'project',projectId:current.project,target:target||undefined,view:tab,issue:issue||undefined,filters}); }
function date(s?: string) { return s ? new Date(s).toLocaleString() : 'Unavailable'; }
const colors: Record<string, string> = { CRITICAL: 'red', HIGH: 'volcano', MEDIUM: 'gold', LOW: 'blue', INFO: 'default', current: 'green', partial: 'orange', failed: 'red', scanning: 'blue', COMPLETED: 'green', CONFIGURED_COMPLETE: 'green', POLICY_FINDINGS: 'orange', NOT_AVAILABLE: 'orange', FAILED: 'red' };
function Badge({ value }: { value: string }) { return <Tag className={`status-tag status-${value}`} color={colors[value]}>{states[value] || value.replaceAll('_', ' ')}</Tag>; }
function directoryOf(file: string) { return file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '(root)'; }
type Relation = { label: string; reason: string; findings: Finding[] };
const chartColors = ['#D91668', '#E46E67', '#D9A441', '#5B7DD1', '#42BFD0', '#718895'];
function DonutChart({ values, label, center, onSelect }: { values: { label: string; value: number; color?: string }[]; label: string; center: string; onSelect?:(label:string)=>void }) {
  const total = values.reduce((sum, item) => sum + item.value, 0); let offset = 0;
  return <div className="donut-layout"><svg className="donut" viewBox="0 0 42 42" role="img" aria-label={label}><circle className="donut-track" cx="21" cy="21" r="15.9155" fill="none" strokeWidth="6"/>{total > 0 && values.map((item, index) => { const share = item.value / total * 100; const start = offset; offset += share; return <circle key={item.label} cx="21" cy="21" r="15.9155" fill="none" stroke={item.color || chartColors[index]} strokeWidth="6" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={25 - start}/>; })}<text x="21" y="20" textAnchor="middle">{center}</text><text className="donut-caption" x="21" y="25" textAnchor="middle">findings</text></svg><div className="chart-legend">{values.filter(v => v.value).map((item, i) => <button type="button" disabled={!onSelect} onClick={()=>onSelect?.(item.label)} key={item.label}><i style={{ background: item.color || chartColors[i] }}/><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong></button>)}</div></div>;
}
function FindingBars({values,onSelect,label='Finding counts by severity'}:{values:{label:string;value:number;color:string}[];onSelect?:(label:string)=>void;label?:string}){
 const max=Math.max(1,...values.map(item=>item.value));
 return <div className="finding-bars" aria-label={label}>{values.map(item=><button type="button" disabled={!onSelect} onClick={()=>onSelect?.(item.label)} className="finding-bar" key={item.label}><span>{item.label}</span><div className="finding-bar-track"><i style={{width:`${item.value/max*100}%`,background:item.color}}/></div><strong>{item.value.toLocaleString()}</strong></button>)}</div>;
}

function ReportWorkspace({report,target}:{report:Report;target:Target}){
 const [status,setStatus]=useState('');
 const rows=report.channels.filter(channel=>!status||channel.status===status);
 return <section className="report-workspace"><header className="report-workspace-heading"><div><span className="eyebrow">IMMUTABLE EVIDENCE</span><h2>Published report and scanner coverage</h2><p>Review the published report and the result of every requested scanner channel.</p></div><Select aria-label="Execution status" value={status} onChange={setStatus} options={[{value:'',label:'All statuses'},...[...new Set(report.channels.map(channel=>channel.status))].sort().map(value=>({value,label:value.replaceAll('_',' ')}))]}/></header><Alert showIcon type="info" title="Coverage does not guarantee that the code is secure" description="Failed, deferred, or unavailable channels remain incomplete. Findings from successful channels are still retained."/><Table<Channel> rowKey="channel" size="middle" dataSource={rows} pagination={false} scroll={{x:760}} columns={[{title:'Scanner',key:'scanner',render:(_,channel)=><><strong>{channel.name}</strong><small>{channel.class}</small></>},{title:'Status',key:'status',render:(_,channel)=><Badge value={channel.status}/>},{title:'Findings',key:'findings',render:(_,channel)=>channel.findings===null?'Unavailable':channel.findings.toLocaleString()},{title:'Evidence limitation',key:'reason',render:(_,channel)=>channel.reason||'Retained evidence is available'}]}/>{target.report?<ThreatReport reportPath={target.report} targetSha={target.head_sha}/>:<Empty description="The immutable report is unavailable for this revision."/>}</section>;
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
          <section className="explanation-block"><h3>Why this was reported</h3><p><strong>{detail.scanners.join(', ')}</strong> emitted {detail.rules.length ? <>rule <code>{detail.rules.join(', ')}</code></> : 'a finding'} at this source location. The message above is the scanner's retained explanation.</p><Alert type="info" showIcon title="Detected condition, not a proven root cause" description="Start with the highlighted code, then inspect its inputs, callers, configuration, and repeated uses before changing it. Similar findings below can reveal whether the condition is local or systematic."/></section>
          <section className="source-evidence"><h3>Code at the reported location</h3><p>The highlighted line is the exact location retained by the scanner. Review nearby control flow before changing it.</p>{source.length ? <pre className="source">{source.slice(Math.max(0, detail.line - 6), Math.max(0, detail.line - 6) + 16).map((line, i) => <div key={i} className={Math.max(1, detail.line - 5) + i === detail.line ? 'highlight' : ''}><span>{Math.max(1, detail.line - 5) + i}</span>{line}</div>)}</pre> : <p>Source preview unavailable or withheld. Use the immutable GitHub source link when available.</p>}</section>
          <h3>Supporting observations</h3><p>These retained observations identify which scanner and rule produced the issue.</p>{detail.origins.map(o => <div className="origin" key={o.observation_id}><strong>{o.scanner_family} | {o.rule}</strong><small>{o.file}:{o.start_line}</small><small>Observation: {o.observation_id}</small><small>Artifact: {o.raw_artifact || 'Unavailable'}</small></div>)}
          <section className="relationships"><h3>Related findings</h3><p>Relationships are derived from the current report's scanner, rule, and source paths. They do not imply a shared defect.</p>{related.length ? related.map(relation => <div className="relation" key={relation.label}><div><strong>{relation.label}</strong><small>{relation.reason} · {relation.findings.length.toLocaleString()} related</small></div>{relation.findings.slice(0, 4).map(f => <Button type="link" className="related-finding" key={f.id} onClick={() => openFinding(f.id)}><Badge value={f.severity}/><span>{f.message}</span><small>{f.file}:{f.line}</small></Button>)}</div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No relationships found in the current report"/>}</section>
        </> : <Empty description={error || 'Issue evidence is unavailable or still loading…'}/>}</div>;
}

function App({viewerAuth}:{viewerAuth?:ReturnType<typeof useLaunchAuth>}) {
  const screens = Grid.useBreakpoint();
  const { appearance } = useAppearance();
  const [projectRuns, setProjectRuns] = useState<ProjectRunRequest[]>(readProjectRuns);
  const projectRunsRef = useRef(projectRuns);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastRefresh, setLastRefresh] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [hostAccess,setHostAccess]=useState<{can_launch:boolean;can_configure:boolean}>({can_launch:false,can_configure:false});
  useEffect(()=>{const refresh=()=>setRefreshTick(t=>t+1);window.addEventListener('analysis-report-published',refresh);return()=>window.removeEventListener('analysis-report-published',refresh);},[]);
  const [directory, setDirectory] = useState('');
  const [rule,setRule]=useState(''); const [file,setFile]=useState(''); const [locationFilter,setLocationFilter]=useState(''); const [overlap,setOverlap]=useState('');
   const [index, setIndex] = useState<Index>(); const [error, setError] = useState(''); const [r, setRoute] = useState(route());
   const [currentOverlay,setCurrentOverlay]=useState<PrOverlay>(); const [overlayError,setOverlayError]=useState('');
   const refreshSequence = useRef(0);
  const [report, setReport] = useState<Report>(); const [findings, setFindings] = useState<Finding[]>([]); const [detail, setDetail] = useState<Detail>(); const [source, setSource] = useState<string[]>([]);
  const [query, setQuery] = useState(''); const [severity, setSeverity] = useState(''); const [category,setCategory]=useState(''); const [scanner, setScanner] = useState(''); const [groupBy, setGroupBy] = useState('none'); const [moreFilters,setMoreFilters]=useState(false); const [page, setPage] = useState(0); const [loading, setLoading] = useState(false);
    useEffect(() => {
      const sequence = ++refreshSequence.current;
      const c = new AbortController();
      const refresh = () => json<Index>('data/index.json', c.signal).then(value => { if (sequence !== refreshSequence.current) return; setIndex(value); setError(''); setLastRefresh(new Date().toISOString()); }).catch(e => { if (e.name !== 'AbortError' && sequence === refreshSequence.current) { setIndex(undefined); setError(e.message); } }).finally(()=>{ if (sequence === refreshSequence.current) setRefreshing(false); });
      const change = () => setRoute(route());
      let timer: number | undefined;
      if (r.repository && r.project) {
        refresh(); timer = window.setInterval(refresh, 60000);
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
    if(!launchAuth.session)return;
    launchAuth.api<{can_launch:boolean;can_configure:boolean}>('projects').then(value=>{if(active)setHostAccess(value);}).catch(()=>{});
    return()=>{active=false;};
  },[launchAuth.session?.token]);
  const target = index?.targets.find(t => t.id === r.target) || (!r.target ? index?.targets.find(t => t.kind === 'branch' && t.branch === index.preferred_branch) || index?.targets[0] : undefined);
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
    persistProjectRuns([...projectRunsRef.current.filter(item => item.request_id !== run.request_id), run]);
  };
  const updateProjectRunPhase = (requestId: string, phase: string) => {
    const current = projectRunsRef.current;
    const next = current.map(item => item.request_id === requestId ? { ...item, phase } : item);
    if (next.some((item, index) => item.phase !== current[index]?.phase)) persistProjectRuns(next);
  };
  const dismissProjectRun = (requestId: string) => persistProjectRuns(projectRunsRef.current.filter(item => item.request_id !== requestId));
  const openProjectRunReport = (request: ProjectRunRequest, targetId: string) => {
    location.hash = routeHash({kind:'project',projectId:request.project,target:targetId,view:'report'});
  };
  const projectRunTrackers = projectRuns.map(request => <ProjectRunTracker key={request.request_id} auth={launchAuth} request={request} onPhase={updateProjectRunPhase} onDismiss={() => dismissProjectRun(request.request_id)} onOpenReport={id => openProjectRunReport(request, id)}/>);
  const activeProjectRun = projectRuns.find(request => request.repository === r.repository && request.project === r.project && (!request.phase || ACTIVE_PROJECT_RUN_PHASES.has(request.phase)));
  useEffect(() => { setReport(undefined); setFindings([]); setDetail(undefined); setSource([]); setPage(0); setError(''); setLoading(false); if (!target?.report) return;
    const c = new AbortController(); setLoading(true); Promise.all([json<Report>(`data/${target.report}/report.json`, c.signal), json<Finding[]>(`data/${target.report}/findings.json`, c.signal)]).then(([a, b]) => { setReport(a); setFindings(b); }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!c.signal.aborted) setLoading(false); }); return () => c.abort();
  }, [target?.id, target?.report]);
  useEffect(() => { setDetail(undefined); setSource([]); if (!r.issue || !target?.report) return; const f = findings.find(f => f.id === r.issue); if (!f) return; const c = new AbortController();
    json<Detail[]>(`data/${target.report}/details/${f.page}.json`, c.signal).then(async rows => { const d = rows.find(d => d.id === f.id); setDetail(d); if (d?.source) setSource(await json<string[]>(`data/${target.report}/${d.source}`, c.signal)); }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }); return () => c.abort();
  }, [r.issue, findings, target?.report]);
  const filtered = useMemo(() => findings.filter(f => (!directory || (f.file.includes('/') ? f.file.slice(0, f.file.lastIndexOf('/')) : '(root)') === directory) && (!rule || f.rules.includes(rule)) && (!file || f.file === file) && (!locationFilter || (locationFilter === 'located' ? !!f.file && f.line > 0 : !f.file || !f.line)) && (!overlap || (overlap === 'multiple' ? new Set(f.scanners).size > 1 : new Set(f.scanners).size === 1)) && (!severity || f.severity === severity) && (!category||(f.category||'Uncategorized')===category) && (!scanner || f.scanners.includes(scanner)) && `${f.message} ${f.file} ${f.category||''} ${f.rules.join(' ')} ${f.scanners.join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (ranks[a.severity] ?? 9) - (ranks[b.severity] ?? 9) || a.file.localeCompare(b.file)), [findings, query, severity, category, scanner, directory, rule, file, locationFilter, overlap]);
  const issueOptions = useMemo(()=>({rules:[...new Set(findings.flatMap(f=>f.rules))].sort(),categories:[...new Set(findings.map(f=>f.category||'Uncategorized'))].sort(),files:[...new Set(findings.map(f=>f.file).filter(Boolean))].sort(),directories:[...new Set(findings.map(f=>directoryOf(f.file)))].sort()}),[findings]);
  const resetFilters=()=>{setQuery('');setSeverity('');setCategory('');setScanner('');setDirectory('');setRule('');setFile('');setLocationFilter('');setOverlap('');setGroupBy('none');setPage(0);};
  useEffect(resetFilters,[r.repository,r.project,target?.id]);
  const grouped = useMemo(() => {
    if (groupBy === 'none') return [] as [string, Finding[]][];
    const groups = new Map<string, Finding[]>();
    filtered.forEach(f => { const key = groupBy === 'rule' ? f.rules[0] || 'No rule' : groupBy === 'scanner' ? f.scanners[0] || 'No scanner' : groupBy === 'file' ? f.file || 'No file' : groupBy==='category'?f.category||'Uncategorized':directoryOf(f.file); groups.set(key, [...(groups.get(key) || []), f]); });
    return [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [filtered, groupBy]);
  useEffect(() => setPage(0), [query, severity, category, scanner, directory, rule, file, locationFilter, overlap]);
  useEffect(()=>{if(r.tab!=='issues')return;const filters=r.filters||{};setQuery(filters.query||'');setSeverity(filters.severity||'');setCategory(filters.category||'');setScanner(filters.scanner||'');setRule(filters.rule||'');setFile(filters.file||'');setDirectory(filters.directory||'');setLocationFilter(filters.location||'');setOverlap(filters.overlap||'');setGroupBy(filters.group||'none');},[r.tab,r.filters]);
  const directories = useMemo(() => {
    const counts = new Map<string, number>();
    findings.forEach(f => { const dir = f.file.includes('/') ? f.file.slice(0, f.file.lastIndexOf('/')) : '(root)'; counts.set(dir, (counts.get(dir) || 0) + 1); });
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [findings]);
  const support = useMemo(() => [1, 2, 3].map(n => ({ n, count: findings.filter(f => n === 3 ? new Set(f.scanners).size >= 3 : new Set(f.scanners).size === n).length })), [findings]);
  const categories=useMemo(()=>{const counts=new Map<string,number>();findings.forEach(f=>{const value=f.category||'Uncategorized';counts.set(value,(counts.get(value)||0)+1);});return[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6);},[findings]);
  const scannerCounts=useMemo(()=>{const counts=new Map<string,number>();findings.forEach(f=>new Set(f.scanners).forEach(value=>counts.set(value,(counts.get(value)||0)+1)));return[...counts].sort((a,b)=>b[1]-a[1]).slice(0,7);},[findings]);
  const ruleCounts=useMemo(()=>{const counts=new Map<string,number>();findings.forEach(f=>(f.rules.length?f.rules:['Rule unavailable']).forEach(value=>counts.set(value,(counts.get(value)||0)+1)));return[...counts].sort((a,b)=>b[1]-a[1]).slice(0,7);},[findings]);
  const investigationCandidates = useMemo(() => {
    const clusters = new Map<string, { rule: string; directory: string; rows: Finding[]; score: number }>();
    findings.forEach(f => (f.rules.length ? f.rules : ['No rule']).forEach(rule => {
      const directory = directoryOf(f.file); const key = `${rule}\u0000${directory}`;
      const cluster = clusters.get(key) || { rule, directory, rows: [], score: 0 };
      cluster.rows.push(f); cluster.score += Math.max(1, 6 - (ranks[f.severity] ?? 5)); clusters.set(key, cluster);
    }));
    return [...clusters.values()].filter(c => c.rows.length > 1).sort((a, b) => b.score - a.score || b.rows.length - a.rows.length).slice(0, 5);
  }, [findings]);
  useEffect(() => {
    if (!r.issue || !screens.lg) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') navigate(target?.id || '', 'issues'); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [r.issue, screens.lg, target?.id]);
  const fresh = !!report && report.analyzed_sha === target?.head_sha;
  const completed = report?.channels.filter(c => ['COMPLETED', 'COMPLETED_OPTIONAL', 'CONFIGURED_COMPLETE', 'POLICY_FINDINGS'].includes(c.status)).length || 0;
  const issueRoute=(filters:IssueRouteFilters={},issue='')=>{if(!target)return;location.hash=routeHash({kind:'project',projectId:r.project,target:target.id,view:'issues',issue:issue||undefined,filters});};
  useEffect(()=>{if(r.tab!=='issues'||!target)return;const timer=window.setTimeout(()=>{const filters={query,severity,category,scanner,rule,file,directory,location:locationFilter,overlap,group:groupBy==='none'?'':groupBy};const next=routeHash({kind:'project',projectId:r.project,target:target.id,view:'issues',issue:r.issue||undefined,filters});if(location.hash!==next)history.replaceState(null,'',next);},50);return()=>window.clearTimeout(timer);},[r.tab,r.project,r.issue,target?.id,query,severity,category,scanner,rule,file,directory,locationFilter,overlap,groupBy]);
   const appTheme=applicationTheme(appearance);
    if (!r.repository) {
      if(r.tab==='projects')return <ConfigProvider theme={appTheme}><AppShell auth={viewerAuth} status={projectRunTrackers}><main className="workspace-home"><Repositories auth={launchAuth}/></main></AppShell></ConfigProvider>;
      if(r.tab==='settings')return <ConfigProvider theme={appTheme}><AppShell auth={viewerAuth} status={projectRunTrackers}><Settings auth={launchAuth} onRun={projectId=>location.hash=routeHash({kind:'project-run',projectId})}/></AppShell></ConfigProvider>;
      return <LandingPage auth={launchAuth} onStart={() => { try { sessionStorage.setItem('analysis-workspace-requested', 'true'); } catch {} location.hash=routeHash({kind:'projects'}); }} />;
    }
    return <ConfigProvider theme={appTheme}><AppShell auth={viewerAuth} status={projectRunTrackers}>
     {r.tab==='run'&&r.repository&&r.project&&<ProjectLauncher auth={launchAuth} repository={r.repository} project={r.project} preferredBranch={index?.preferred_branch} canLaunch={mayLaunch} active={!!activeProjectRun} close={()=>{location.hash=routeHash({kind:'project',projectId:r.project,view:'overview'});}} onSubmitted={handleProjectSubmitted}/>}
    <main className="project-workspace">
      <RevisionRibbon repository={index?.source_repository||target?.repository||'Configured project'} target={target} targets={index?.targets||[]} fresh={fresh} statusLabel={states[target?.lifecycle_status||target?.status||'']||target?.status||'Unavailable'} coverage={report?`${completed} of ${report.channels.length}`:'Unavailable'} published={report?.generated_at} onTarget={value=>navigate(value,r.tab==='issues'?'issues':r.tab==='report'?'report':'overview')}/>
      <div className="project-context-actions"><span>Reports checked {date(lastRefresh)}</span><Button size="small" loading={refreshing} onClick={() => { refreshRepositoryReports(); setRefreshing(true); setRefreshTick(t => t + 1); message.loading({ content: 'Checking for a new report…', key: 'refresh', duration: 1.2 }); }}>{refreshing ? 'Refreshing…' : 'Refresh results'}</Button><a href={routeHash({kind:'settings',section:'provenance',projectId:r.project})}>Full provenance</a></div>
       {r.tab!=='run'&&<section className="analysis-entry"><div><span className="eyebrow">NEW EVIDENCE</span><h2>Run analysis</h2><p>Choose Fast analysis for the latest preferred-branch code, or configure an exact revision and scanner coverage.</p></div>{activeProjectRun?<Button type="primary" onClick={()=>document.querySelector('.project-run-tracker')?.scrollIntoView({behavior:'smooth',block:'center'})}>View progress</Button>:<Button type="primary" href={routeHash({kind:'project-run',projectId:r.project})} disabled={!mayLaunch}>Run analysis</Button>}</section>}
       {index?.current_overlay&&<section className="panel pr-overlay" aria-label="Current pull request review overlay">
         <div className="pr-overlay-heading"><div><h2>Separate PR review overlay · #{index.current_overlay.pr_context.number}</h2><p>This CodeRabbit evidence is stored separately and is not part of the canonical source-only report.</p></div><Tag color="purple">{index.current_overlay.channel.status.replaceAll('_',' ')}</Tag></div>
         <p><strong>{index.current_overlay.pr_context.head_repository}:{index.current_overlay.pr_context.head_branch}</strong> at <code>{index.current_overlay.head_sha}</code> against <strong>{index.current_overlay.pr_context.base_repository}:{index.current_overlay.pr_context.base_branch}</strong> at <code>{index.current_overlay.pr_context.base_sha}</code>{index.current_overlay.pr_context.draft?' · draft PR':''}</p>
         {overlayError?<Alert type="warning" showIcon title="PR overlay details unavailable" description={overlayError}/>:currentOverlay?<><p>{currentOverlay.advisories.length} advisory finding{currentOverlay.advisories.length===1?'':'s'} · checked {date(currentOverlay.checked_at)}</p>{currentOverlay.advisories.length>0&&<ul className="pr-overlay-advisories">{currentOverlay.advisories.map((advisory,index)=><li key={advisory.stable_id||index}><Tag color={colors[advisory.severity||'']}>{advisory.severity||'Advisory'}</Tag><strong>{advisory.message||advisory.title||'CodeRabbit advisory'}</strong>{(advisory.file||advisory.start_line)&&<small>{advisory.file||'Source location'}{advisory.start_line?`:${advisory.start_line}`:''}</small>}</li>)}</ul>}</>:<p role="status">Loading the current PR overlay…</p>}
       </section>}
       {(error || index?.discovery_error || index?.publication_error || target?.error) && (() => {
        const desc = error || index?.discovery_error || index?.publication_error || target?.error || '';
        const isNoCurrent = typeof desc === 'string' && desc.toLowerCase().includes('report not found in storage');
        const isRepositoryUnavailable = !!applicationEndpoint && isRepositoryAvailabilityError(desc);
         return <Alert showIcon type={isNoCurrent ? 'info' : 'error'} title={isRepositoryUnavailable ? 'Repository unavailable' : isNoCurrent ? 'No current report yet' : 'Report service error'} description={isRepositoryUnavailable ? (r.repository || 'This repository') + ' is retired or unsupported by the live analysis service. No other repository was selected.' : isNoCurrent ? 'Run analysis to generate the first report for this target.' : desc}/>;
      })()}
       {report && (target?.status === 'failed' || !fresh || report.status === 'partial') && <Alert showIcon type="warning" title={target?.status === 'failed' ? 'Showing last successful report' : !fresh ? 'Newer head awaiting analysis' : 'Analysis is incomplete'} description={target?.status === 'failed' ? `The newer analysis failed. These findings belong to commit ${report.analyzed_sha} and are retained as the last successful report; inspect the failure above before treating them as current.` : !fresh ? 'These findings belong to the older analyzed commit shown above.' : `Available findings are shown. Incomplete scanners: ${report.channels.filter(c=>!['COMPLETED','COMPLETED_OPTIONAL','CONFIGURED_COMPLETE','POLICY_FINDINGS','NOT_APPLICABLE','DEFERRED'].includes(c.status)).map(c=>c.name).join(', ') || 'see Report for evidence details'}. Open Report for the failure reason.`}/>}
        <Tabs className="project-navigation" activeKey={r.tab==='run'?'overview':r.tab} onChange={tab=>navigate(target?.id||'',tab as ProjectView)} items={[{key:'overview',label:'Overview'},{key:'issues',label:`Issues${report?` (${report.finding_count.toLocaleString()})`:''}`},{key:'report',label:'Report'}]}/>
        {r.tab==='report'&&report&&target?<ReportWorkspace report={report} target={target}/>:!report?<div className="empty" role="status"><Empty description={loading?'Loading the selected report...':r.target&&!target?'Target no longer active':'No report available yet. Run analysis to publish the first report.'}/></div>:<>
        {r.tab === 'overview' && <>
          <section className="metrics">{['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => <div key={s}><Statistic title={<Badge value={s}/>} value={report.severities[s] || 0}/><Button type="link" onClick={() => issueRoute({severity:s})}>View findings</Button></div>)}</section>
          <section className="summary"><div><h2>Reported issues</h2><p>{report.finding_count.toLocaleString()} findings from {report.observation_count.toLocaleString()} scanner observations.</p><p>Inspect the rule, exact source location, and evidence behind each finding.</p><Button type="primary" onClick={() => issueRoute()}>Browse issues</Button></div>
            <div><h2>Scanner execution</h2><p>{completed} of {report.channels.length} channels completed.</p><Progress strokeColor="#42BFD0" percent={Math.round(completed / Math.max(1, report.channels.length) * 100)} showInfo={false} aria-label={`${completed} of ${report.channels.length} channels completed`}/><p>Strict evidence gate: <strong>{report.publication_gate.satisfied ? 'Passed' : 'Not satisfied'}</strong></p><Button onClick={() => navigate(target!.id, 'report')}>Open report and coverage</Button></div></section>
        </>}
        {r.tab === 'overview' && <section className="insights-grid">
          <article className="panel overview-chart"><div className="chart-heading"><div><span className="eyebrow">RISK SHAPE</span><h2>Severity distribution</h2></div><strong>{report.finding_count.toLocaleString()}</strong></div><p>Available findings at this immutable revision. Select a bar to investigate.</p><FindingBars onSelect={value=>issueRoute({severity:value})} values={Object.keys(ranks).map((level,i)=>({label:level,value:report.severities[level]||0,color:chartColors[i]}))}/></article>
          <article className="panel overview-chart"><div className="chart-heading"><div><span className="eyebrow">EVIDENCE SUPPORT</span><h2>Scanner overlap</h2></div><strong>{support.filter(item=>item.count).length}</strong></div><p>Distinct scanner families supporting each canonical finding. Overlap is not confidence.</p><DonutChart onSelect={value=>issueRoute({overlap:value.startsWith('1 ')?'single':'multiple'})} label="Finding distribution by scanner overlap" center={report.finding_count.toLocaleString()} values={support.map(({ n, count }, i) => ({ label: n === 3 ? '3+ scanners' : `${n} scanner${n === 1 ? '' : 's'}`, value: count, color: ['#5B7DD1', '#42BFD0', '#D91668'][i] }))}/></article>
          <article className="panel overview-chart"><div className="chart-heading"><div><span className="eyebrow">FINDING TYPE</span><h2>Evidence categories</h2></div><strong>{categories[0]?.[0]==='Uncategorized'&&categories.length===1?'—':categories.length}</strong></div>{categories.length===1&&categories[0][0]==='Uncategorized'?<div className="chart-unavailable"><strong>Category metadata is unavailable</strong><p>The scanners reported findings but did not provide a normalized category. Use scanner and rule views instead; findings are not treated as zero.</p><Button onClick={()=>issueRoute({category:'Uncategorized'})}>Review uncategorized findings</Button></div>:<><p>Categories reported for this revision. Select a bar to investigate.</p><FindingBars label="Finding counts by category" onSelect={value=>issueRoute({category:value})} values={categories.map(([label,value],i)=>({label,value,color:chartColors[(i+2)%chartColors.length]}))}/></>}</article>
          <article className="panel overview-chart"><div className="chart-heading"><div><span className="eyebrow">SCANNER SIGNAL</span><h2>Findings by scanner</h2></div><strong>{scannerCounts.length}</strong></div><p>A finding can appear under more than one scanner when evidence overlaps.</p><FindingBars label="Finding counts by scanner" onSelect={value=>issueRoute({scanner:value})} values={scannerCounts.map(([label,value],i)=>({label,value,color:chartColors[(i+1)%chartColors.length]}))}/></article>
          <article className="panel overview-chart"><div className="chart-heading"><div><span className="eyebrow">RULE CONCENTRATION</span><h2>Most active rules</h2></div><strong>{ruleCounts.length}</strong></div><p>Rules producing the most retained findings. Select a rule to inspect every location.</p><FindingBars label="Finding counts by rule" onSelect={value=>issueRoute({rule:value,group:'file'})} values={ruleCounts.map(([label,value],i)=>({label,value,color:chartColors[(i+3)%chartColors.length]}))}/></article>
          <article className="panel"><h2>Directories with most findings</h2><p>Finding counts, without normalization by code size.</p>{directories.map(([dir, count]) => <div className="directory-row" key={dir}><Button type="link" onClick={() => issueRoute({directory:dir})}>{dir}</Button><strong>{count.toLocaleString()}</strong><Progress strokeColor="#7bd0ff" percent={count / Math.max(1, directories[0][1]) * 100} showInfo={false}/></div>)}</article>
          <article className="panel"><h2>Highest-severity findings</h2><p>Open each finding to review its source location and scanner evidence.</p>{[...findings].sort((a,b) => (ranks[a.severity] ?? 9) - (ranks[b.severity] ?? 9)).slice(0, 4).map(f => <div className="priority-row" key={f.id}><Badge value={f.severity}/><Button type="link" onClick={() => issueRoute({},f.id)}>{f.message}</Button><small>{f.file}:{f.line}</small></div>)}</article>
          <article className="panel investigation-panel"><h2>Investigation priorities</h2><p>Clusters with repeated high-severity findings from the same rule and source area. Inspect shared code, configuration, or data flow first; one change is not assumed to resolve the cluster.</p><Alert type="warning" showIcon title="Heuristic guidance" description="Static scanners can correlate symptoms without proving a common cause. Validate control flow, runtime behavior, and tests before changing logic."/>{investigationCandidates.map((candidate, i) => <div className="candidate" key={`${candidate.rule}:${candidate.directory}`}><span>{i + 1}</span><div><strong>{candidate.rule}</strong><small>{candidate.directory} · {candidate.rows.length.toLocaleString()} findings · {new Set(candidate.rows.map(f => f.file)).size} files</small></div><Button onClick={() => issueRoute({rule:candidate.rule,directory:candidate.directory,group:'rule'})}>Investigate cluster</Button></div>)}</article>
        </section>}
        {r.tab === 'issues' && <>
          {directory && <Tag closable onClose={() => setDirectory('')}>Directory: {directory}</Tag>}
          <div className="filters"><Input aria-label="Search issues" prefix={<SearchOutlined/>} placeholder="Search message, file, rule, or scanner" allowClear value={query} onChange={e => setQuery(e.target.value)}/>
            <Select aria-label="Severity" value={severity} onChange={setSeverity} options={[{ value: '', label: 'All severities' }, ...Object.keys(ranks).map(s => ({ value: s, label: s }))]}/>
            <Select aria-label="Category" showSearch optionFilterProp="label" value={category} onChange={setCategory} options={[{value:'',label:'All categories'},...issueOptions.categories.map(value=>({value,label:value}))]}/>
            <Select aria-label="Scanner" showSearch optionFilterProp="label" value={scanner} onChange={setScanner} options={[{ value: '', label: 'All scanners' }, ...[...new Set(findings.flatMap(f => f.scanners))].sort().map(s => ({ value: s, label: s }))]}/>
            <Button aria-expanded={moreFilters} onClick={()=>setMoreFilters(value=>!value)}>{moreFilters?'Fewer filters':'More filters'}</Button>
            {moreFilters&&<><Select aria-label="Rule" showSearch optionFilterProp="label" value={rule} onChange={setRule} options={[{value:'',label:'All rules'},...issueOptions.rules.map(value=>({value,label:value}))]}/>
            <Select aria-label="File" showSearch optionFilterProp="label" value={file} onChange={setFile} options={[{value:'',label:'All files'},...issueOptions.files.map(value=>({value,label:value}))]}/>
            <Select aria-label="Directory" showSearch optionFilterProp="label" value={directory} onChange={setDirectory} options={[{value:'',label:'All directories'},...issueOptions.directories.map(value=>({value,label:value}))]}/>
            <Select aria-label="Source location" value={locationFilter} onChange={setLocationFilter} options={[{value:'',label:'Any source location'},{value:'located',label:'File and line available'},{value:'unlocated',label:'Missing file or line'}]}/>
            <Select aria-label="Scanner overlap" value={overlap} onChange={setOverlap} options={[{value:'',label:'Any scanner support'},{value:'multiple',label:'Multiple scanners'},{value:'single',label:'Single scanner'}]}/></>}
            <Button onClick={resetFilters}>Clear filters</Button>
            <Select aria-label="Group issues" value={groupBy} onChange={setGroupBy} options={[{ value: 'none', label: 'No grouping' }, {value:'category',label:'Group by category'}, { value: 'rule', label: 'Group by rule' }, { value: 'file', label: 'Group by file' }, { value: 'directory', label: 'Group by directory' }, { value: 'scanner', label: 'Group by scanner' }]}/>
            <span>{filtered.length.toLocaleString()} results</span>
          </div>
          <div className={r.issue && screens.lg ? "findings-workspace split" : "findings-workspace"}><div className="findings-list">{groupBy !== 'none' ? <Collapse className="issue-groups" items={grouped.map(([name, rows]) => ({ key: name, label: <span><strong>{name}</strong><Tag>{rows.length.toLocaleString()} findings</Tag></span>, children: <div className="group-findings">{rows.slice(0, 100).map(f => <Button type="link" className="related-finding" key={f.id} onClick={() => navigate(target!.id, 'issues', f.id)}><Badge value={f.severity}/><span>{f.message}</span><small>{f.file}:{f.line} · {f.scanners.join(', ')}</small></Button>)}{rows.length > 100 && <p>Showing the first 100 findings in this group. Narrow the filters to inspect more.</p>}</div> }))}/> : <Table<Finding> rowKey="id" size="middle" dataSource={filtered} scroll={{ x: r.issue && screens.lg ? undefined : 760 }} rowClassName={f => r.issue === f.id ? 'selected' : ''} locale={{ emptyText: 'No findings match these filters.' }} pagination={{ current: page + 1, pageSize: 50, showSizeChanger: false, onChange: p => setPage(p - 1), showTotal: total => `${total.toLocaleString()} findings` }} columns={r.issue && screens.lg ? [{title:'Findings',key:'compact',render:(_,f) => <><Badge value={f.severity}/><Button type="link" className="issue-link" onClick={() => navigate(target!.id, 'issues', f.id)}>{f.message}</Button><small>{f.file}:{f.line}</small><small>{f.scanners.join(', ')} | {f.rules.join(', ')}</small></>}] : [
            { title: 'Severity', key: 'severity', width: 120, render: (_, f) => <Badge value={f.severity}/> },
            { title: 'Issue and source', key: 'issue', render: (_, f) => <><Button type="link" className="issue-link" onClick={() => navigate(target!.id, 'issues', f.id)}>{f.message}</Button><small>{f.file}{f.line ? `:${f.line}` : ''}</small></> },
            { title: 'Scanner / rule', key: 'scanner', width: 240, render: (_, f) => <>{f.scanners.join(', ')}<small>{f.rules.join(', ')}</small></> }
          ]}/>}</div>
          {r.issue && screens.lg && <section className="evidence-panel" aria-label="Issue detail"><div className="pane-heading"><h2>Issue detail</h2><Button onClick={() => navigate(target!.id, 'issues')}>Close issue</Button></div><Evidence detail={detail} source={source} error={error} findings={findings} openFinding={id => navigate(target!.id, 'issues', id)}/></section>}
          </div>
        </>}
      </>}
      <Drawer title="Issue detail" open={!!r.issue && r.tab === 'issues' && !screens.lg} onClose={() => navigate(target?.id || '', 'issues')} size="min(850px, 100vw)" destroyOnHidden>
        <Evidence detail={detail} source={source} error={error} findings={findings} openFinding={id => navigate(target?.id || '', 'issues', id)}/>
      </Drawer>
      <footer>Findings are scanner observations, not confirmed defects.</footer>
    </main>
  </AppShell></ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<AppearanceProvider><DashboardAccess publicFallback={(auth,accessError,accessPending,workspaceRequested)=><LandingPage auth={auth} accessError={accessError} accessPending={accessPending} workspaceRequested={workspaceRequested} onStart={() => { try { sessionStorage.setItem('analysis-workspace-requested', 'true'); } catch {} location.hash=routeHash({kind:'projects'}); }} />}>{auth=><App viewerAuth={auth}/>}</DashboardAccess></AppearanceProvider>);
