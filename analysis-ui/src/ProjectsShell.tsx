import {AppearanceToggle} from './Appearance';
import {InstitutionalLockup} from './InstitutionalLockup';
import {routeHash} from './appRoutes';
import type {ReactNode} from 'react';
import type {useLaunchAuth} from './useLaunchAuth';

type Auth=ReturnType<typeof useLaunchAuth>;
export function ProjectsShell({auth,children}:{auth:Auth;children:ReactNode}){const settings=routeHash({kind:'settings',section:'general'});return <div className="application-shell projects-shell"><header className="shell-header"><InstitutionalLockup className="shell-brand" href={routeHash({kind:'projects'})}/><div className="shell-context"><span>Trusted project register</span><strong>3 configured repositories</strong></div><div className="shell-actions"><a className="shell-settings" href={settings}>Settings</a><AppearanceToggle/><span className="shell-user">{auth.session?.login||'Authorized user'}</span><button type="button" className="shell-native-button" onClick={auth.signOut}>Sign out</button><details className="projects-menu"><summary aria-label="Open navigation">Menu</summary><a href={settings}>Settings</a><button type="button" onClick={auth.signOut}>Sign out</button></details></div></header>{children}</div>}
