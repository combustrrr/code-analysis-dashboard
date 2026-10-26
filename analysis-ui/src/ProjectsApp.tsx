import './workspace.css';
import './projects-light.css';
import {AppShell} from './AppShell';
import {Repositories} from './Repositories';
import {useLaunchAuth} from './useLaunchAuth';
import {applicationEndpoint} from './repositoryReports';

type Auth=ReturnType<typeof useLaunchAuth>;

export function ProjectsApp({viewerAuth}:{viewerAuth?:Auth}){
 const localAuth=useLaunchAuth(applicationEndpoint,!viewerAuth);const auth=viewerAuth||localAuth;
 return <AppShell auth={auth}>
   <main className="workspace-home"><Repositories auth={auth}/></main>
  </AppShell>;
}
