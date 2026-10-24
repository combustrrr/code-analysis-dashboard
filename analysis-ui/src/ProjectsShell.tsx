import {FolderOpenOutlined,SettingOutlined,UserOutlined} from './icons';
import {InstitutionalLockup} from './InstitutionalLockup';
import {routeHash} from './appRoutes';
import type {ReactNode} from 'react';
import type {useLaunchAuth} from './useLaunchAuth';

type Auth=ReturnType<typeof useLaunchAuth>;
export function ProjectsShell({auth,children}:{auth:Auth;children:ReactNode}){const projects=routeHash({kind:'projects'}),settings=routeHash({kind:'settings',section:'general'});return <div className="application-shell projects-shell"><header className="shell-header"><InstitutionalLockup className="shell-brand" href={projects}/><div className="shell-context"><span>Trusted project register</span><strong>3 configured repositories</strong></div><div className="shell-actions"><nav className="shell-links" aria-label="Workspace navigation"><a aria-label="Project register" className="active" aria-current="page" href={projects}><FolderOpenOutlined/><span>Project register</span></a><a aria-label="Settings" href={settings}><SettingOutlined/><span>Settings</span></a></nav><span className="shell-user"><UserOutlined/> {auth.session?.login||'Authorized user'}</span><button type="button" className="shell-native-button" onClick={auth.signOut}>Sign out</button></div></header>{children}</div>}
