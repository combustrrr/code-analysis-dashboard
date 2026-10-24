import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {Alert,Button,Empty,Select,Skeleton,Tag} from './ui';
import {FolderOpenOutlined,LinkOutlined,SafetyCertificateOutlined,SettingOutlined} from './icons';
import {Connections} from './Integration';
import {AppearanceToggle} from './Appearance';
import {applicationEndpoint} from './repositoryReports';
import {parseAppRoute,routeHash,type SettingsSection} from './appRoutes';
import type {useLaunchAuth} from './useLaunchAuth';
import './settings.css';

type Auth=ReturnType<typeof useLaunchAuth>;
type Lifecycle='Preparing'|'Analyzing'|'Ready'|'Needs attention';
type Project={id:string;source_repository:string;preferred_branch:string;relationship:string;lifecycle?:Lifecycle;attention_reason?:string|null;active_analysis?:{request_id:string;status:string;target_sha?:string|null}|null;readiness_summary?:{profile_mode:'agentic-soc'|'portable';configured_channels:number;selectable_channels:number;vendor_channels:number;deferred_channels:number;unavailable_channels:number};current_report?:{status:string;source_sha?:string;analyzed_sha?:string;generated_at?:string|null;scanner_summary?:{completed:number;total:number;incomplete:number}}|null};
type Registry={checked_at?:string;summary?:{projects:number;preparing:number;analyzing:number;needs_attention:number};execution_repository:{full_name:string};can_launch:boolean;can_configure:boolean;projects:Project[]};

const sections:{key:SettingsSection;label:string;description:string;icon:ReactNode}[]=[
 {key:'general',label:'Overview',description:'Preferences and access',icon:<SettingOutlined/>},
 {key:'projects',label:'Projects',description:'Trusted source registry',icon:<FolderOpenOutlined/>},
 {key:'connections',label:'Integrations',description:'Connections and readiness',icon:<LinkOutlined/>},
 {key:'provenance',label:'Security & provenance',description:'Evidence boundaries',icon:<SafetyCertificateOutlined/>},
];

function reportState(project:Project){
 if(project.lifecycle)return project.lifecycle;
 if(project.current_report?.status==='complete')return'Ready';
 return'Needs attention';
}

function scannerCoverage(project:Project){
 const summary=project.current_report?.scanner_summary;
 if(summary&&summary.total>0)return`${summary.completed} of ${summary.total}`;
 const configured=project.readiness_summary?.configured_channels||0;
 return configured>0?`${configured} configured · evidence pending`:'Evidence not reported';
}

function SectionIntro({eyebrow,title,children}:{eyebrow:string;title:string;children:ReactNode}){
 return <header className="settings-section-intro"><span>{eyebrow}</span><h2>{title}</h2><p>{children}</p></header>;
}

