# Shared layouts

## Authenticated application shell
- Path: `analysis-ui/src/AppShell.tsx`
- Persistent product header, workspace context, account utilities, mobile drawer, and content slot.

```tsx
import {Button,Drawer} from 'antd';
import {FolderOpenOutlined,MenuOutlined,ScanOutlined,SettingOutlined,UserOutlined} from '@ant-design/icons';
import {useState,type ReactNode} from 'react';
import {AppearanceToggle} from './Appearance';
import {parseAppRoute,routeHash} from './appRoutes';
import trustLabLogo from './assets/trustlab-logo.jpg';
import mphasisLogo from './assets/mphasis-logo.jpg';
import type {useLaunchAuth} from './useLaunchAuth';
type Auth=ReturnType<typeof useLaunchAuth>;
export function AppShell({auth,children,status}:{auth?:Auth;children:ReactNode;status?:ReactNode}){
 const [open,setOpen]=useState(false);const route=parseAppRoute();const active=route.kind==='settings'?'settings':'projects';
 const primaryLinks=<nav className="shell-links" aria-label="Workspace navigation"><a className={active==='projects'?'active':''} aria-current={active==='projects'?'page':undefined} href={routeHash({kind:'projects'})}><FolderOpenOutlined/> Project register</a></nav>;
 const settingsLink=<a className={`shell-settings ${active==='settings'?'active':''}`} aria-current={active==='settings'?'page':undefined} href={routeHash({kind:'settings',section:'general'})}><SettingOutlined/> Settings</a>;
 return <div className="application-shell"><header className="shell-header"><a className="shell-brand" href={routeHash({kind:'projects'})} aria-label="Code Analysis project register"><span className="shell-mark"><ScanOutlined/></span><span><strong>Code Analysis</strong><small>Evidence workspace</small></span></a><div className="shell-context"><span>Trusted project register</span><strong>3 configured repositories</strong></div><div className="shell-actions">{settingsLink}<AppearanceToggle/><span className="shell-user"><UserOutlined/> {auth?.session?.login||'Authorized user'}</span>{auth?.session&&<Button onClick={auth.signOut}>Sign out</Button>}<Button className="shell-menu" aria-label="Open navigation" icon={<MenuOutlined/>} onClick={()=>setOpen(true)}/></div></header>{status&&<div className="shell-status">{status}</div>}<Drawer className="shell-drawer" title="Code Analysis" placement="right" open={open} onClose={()=>setOpen(false)}><div onClick={()=>setOpen(false)}>{primaryLinks}{settingsLink}</div><div className="drawer-appearance"><span>Appearance</span><AppearanceToggle/></div><div className="shell-partners" aria-label="Institutional partners"><img src={trustLabLogo} alt="IIT Bombay Trust Lab"/><span>×</span><img src={mphasisLogo} alt="Mphasis"/></div>{auth?.session&&<Button block onClick={auth.signOut}>Sign out</Button>}</Drawer>{children}</div>;
}
```

## Public landing frame
- Path: `analysis-ui/src/LandingPage.tsx`
- Self-contained public header, hero, evidence preview, proof strip, methodology, assurance CTA, and co-branded footer. Full source is passed directly for landing design work.
