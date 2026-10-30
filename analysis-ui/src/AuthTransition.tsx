import type {useLaunchAuth} from './useLaunchAuth';
import {AppearanceToggle} from './Appearance';
import {InstitutionalLockup} from './InstitutionalLockup';
import './auth.css';

type Auth=ReturnType<typeof useLaunchAuth>;

function copyFor(auth:Auth,accessPending:boolean){
 if(auth.stage==='redirecting')return{title:'Opening GitHub',detail:'Continue securely on GitHub to confirm your identity.'};
 if(auth.stage==='exchanging')return{title:'Confirming GitHub access',detail:'GitHub is confirming your identity and collaborator access.'};
 if(auth.stage==='verifying'||accessPending)return{title:'Returning you to Projects',detail:'Your approved workspace is being prepared.'};
 return{title:'Sign-in interrupted',detail:auth.error||'GitHub sign-in could not be completed.'};
}

export function AuthTransition({auth,accessError,accessPending=false}:{auth:Auth;accessError?:string;accessPending?:boolean}){
 const copy=copyFor(auth,accessPending),failed=Boolean(accessError||auth.error)&&!auth.pending&&!accessPending;
 const active=failed?1:auth.stage==='redirecting'?0:auth.stage==='exchanging'?1:2;
 const steps=['GitHub','Verify access','Open Projects'];
 return <main className="auth-transition">
  <header className="auth-transition-header"><InstitutionalLockup className="landing-brand" href="#/projects"/><AppearanceToggle className="landing-theme-toggle"/></header>
  <section className="auth-transition-panel" aria-labelledby="auth-transition-title" aria-label="GitHub sign-in progress" role={failed?'alert':'status'} aria-live="polite" aria-atomic="true">
   <div className="auth-transition-copy"><span className="auth-github-mark" aria-hidden="true">GH</span><div><span className="landing-kicker">GitHub-controlled access</span><h1 id="auth-transition-title">{failed?'Sign-in interrupted':copy.title}</h1><p>{accessError||auth.error||copy.detail}</p></div></div>
   {!failed&&<ol className="auth-transition-steps" aria-label="Sign-in progress">{steps.map((step,index)=><li key={step} className={index<active?'is-complete':index===active?'is-active':''}><i aria-hidden="true">{index<active?'✓':index+1}</i><span>{step}</span></li>)}</ol>}
   <div className="auth-transition-note"><span aria-hidden="true">◇</span><small>GitHub handles your credentials. The dashboard receives only an opaque, short-lived application session.</small></div>
   {failed&&<button type="button" className="landing-button landing-button-primary" onClick={auth.state.status==='recoverable_error'&&auth.state.error.action==='RETRY'?auth.retry:auth.signIn}>{auth.state.status==='recoverable_error'&&auth.state.error.action==='RETRY'?'Retry access check':'Start sign-in again'}</button>}
  </section>
 </main>;
}
