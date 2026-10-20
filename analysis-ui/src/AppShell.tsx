import {Button,Drawer} from 'antd';
import {FolderOpenOutlined,MenuOutlined,SettingOutlined,UserOutlined} from '@ant-design/icons';
import {useState,type ReactNode} from 'react';
import {AppearanceToggle} from './Appearance';
import {parseAppRoute,routeHash} from './appRoutes';
import {InstitutionalLockup} from './InstitutionalLockup';
import type {useLaunchAuth} from './useLaunchAuth';

type Auth=ReturnType<typeof useLaunchAuth>;
export function AppShell({auth,children,status}:{auth?:Auth;children:ReactNode;status?:ReactNode}){
 const [open,setOpen]=useState(false);const route=parseAppRoute();
 const active=route.kind==='settings'?'settings':'projects';
 const primaryLinks=<nav className="shell-links" aria-label="Workspace navigation">
  <a className={active==='projects'?'active':''} aria-current={active==='projects'?'page':undefined} href={routeHash({kind:'projects'})}><FolderOpenOutlined/> Project register</a>
 </nav>;
 const settingsLink=<a className={`shell-settings ${active==='settings'?'active':''}`} aria-current={active==='settings'?'page':undefined} href={routeHash({kind:'settings',section:'general'})}><SettingOutlined/> Settings</a>;
 return <div className="application-shell">
  <header className="shell-header">
   <InstitutionalLockup className="shell-brand" href={routeHash({kind:'projects'})}/>
   <div className="shell-context"><span>Trusted project register</span><strong>3 configured repositories</strong></div>
   <div className="shell-actions">{settingsLink}<AppearanceToggle/><span className="shell-user"><UserOutlined/> {auth?.session?.login||'Authorized user'}</span>{auth?.session&&<Button onClick={auth.signOut}>Sign out</Button>}<Button className="shell-menu" aria-label="Open navigation" icon={<MenuOutlined/>} onClick={()=>setOpen(true)}/></div>
  </header>
  {status&&<div className="shell-status">{status}</div>}
  <Drawer className="shell-drawer" title={<InstitutionalLockup className="drawer-lockup" href={routeHash({kind:'projects'})}/>} placement="right" open={open} onClose={()=>setOpen(false)}><div onClick={()=>setOpen(false)}>{primaryLinks}{settingsLink}</div><div className="drawer-appearance"><span>Appearance</span><AppearanceToggle/></div>{auth?.session&&<Button block onClick={auth.signOut}>Sign out</Button>}</Drawer>
  {children}
 </div>;
}
