import {ConfigProvider} from 'antd';
import 'antd/dist/reset.css';
import '@fontsource/manrope/500.css';
import '@fontsource/sora/500.css';
import '@fontsource/sora/700.css';
import './style.css';
import './workspace.css';
import {AppShell} from './AppShell';
import {applicationTheme} from './brand';
import {Repositories} from './Repositories';
import {useAppearance} from './Appearance';
import type {useLaunchAuth} from './useLaunchAuth';

type Auth=ReturnType<typeof useLaunchAuth>;

export function ProjectsApp({viewerAuth}:{viewerAuth:Auth}){
 const {appearance}=useAppearance();
 return <ConfigProvider theme={applicationTheme(appearance)}>
  <AppShell auth={viewerAuth}>
   <main className="workspace-home"><Repositories auth={viewerAuth}/></main>
  </AppShell>
 </ConfigProvider>;
}
