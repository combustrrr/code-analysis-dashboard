import {useEffect,useState,type ReactNode} from 'react';
import {Alert,Button,ConfigProvider,Segmented,Space,theme} from 'antd';
import {useLaunchAuth} from './useLaunchAuth';
import {applicationEndpoint,setReportSession} from './repositoryReports';

export function DashboardAccess({children}:{children:(auth?:ReturnType<typeof useLaunchAuth>)=>ReactNode}) {
 const auth=useLaunchAuth(applicationEndpoint);
 const [required,setRequired]=useState<boolean>();
 const [verified,setVerified]=useState<string>();
 const [error,setError]=useState('');
 const [dark,setDark]=useState(()=>localStorage.getItem('analysis-theme')!=='light');
 useEffect(()=>{if(!applicationEndpoint)return;let active=true;
  fetch(applicationEndpoint+'/api/public/config',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Access configuration unavailable.');return r.json();}).then(c=>{if(active)setRequired(c.require_login===true);}).catch(()=>{if(active)setError('Could not verify dashboard access. Reload to retry.');});return()=>{active=false;};
 },[]);
 useEffect(()=>{setVerified(undefined);setReportSession(undefined);if(!required||!auth.session)return;
  let active=true;const token=auth.session.token;
  const verify=async()=>{try {await auth.api('session');if(active){setReportSession(token);setVerified(token);setError('');}}catch(e){if(active){setReportSession(undefined);setVerified(undefined);setError(String(e));}}};
  const denied=()=>{setReportSession(undefined);setVerified(undefined);setError('Access expired or was revoked. Sign in with an authorized GitHub account.');auth.signOut();};
  void verify();const timer=window.setInterval(()=>{if(!document.hidden)void verify();},15000);window.addEventListener('analysis-access-denied',denied);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('analysis-access-denied',denied);setReportSession(undefined);};
 },[required,auth.session?.token]);
 if(!applicationEndpoint||required===false)return children();
 if(auth.session&&verified===auth.session.token)return children({...auth,signOut:()=>{setReportSession(undefined);setVerified(undefined);auth.signOut();}});
 return <ConfigProvider theme={{algorithm:dark?theme.darkAlgorithm:theme.defaultAlgorithm}}><main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:dark?'#071523':'#f4f7fa',color:dark?'#dce8f5':'#202d3d'}}><section style={{maxWidth:480,padding:32}}>
  <h1>Code Analysis</h1><p>Sign in with an authorized GitHub account to view repositories, findings and scanner activity.</p>
  <Space direction="vertical" size="middle"><Segmented aria-label="Color theme" value={dark?'Dark':'Light'} options={['Dark','Light']} onChange={v=>{setDark(v==='Dark');localStorage.setItem('analysis-theme',v.toLowerCase());}}/>
  {(error||auth.error)&&<Alert type="error" title="Dashboard access" description={error||auth.error}/>}
  <Button type="primary" disabled={required!==true} onClick={auth.signIn}>Sign in with GitHub</Button>
  {required===undefined&&!error&&<p>Checking access configuration...</p>}
  </Space></section></main></ConfigProvider>;
}