export function Settings({auth,onRun}:{auth:Auth;onRun:(projectId:string)=>void}){
 const current=parseAppRoute();const route=current.kind==='settings'?current:{kind:'settings' as const,section:'general' as const};
 const [registry,setRegistry]=useState<Registry>();const [error,setError]=useState('');
 useEffect(()=>{let active=true;setError('');auth.api<Registry>('projects').then(value=>{if(active)setRegistry(value)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Settings are unavailable.')});return()=>{active=false}},[auth.session?.token]);
 const selected=useMemo(()=>registry?.projects.find(project=>project.id===route.projectId)||registry?.projects[0],[registry,route.projectId]);
 const navigate=(section:SettingsSection,projectId=selected?.id)=>{location.hash=routeHash({kind:'settings',section,projectId})};
 const projectControl=registry&&registry.projects.length>0&&<label className="settings-project-picker"><span>Project context</span><Select aria-label="Settings project" value={selected?.id} options={registry.projects.map(project=>({value:project.id,label:project.source_repository}))} onChange={projectId=>navigate(route.section,projectId)}/></label>;
 let content:ReactNode;
 if(route.section==='general')content=<section className="settings-content-section">
  <SectionIntro eyebrow="Workspace overview" title="Preferences and access">Review the settings that apply to this browser and your current GitHub session.</SectionIntro>
  <div className="settings-overview-grid">
   <article className="settings-control-card"><div><span className="settings-card-label">Appearance</span><h3>Choose your workspace theme</h3><p>Dark mode is the default. Your choice is stored only in this browser and does not affect other collaborators.</p></div><AppearanceToggle/></article>
   <article className="settings-control-card"><div><span className="settings-card-label">Account</span><h3>{auth.session?.login?`Signed in as @${auth.session.login}`:'GitHub session unavailable'}</h3><p>{auth.session?'Your account is authorized to review this evidence workspace.':'Sign in again to review workspace evidence.'}</p></div>{auth.session&&<Button danger onClick={auth.signOut}>Sign out</Button>}</article>
  </div>
  <article className="settings-snapshot" aria-label="Workspace snapshot"><header><div><span className="settings-card-label">Workspace snapshot</span><h3>Current access and configuration</h3></div><Tag color="blue">Read only</Tag></header><dl><div><dt>Trusted projects</dt><dd>{registry?.projects.length??'—'}</dd></div><div><dt>Run analyses</dt><dd>{registry?registry.can_launch?'Allowed':'Not allowed':'—'}</dd></div><div><dt>Change registry</dt><dd>{registry?registry.can_configure?'Through GitHub':'Administrator only':'—'}</dd></div><div><dt>Execution host</dt><dd><code>{registry?.execution_repository.full_name||'Loading'}</code></dd></div></dl></article>
 </section>;
 else if(route.section==='projects')content=<section className="settings-content-section">
  <SectionIntro eyebrow="Trusted registry" title="Projects">These source identities and preferred branches are version controlled. The dashboard cannot silently add or replace them.</SectionIntro>
   {!registry&&!error?<div className="settings-project-list" aria-label="Loading projects">{[1,2,3].map(item=><article className="settings-project-row" key={item}><Skeleton active paragraph={{rows:1}} title={{width:'45%'}}/></article>)}</div>:registry?.projects.length?<div className="settings-project-list">{registry.projects.map(project=>{const state=reportState(project),readiness=project.readiness_summary;return <article className="settings-project-row" key={project.id}><div className="settings-project-identity"><span>{project.relationship==='connected'?'Connected project':'Read-only source'}</span><strong>{project.source_repository}</strong><small>Preferred branch <code>{project.preferred_branch}</code></small>{project.active_analysis&&<small>Active request <code>{project.active_analysis.request_id}</code>{project.active_analysis.target_sha&&<> · revision <code>{project.active_analysis.target_sha.slice(0,12)}</code></>}</small>}</div><dl><div><dt>Analysis profile</dt><dd>{readiness?.profile_mode==='portable'?'Portable':'Configured source'}</dd></div><div><dt>Selectable channels</dt><dd>{readiness?`${readiness.selectable_channels} available${readiness.vendor_channels?` · ${readiness.vendor_channels} vendor`:''}`:'Not verified'}</dd></div><div><dt>Scanner evidence</dt><dd>{scannerCoverage(project)}</dd></div><div><dt>Lifecycle</dt><dd><Tag color={state==='Ready'?'green':state==='Needs attention'?'orange':'blue'}>{state}</Tag></dd></div></dl><Button href={routeHash({kind:'project',projectId:project.id,view:'overview'})}>Open project</Button></article>})}</div>:!error&&<Empty description="No trusted projects are configured. Ask a workspace administrator to review the version-controlled registry."/>}
  {registry?.can_configure&&<aside className="settings-version-note"><div><strong>Configuration is version controlled</strong><p>Review approved registry changes and their authors in GitHub.</p></div><Button href={`https://github.com/${registry.execution_repository.full_name}/commits/main/.github/code-analysis/projects.json`} target="_blank">View registry history</Button></aside>}
 </section>;
 else if(route.section==='connections')content=<section className="settings-content-section"><SectionIntro eyebrow="Selected project" title="Integrations">Verify how the selected source reaches isolated scanner workflows and the published evidence workspace.</SectionIntro>{selected&&registry?<Connections auth={auth} repository={registry.execution_repository.full_name} project={selected.id} source={selected.source_repository} host={registry.execution_repository.full_name} endpoint={applicationEndpoint} canLaunch={registry.can_launch} start={()=>onRun(selected.id)}/>:!error&&<Empty description="Choose a configured project to inspect its integrations."/>}</section>;
 else content=<section className="settings-content-section">
  <SectionIntro eyebrow="Trust boundary" title="Security & provenance">Confirm which immutable source and execution identities the current evidence is allowed to represent.</SectionIntro>
  {selected?<><div className="provenance-boundary"><div><span>Source repository</span><strong>{selected.source_repository}</strong><small>Preferred branch <code>{selected.preferred_branch}</code></small></div><i/><div><span>Isolated execution</span><strong>{registry?.execution_repository.full_name||'Unavailable'}</strong><small>Scanner jobs cannot publish reports.</small></div><i/><div><span>Evidence lifecycle</span><strong>{reportState(selected)}</strong><small><code>{selected.current_report?.analyzed_sha||selected.current_report?.source_sha||selected.active_analysis?.target_sha||'Revision unavailable'}</code></small>{selected.active_analysis&&<small>Request <code>{selected.active_analysis.request_id}</code></small>}</div></div><div className="security-principles"><article><SafetyCertificateOutlined/><div><h3>Immutable evidence</h3><p>Every report remains bound to its exact source revision, tooling revision, workflow run, and attempt.</p></div></article><article><SafetyCertificateOutlined/><div><h3>Separated credentials</h3><p>Source-executing scanner jobs cannot access publication or vendor credentials owned by other lanes.</p></div></article><article><SafetyCertificateOutlined/><div><h3>Explicit limitations</h3><p>Incomplete scanner evidence remains visible and healthy sibling evidence is preserved.</p></div></article></div><Button type="primary" href={routeHash({kind:'project',projectId:selected.id,view:'report'})}>Review full report provenance</Button></>:!error&&<Empty description="No configured project is available for provenance review."/>}
 </section>;

 return <main className="settings-workspace">
  <header className="settings-heading"><div><span className="eyebrow">Workspace control center</span><h1>Settings</h1><p>Review personal preferences, trusted source configuration, integration readiness, and evidence boundaries.</p></div></header>
  {error&&<Alert className="settings-error" type="error" showIcon title="Settings could not be loaded" description={`${error} Return to Projects or try this page again.`}/>}
  <label className="settings-mobile-section"><span>Settings section</span><Select aria-label="Settings section" value={route.section} options={sections.map(section=>({value:section.key,label:section.label}))} onChange={section=>navigate(section)}/></label>
  <div className="settings-control-plane"><aside className="settings-rail" aria-label="Settings sections"><span>Control center</span>{sections.map(section=><a key={section.key} className={route.section===section.key?'active':''} aria-current={route.section===section.key?'page':undefined} href={routeHash({kind:'settings',section:section.key,projectId:selected?.id})}>{section.icon}<strong>{section.label}</strong></a>)}</aside><div className="settings-panel">{route.section!=='general'&&<header className="settings-project-context">{projectControl}</header>}{content}</div></div>
 </main>;
}
