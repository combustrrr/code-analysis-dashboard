import type {useLaunchAuth} from './useLaunchAuth';
import {AppearanceToggle} from './Appearance';
import './landing.css';
import './landing-footer.css';
import './brand-landing.css';
import './auth.css';
import './landing-controls.css';
import {InstitutionalLockup} from './InstitutionalLockup';

type Auth=ReturnType<typeof useLaunchAuth>;
const projects=[
 {name:'Kavach AgenticSOC',sha:'db8d9357e430',coverage:'18 / 18'},
 {name:'Agentic Kibana',sha:'22d4d2c3b3bb',coverage:'18 / 18'},
 {name:'Code Analysis',sha:'ec88c8def1a8',coverage:'14 / 14'},
];
const Glyph=({children}:{children:string})=><span className="landing-glyph" aria-hidden="true">{children}</span>;

function AuthJourney({stage}:{stage:Auth['stage']}){
 const verifying=stage==='verifying';
 return <section className="auth-journey" role="status" aria-live="polite" aria-label="GitHub sign-in progress">
  <div className="auth-journey-heading"><span className="auth-github-mark" aria-hidden="true">GH</span><div><strong>{stage==='redirecting'?'Opening GitHub':verifying?'Verifying workspace access':'Confirming your GitHub sign-in'}</strong><small>{stage==='redirecting'?'Continue securely on GitHub.':verifying?'Your identity is confirmed. Checking approved collaborator access.':'Exchanging GitHub’s one-time authorization response.'}</small></div></div>
  <ol className="auth-journey-steps">
   <li className={stage==='redirecting'?'is-active':'is-complete'}><i aria-hidden="true">{stage==='redirecting'?'1':'✓'}</i><span>GitHub authorization</span></li>
   <li className={stage==='exchanging'?'is-active':verifying?'is-complete':''}><i aria-hidden="true">{verifying?'✓':'2'}</i><span>Secure exchange</span></li>
   <li className={verifying?'is-active':''}><i aria-hidden="true">3</i><span>Workspace access</span></li>
  </ol>
  <p>GitHub handles your credentials. This dashboard receives a short-lived authorization result and never sees your password.</p>
 </section>;
}

