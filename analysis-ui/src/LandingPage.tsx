import {Alert,Button,ConfigProvider} from 'antd';
import {ArrowRightOutlined,BranchesOutlined,CheckCircleFilled,FileProtectOutlined,GithubOutlined,LockOutlined,RadarChartOutlined,SafetyCertificateOutlined,ScanOutlined} from '@ant-design/icons';
import type {useLaunchAuth} from './useLaunchAuth';
import {AppearanceToggle,useAppearance} from './Appearance';
import './landing.css';
import trustLabLogo from './assets/trustlab-logo.jpg';
import mphasisLogo from './assets/mphasis-logo.jpg';
import {applicationTheme} from './brand';

type Auth=ReturnType<typeof useLaunchAuth>;
const projects=[
 {name:'Kavach AgenticSOC',sha:'db8d9357e430',coverage:'18 / 18'},
 {name:'Agentic Kibana',sha:'22d4d2c3b3bb',coverage:'18 / 18'},
 {name:'Code Analysis',sha:'ec88c8def1a8',coverage:'14 / 14'},
];

export function LandingPage({auth,onStart,accessError,accessPending=false,workspaceRequested=false}:{auth:Auth;onStart:()=>void;accessError?:string;accessPending?:boolean;workspaceRequested?:boolean}){
 const {appearance}=useAppearance(),signedIn=Boolean(auth.session)&&!accessError,checking=workspaceRequested&&accessPending,primaryAction=signedIn?onStart:auth.signIn,primaryLabel=checking?'Verifying access…':signedIn?'Open workspace':'Sign in with GitHub';
 return <ConfigProvider theme={applicationTheme(appearance)}><main className="landing-page" id="top"><div className="landing-wrap">
  <nav className="landing-nav" aria-label="Main navigation">
   <a className="landing-brand" href="#top" aria-label="Code Analysis home"><span className="landing-brand-mark"><ScanOutlined/></span><span className="landing-wordmark"><strong>Code Analysis</strong><small>Traceable security evidence</small></span></a>
   <div className="landing-institutions" aria-label="Built by IIT Bombay Trust Lab with Mphasis"><span>Built by</span><img src={trustLabLogo} alt="IIT Bombay Trust Lab"/><i>with</i><img src={mphasisLogo} alt="Mphasis"/></div>
   <div className="landing-nav-right"><AppearanceToggle className="landing-theme-toggle"/>{signedIn&&<span className="landing-user">@{auth.session?.login}</span>}<Button className="landing-nav-cta" icon={signedIn?undefined:<GithubOutlined/>} onClick={primaryAction} disabled={checking||(!signedIn&&!auth.available)}>{primaryLabel}</Button></div>
  </nav>

  <section className="landing-hero" aria-labelledby="landing-title">
   <div className="landing-copy"><span className="landing-kicker"><i/> Evidence workspace for engineering teams</span><h1 id="landing-title">Know what was scanned.<br/><em>Prove what was found.</em></h1><p>Turn every security review into a verifiable record—pinned to the exact source revision, scanner run, coverage state, and published report.</p><div className="landing-actions"><Button type="primary" size="large" icon={signedIn?<ArrowRightOutlined/>:<GithubOutlined/>} onClick={primaryAction} disabled={checking||(!signedIn&&!auth.available)}>{primaryLabel}</Button><a className="landing-secondary-action" href="#method">See how evidence works <ArrowRightOutlined/></a></div>{!signedIn&&<p className="landing-auth-hint"><LockOutlined/> Restricted to approved GitHub collaborators.</p>}{workspaceRequested&&!accessError&&<p className="landing-auth-hint">{accessPending?'Verifying your workspace access…':'Sign in to continue to the requested workspace.'}</p>}{!auth.available&&!auth.error&&<p className="landing-auth-hint">GitHub sign-in is temporarily unavailable.</p>}{(accessError||auth.error)&&<Alert className="landing-error" type="error" showIcon title="Sign-in interrupted" description={<span>{accessError||auth.error} <button type="button" onClick={auth.signIn}>Try again</button></span>}/>}</div>

   <aside className="analysis-dossier" aria-label="Current project evidence preview"><header><div><span>Evidence register</span><strong>Current project coverage</strong></div><span className="dossier-live"><i/> Published</span></header><div className="dossier-columns"><span>Project</span><span>Revision</span><span>Scanners</span></div>{projects.map((project,index)=><div className="dossier-row" key={project.name}><span className="dossier-index">0{index+1}</span><div><strong>{project.name}</strong><small>{index===2?'Connected project':'Read-only source'}</small></div><code>{project.sha}</code><span className="dossier-coverage"><CheckCircleFilled/>{project.coverage}</span></div>)}<footer><span><FileProtectOutlined/> Reports retain exact workflow provenance</span><span>3 trusted projects</span></footer></aside>
  </section>

  <section className="landing-proof" aria-label="Product capabilities"><div><strong>3</strong><span>trusted repositories<br/>in one evidence register</span></div><div><strong>Parallel</strong><span>isolated scanner lanes<br/>without a global queue</span></div><div><strong>Immutable</strong><span>source and tooling<br/>provenance per report</span></div></section>

  <section className="method-section" id="method"><header><span className="landing-kicker">From commit to defensible report</span><h2>Evidence that answers the questions a status badge cannot.</h2><p>Every stage preserves enough context for an engineer, reviewer, or program owner to verify the result without reconstructing the run.</p></header><div className="method-grid"><article><span className="method-number">01</span><BranchesOutlined/><h3>Pin the source</h3><p>The repository, branch, immutable SHA, profile, tooling revision, and requesting actor are frozen at admission.</p><b>Repository → immutable revision</b></article><article><span className="method-number">02</span><RadarChartOutlined/><h3>Run isolated scanners</h3><p>Independent lanes analyze concurrently. Missing, failed, and deferred coverage stays explicit instead of disappearing.</p><b>Scanner run → honest coverage</b></article><article><span className="method-number">03</span><FileProtectOutlined/><h3>Publish with receipts</h3><p>Findings, workflow run, attempt, channel evidence, and publication time remain attached to the report.</p><b>Evidence → reviewable report</b></article></div></section>

  <section className="assurance-section"><div className="assurance-copy"><span className="landing-kicker">Designed for scrutiny</span><h2>A workspace for reviewing evidence—not watching jobs move through a queue.</h2><p>Start with the current report. See the exact revision and coverage boundary. Run new analysis only when the evidence needs to change.</p><Button type="primary" size="large" onClick={primaryAction} disabled={checking||(!signedIn&&!auth.available)}>{signedIn?'Review project evidence':'Enter the workspace'} <ArrowRightOutlined/></Button></div><div className="assurance-list"><div><SafetyCertificateOutlined/><span><strong>Exact provenance</strong><small>Source, tooling, workflow, attempt, and publication identity.</small></span></div><div><LockOutlined/><span><strong>Credential isolation</strong><small>Source-executing jobs cannot publish or access vendor credentials.</small></span></div><div><RadarChartOutlined/><span><strong>Honest limitations</strong><small>Incomplete channels remain visible alongside healthy evidence.</small></span></div></div></section>

  <footer className="landing-footer"><div><span className="landing-footer-mark"><ScanOutlined/></span><span><strong>Code Analysis</strong><small>Traceable evidence for trusted projects</small></span></div><div className="landing-partner-lockup"><img src={trustLabLogo} alt="IIT Bombay Trust Lab"/><span>×</span><img src={mphasisLogo} alt="Mphasis"/></div><span>Read-only analysis · Access controlled with GitHub</span></footer>
 </div></main></ConfigProvider>;
}
