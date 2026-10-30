import {FolderOpenOutlined,SettingOutlined,UserOutlined} from './icons';
import type {ReactNode} from 'react';
import {parseAppRoute,routeHash} from './appRoutes';
import {InstitutionalLockup} from './InstitutionalLockup';
import type {useLaunchAuth} from './useLaunchAuth';

type Auth=ReturnType<typeof useLaunchAuth>;
export function AppShell({auth,children,status}:{auth?:Auth;children:ReactNode;status?:ReactNode}){
 const route=parseAppRoute();
 const configuredProjects=auth?.session?.registry?.projects.length;
 const active=route.kind==='settings'?'settings':'projects';
 const projectId=route.kind==='project'||route.kind==='project-run'?route.projectId:route.kind==='settings'?route.projectId:undefined;
 const primaryLinks=<nav className="shell-links" aria-label="Workspace navigation">
  <a aria-label="Project register" className={active==='projects'?'active':''} aria-current={active==='projects'?'page':undefined} href={routeHash({kind:'projects'})}><FolderOpenOutlined/><span>Project register</span></a>
  <a aria-label="Settings" className={active==='settings'?'active':''} aria-current={active==='settings'?'page':undefined} href={routeHash({kind:'settings',section:'overview',projectId})}><SettingOutlined/><span>Settings</span></a>
 </nav>;
 return <div className={`application-shell${route.kind==='projects'?' projects-shell':''}`}>
  <header className="shell-header">
   <InstitutionalLockup className="shell-brand" href={routeHash({kind:'projects'})}/>
   <div className="shell-context"><span>Trusted project register</span><strong>{configuredProjects===undefined?'Configured repositories':`${configuredProjects} configured ${configuredProjects===1?'repository':'repositories'}`}</strong></div>
   <div className="shell-actions">{primaryLinks}<span className="shell-user"><UserOutlined/> {auth?.session?.login||'Authorized user'}</span>{auth?.session&&<button type="button" className="shell-native-button" onClick={auth.signOut}>Sign out</button>}</div>
  </header>
  {status&&<div className="shell-status">{status}</div>}
  {children}
 </div>;
}