export function LandingPage({auth,onStart,accessError,accessPending=false,workspaceRequested=false}:{auth:Auth;onStart:()=>void;accessError?:string;accessPending?:boolean;workspaceRequested?:boolean}){
 const signedIn=Boolean(auth.session)&&!accessError,checking=auth.pending||(workspaceRequested&&accessPending),primaryAction=signedIn?onStart:auth.signIn,primaryLabel=auth.pending?'Signing in...':checking?'Verifying access...':signedIn?'Open workspace':'Sign in with GitHub',disabled=checking||(!signedIn&&!auth.available);
 return <main className="landing-page" id="top"><div className="landing-wrap">
  <nav className="landing-nav" aria-label="Main navigation"><InstitutionalLockup className="landing-brand" href="#top"/><div className="landing-nav-right"><AppearanceToggle className="landing-theme-toggle"/>{signedIn&&<span className="landing-user">@{auth.session?.login}</span>}<button type="button" className="landing-button landing-button-primary landing-nav-cta" onClick={primaryAction} disabled={disabled}>{primaryLabel}</button></div></nav>
  <section className="landing-hero" aria-labelledby="landing-title">
   <div className="landing-copy"><span className="landing-kicker"><i/> Security evidence for engineering teams</span><h1 id="landing-title">Know exactly what was scanned.<br/><em>Prove what the analysis found.</em></h1><p>Each security review becomes a verifiable record tied to the exact source revision, scanner runs, coverage, and published report.</p><div className="landing-actions"><button type="button" className="landing-button landing-button-primary" onClick={primaryAction} disabled={disabled}>{primaryLabel} <span aria-hidden="true">→</span></button><a className="landing-secondary-action" href="#method">Learn how evidence is protected →</a></div>{!signedIn&&!auth.pending&&<p className="landing-auth-hint"><Glyph>●</Glyph> Only approved GitHub collaborators can access this workspace.</p>}{auth.pending&&<AuthJourney stage={auth.stage}/>} {workspaceRequested&&!accessError&&!auth.pending&&<p className="landing-auth-hint">{accessPending?'Checking your workspace access...':'Sign in to open the requested workspace.'}</p>}{!auth.available&&!auth.error&&<p className="landing-auth-hint">GitHub sign-in is temporarily unavailable. Try again shortly.</p>}{(accessError||auth.error)&&!auth.pending&&<div className="landing-error" role="alert"><strong>Sign-in interrupted</strong><span>{accessError||auth.error} <button type="button" onClick={auth.signIn}>Start sign-in again</button></span></div>}</div>
   <aside className="analysis-dossier" aria-label="Current project evidence preview"><header><div><span>Evidence register</span><strong>Coverage across current reports</strong></div><span className="dossier-live"><i/> Published</span></header><div className="dossier-columns"><span>Project</span><span>Revision</span><span>Scanners</span></div>{projects.map((project,index)=><div className="dossier-row" key={project.name}><span className="dossier-index">0{index+1}</span><div><strong>{project.name}</strong><small>{index===2?'Connected project':'Read-only source'}</small></div><code>{project.sha}</code><span className="dossier-coverage"><Glyph>✓</Glyph>{project.coverage}</span></div>)}<footer><span><Glyph>▣</Glyph> Every report retains its workflow history</span><span>3 trusted projects</span></footer></aside>
  </section>
  <section className="landing-proof" aria-label="Product capabilities"><div><strong>3</strong><span>trusted repositories<br/>in one evidence register</span></div><div><strong>Parallel</strong><span>scanner channels run<br/>independently</span></div><div><strong>Immutable</strong><span>every report records<br/>its source and tooling</span></div></section>
  <section className="method-section" id="method"><header><span className="landing-kicker">From commit to defensible report</span><h2>Evidence answers questions that a status badge cannot.</h2><p>Each stage preserves the context that engineers, reviewers, and program owners need to verify a result without reconstructing the analysis.</p></header><div className="method-grid"><article><span className="method-number">01</span><Glyph>⑂</Glyph><h3>Record the source</h3><p>When analysis begins, the report records the repository, branch, immutable SHA, profile, tooling revision, and requesting user.</p><b>Repository → immutable revision</b></article><article><span className="method-number">02</span><Glyph>◎</Glyph><h3>Run scanners independently</h3><p>Scanner channels run at the same time. Missing, failed, and deferred coverage remains visible in the final report.</p><b>Scanner runs → explicit coverage</b></article><article><span className="method-number">03</span><Glyph>▣</Glyph><h3>Publish a verifiable report</h3><p>The report retains its findings, workflow run, attempt, channel evidence, and publication time.</p><b>Evidence → reviewable report</b></article></div></section>
  <section className="assurance-section"><div className="assurance-copy"><span className="landing-kicker">Designed for careful review</span><h2>Review the evidence instead of tracking jobs through a queue.</h2><p>Start with the latest report. Confirm the exact revision and coverage, then run another analysis only when the evidence must be updated.</p><button type="button" className="landing-button landing-button-primary" onClick={primaryAction} disabled={disabled}>{signedIn?'Review project evidence':'Open the workspace'} →</button></div><div className="assurance-list"><div><Glyph>✓</Glyph><span><strong>Complete history</strong><small>Each report identifies its source, tooling, workflow, attempt, and publication.</small></span></div><div><Glyph>●</Glyph><span><strong>Isolated credentials</strong><small>Scanner jobs cannot publish reports or access vendor credentials.</small></span></div><div><Glyph>◎</Glyph><span><strong>Visible limitations</strong><small>Incomplete scanner results remain visible beside successful evidence.</small></span></div></div></section>
  <footer className="landing-footer"><div className="landing-footer-copy"><strong>Code Analysis</strong><span>Traceable evidence for trusted projects</span></div><span className="landing-footer-policy">Read-only analysis <i aria-hidden="true"/> GitHub-controlled access</span></footer>
 </div></main>;
}
