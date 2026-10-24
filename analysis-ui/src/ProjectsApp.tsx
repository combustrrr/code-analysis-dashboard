import './workspace.css';
import './projects-light.css';
import {ProjectsShell} from './ProjectsShell';
import {Repositories} from './Repositories';
import {useLaunchAuth} from './useLaunchAuth';
import {applicationEndpoint} from './repositoryReports';

type Auth=ReturnType<typeof useLaunchAuth>;

export function ProjectsApp({viewerAuth}:{viewerAuth?:Auth}){
 const localAuth=useLaunchAuth(applicationEndpoint,!viewerAuth);const auth=viewerAuth||localAuth;
 return <ProjectsShell auth={auth}>
   <main className="workspace-home"><Repositories auth={auth}/></main>
  </ProjectsShell>;
}
