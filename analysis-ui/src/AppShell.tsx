import {Button} from './ui';
import {FolderOpenOutlined,SettingOutlined,UserOutlined} from './icons';
import type {ReactNode} from 'react';
import {parseAppRoute,routeHash} from './appRoutes';
import {InstitutionalLockup} from './InstitutionalLockup';
import type {useLaunchAuth} from './useLaunchAuth';

type Auth=ReturnType<typeof useLaunchAuth>;
export function AppShell({auth,children,status}:{auth?:Auth;children:ReactNode;status?:ReactNode}){
 const route=parseAppRoute();
 const active=route.kind==='settings'?'settings':'projects';const isSettings=active==='settings';
 const primaryLinks=<nav className="shell-links" aria-label="Workspace navigation">
  <a aria-label="Project register" className={active==='projects'?'active':''} aria-current={active==='projects'?'page':undefined} href={routeHash({kind:'projects'})}><FolderOpenOutlined/><span>Project register</span></a>
  <a aria-label="Settings" className={active==='settings'?'active':''} aria-current={active==='settings'?'page':undefined} href={routeHash({kind:'settings',section:'general'})}><SettingOutlined/><span>Settings</span></a>
 </nav>;
 return <div className="application-shell">
  <header className={`shell-header${isSettings?' shell-header-settings':''}`}>
   {!isSettings&&<InstitutionalLockup className="shell-brand" href={routeHash({kind:'projects'})}/>}
   <div className="shell-context"><span>Trusted project register</span><strong>3 configured repositories</strong></div>
   <div className="shell-actions">{primaryLinks}<span className="shell-user"><UserOutlined/> {auth?.session?.login||'Authorized user'}</span>{auth?.session&&<Button onClick={auth.signOut}>Sign out</Button>}</div>
  </header>
  {status&&<div className="shell-status">{status}</div>}
  {children}
 </div>;
}
