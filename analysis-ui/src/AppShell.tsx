import {Button,Drawer} from 'antd';
import {MenuOutlined,SettingOutlined,UserOutlined} from '@ant-design/icons';
import {useState,type ReactNode} from 'react';
import {AppearanceToggle} from './Appearance';
import {parseAppRoute,routeHash} from './appRoutes';
import trustLabLogo from './assets/trustlab-logo.jpg';
import mphasisLogo from './assets/mphasis-logo.jpg';
import type {useLaunchAuth} from './useLaunchAuth';

type Auth=ReturnType<typeof useLaunchAuth>;
export function AppShell({auth,children,status}:{auth?:Auth;children:ReactNode;status?:ReactNode}){
 const [open,setOpen]=useState(false);const route=parseAppRoute();
 const active=route.kind==='activity'?'activity':route.kind==='settings'?'settings':'projects';
 const primaryLinks=<nav className="shell-links" aria-label="Workspace navigation">
  <a className={active==='projects'?'active':''} aria-current={active==='projects'?'page':undefined} href={routeHash({kind:'projects'})}>Projects</a>
  <a className={active==='activity'?'active':''} aria-current={active==='activity'?'page':undefined} href={routeHash({kind:'activity'})}>Activity</a>
 </nav>;
 const settingsLink=<a className={`shell-settings ${active==='settings'?'active':''}`} aria-current={active==='settings'?'page':undefined} href={routeHash({kind:'settings',section:'general'})}><SettingOutlined/> Settings</a>;
 return <div className="application-shell">
  <header className="shell-header">
   <a className="shell-brand" href={routeHash({kind:'projects'})} aria-label="Code Analysis projects"><span className="shell-mark">CA</span><span><strong>Code Analysis</strong><small>IIT Bombay Trust Lab × Mphasis</small></span></a>
   <div className="shell-desktop-nav">{primaryLinks}</div>
   <div className="shell-actions">{settingsLink}<AppearanceToggle/><span className="shell-user"><UserOutlined/> {auth?.session?.login||'Authorized user'}</span>{auth?.session&&<Button onClick={auth.signOut}>Sign out</Button>}<Button className="shell-menu" aria-label="Open navigation" icon={<MenuOutlined/>} onClick={()=>setOpen(true)}/></div>
  </header>
  {status&&<div className="shell-status">{status}</div>}
  <Drawer className="shell-drawer" title="Code Analysis" placement="right" open={open} onClose={()=>setOpen(false)}><div onClick={()=>setOpen(false)}>{primaryLinks}{settingsLink}</div><div className="drawer-appearance"><span>Appearance</span><AppearanceToggle/></div><div className="shell-partners" aria-label="Institutional partners"><img src={trustLabLogo} alt="IIT Bombay Trust Lab"/><span>×</span><img src={mphasisLogo} alt="Mphasis"/></div>{auth?.session&&<Button block onClick={auth.signOut}>Sign out</Button>}</Drawer>
  {children}
 </div>;
}
