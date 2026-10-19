import {useEffect,useState,type ReactNode} from 'react';
import {Alert,Button,ConfigProvider,Segmented,Space,theme} from 'antd';
import {pendingAuthDestination,restoreAuthDestination,useLaunchAuth} from './useLaunchAuth';
import {applicationEndpoint,setReportSession} from './repositoryReports';
import {isWorkspaceRoute,routeHash} from './appRoutes';

export function DashboardAccess({children,publicFallback}:{children:(auth?:ReturnType<typeof useLaunchAuth>)=>ReactNode;publicFallback?:(auth:ReturnType<typeof useLaunchAuth>,accessError?:string,accessPending?:boolean,workspaceRequested?:boolean)=>ReactNode}) {
 const auth=useLaunchAuth(applicationEndpoint);
 const [required,setRequired]=useState<boolean>();
  const [verified,setVerified]=useState<string>();
  const [error,setError]=useState('');
  const [workspaceRequested,setWorkspaceRequested]=useState(()=>isWorkspaceRoute()||Boolean(pendingAuthDestination()?.includes('#/')));
 const [dark,setDark]=useState(()=>localStorage.getItem('analysis-theme')!=='light');
  useEffect(()=>{if(!applicationEndpoint)return;let active=true;
   fetch(applicationEndpoint+'/api/public/config',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Access configuration unavailable.');return r.json();}).then(c=>{if(active)setRequired(c.require_login===true||c.require_report_login===true);}).catch(()=>{if(active)setError('Could not verify dashboard access. Reload to retry.');});return()=>{active=false;};
  },[]);
  useEffect(()=>{
   const update=()=>setWorkspaceRequested(isWorkspaceRoute());
   window.addEventListener('hashchange',update);
   return()=>window.removeEventListener('hashchange',update);
  },[]);
  useEffect(()=>{setVerified(undefined);setReportSession(undefined);if(!required||!auth.session)return;
  let active=true;const token=auth.session.token;
    const verify=async(recheck=false)=>{try {if(recheck||!auth.verified)await auth.api('session');if(active){setReportSession(token);setVerified(token);setError('');}}catch(e){if(active){setReportSession(undefined);setVerified(undefined);setError(e instanceof Error?e.message:'GitHub access could not be verified.');restoreAuthDestination();auth.signOut();}}};
  const denied=()=>{setReportSession(undefined);setVerified(undefined);setError('Access expired or was revoked. Sign in with an authorized GitHub account.');auth.signOut();};
   void verify();const timer=window.setInterval(()=>{if(!document.hidden)void verify(true);},15000);window.addEventListener('analysis-access-denied',denied);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('analysis-access-denied',denied);setReportSession(undefined);};
   },[required,auth.session?.token,auth.verified]);
  useEffect(()=>{
   if(!auth.session||verified!==auth.session.token)return;
   try {
     const restored=restoreAuthDestination();
     if(sessionStorage.getItem('analysis-workspace-requested')==='true') {
      sessionStorage.removeItem('analysis-workspace-requested');
      if(!isWorkspaceRoute())location.hash=routeHash({kind:'dashboard'});
      setWorkspaceRequested(true);
     } else if(restored) setWorkspaceRequested(isWorkspaceRoute());
   } catch {}
  },[auth.session?.token,verified]);
   if(!applicationEndpoint)return children(auth.available?auth:undefined);
   if(required===false)return children();
  if(auth.session&&verified===auth.session.token)return children({...auth,signOut:()=>{setReportSession(undefined);setVerified(undefined);auth.signOut();}});
  if(publicFallback)return publicFallback(auth,error,required===true&&!!auth.session&&verified!==auth.session.token&&!error,workspaceRequested);
  return <ConfigProvider theme={{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm}}><main className={`dashboard-access ${dark?'dashboard-access-dark':'dashboard-access-light'}`}><section>
   <h1>Code Analysis</h1><p>Sign in with an authorized GitHub account to browse configured analysis targets, current reports and scanner evidence.</p>
  <Space direction="vertical" size="middle"><Segmented aria-label="Color theme" value={dark?'Dark':'Light'} options={['Dark','Light']} onChange={v=>{setDark(v==='Dark');localStorage.setItem('analysis-theme',v.toLowerCase());}}/>
  {(error||auth.error)&&<Alert type="error" title="Dashboard access" description={error||auth.error}/>}
  <Button type="primary" disabled={required!==true} onClick={auth.signIn}>Sign in with GitHub</Button>
  {required===undefined&&!error&&<p>Checking access configuration...</p>}
  </Space></section></main></ConfigProvider>;
}
