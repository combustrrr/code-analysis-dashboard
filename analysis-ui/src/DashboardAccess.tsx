import {useEffect,useState,type ReactNode} from 'react';
import {pendingAuthDestination,restoreAuthDestination,useLaunchAuth} from './useLaunchAuth';
import {applicationEndpoint,setReportSession} from './repositoryReports';
import {isWorkspaceRoute,routeHash} from './appRoutes';

export function DashboardAccess({children,publicFallback}:{children:(auth?:ReturnType<typeof useLaunchAuth>)=>ReactNode;publicFallback?:(auth:ReturnType<typeof useLaunchAuth>,accessError?:string,accessPending?:boolean,workspaceRequested?:boolean)=>ReactNode}) {
 const auth=useLaunchAuth(applicationEndpoint);
 // Repository deployments are known to require GitHub access at build time.
 // Start OAuth immediately instead of blocking first paint on a config round trip.
 const [required,setRequired]=useState<boolean|undefined>(()=>import.meta.env.VITE_APPLICATION_MODE==='repositories'?true:undefined);
 const [verified,setVerified]=useState<string>();
 const [error,setError]=useState('');
 const [workspaceRequested,setWorkspaceRequested]=useState(()=>isWorkspaceRoute()||Boolean(pendingAuthDestination()?.includes('#/')));
 useEffect(()=>{if(!applicationEndpoint)return;let active=true;
  fetch(applicationEndpoint+'/api/public/config',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Access configuration unavailable.');return r.json();}).then(c=>{if(active)setRequired(c.require_login===true||c.require_report_login===true);}).catch(()=>{if(active)setError('Could not verify dashboard access. Reload to retry.');});return()=>{active=false;};
 },[]);
 useEffect(()=>{const update=()=>setWorkspaceRequested(isWorkspaceRoute());window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 useEffect(()=>{setVerified(undefined);setReportSession(undefined);if(!required||!auth.session)return;
  let active=true;const token=auth.session.token;
  const verify=async(recheck=false)=>{try{if(recheck||!auth.verified)await auth.api('session');if(active){setReportSession(token);setVerified(token);setError('');}}catch(e){if(active){setReportSession(undefined);setVerified(undefined);setError(e instanceof Error?e.message:'GitHub access could not be verified.');restoreAuthDestination();auth.signOut();}}};
  const denied=()=>{setReportSession(undefined);setVerified(undefined);setError('Access expired or was revoked. Sign in with an authorized GitHub account.');auth.signOut();};
  let lastVerified=Date.now();
  const recheck=()=>{if(!document.hidden&&Date.now()-lastVerified>=5*60*1000){lastVerified=Date.now();void verify(true);}};
  void verify();const timer=window.setInterval(recheck,5*60*1000);document.addEventListener('visibilitychange',recheck);window.addEventListener('focus',recheck);window.addEventListener('analysis-access-denied',denied);
  return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',recheck);window.removeEventListener('focus',recheck);window.removeEventListener('analysis-access-denied',denied);setReportSession(undefined);};
 },[required,auth.session?.token,auth.verified]);
 useEffect(()=>{if(!auth.session||verified!==auth.session.token)return;try{const restored=restoreAuthDestination();if(sessionStorage.getItem('analysis-workspace-requested')==='true'){sessionStorage.removeItem('analysis-workspace-requested');if(!isWorkspaceRoute())location.hash=routeHash({kind:'projects'});setWorkspaceRequested(true);}else if(restored)setWorkspaceRequested(isWorkspaceRoute());}catch{}},[auth.session?.token,verified]);
 if(!applicationEndpoint)return children(auth.available?auth:undefined);
 if(required===false)return children();
 if(auth.session&&verified===auth.session.token)return <>{children({...auth,signOut:()=>{setReportSession(undefined);setVerified(undefined);auth.signOut();}})}</>;
 if(publicFallback)return <>{publicFallback(auth,error,required===true&&!!auth.session&&verified!==auth.session.token&&!error,workspaceRequested)}</>;
 return <main className="dashboard-access"><section><h1>Code Analysis</h1><p>Sign in with an authorized GitHub account to review configured projects, current reports, and scanner evidence.</p>{(error||auth.error)&&<div className="dashboard-access-error" role="alert"><strong>Dashboard access</strong><span>{error||auth.error}</span></div>}<button type="button" className="landing-button landing-button-primary" disabled={required!==true||auth.pending} onClick={auth.signIn}>{auth.pending?'Signing in...':'Sign in with GitHub'}</button>{required===undefined&&!error&&<p>Checking access configuration...</p>}</section></main>;
}
