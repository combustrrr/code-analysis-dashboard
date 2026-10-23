import './workspace.css';
import './projects-light.css';
import {ProjectsShell} from './ProjectsShell';
import {Repositories} from './Repositories';
import type {useLaunchAuth} from './useLaunchAuth';

type Auth=ReturnType<typeof useLaunchAuth>;

export function ProjectsApp({viewerAuth}:{viewerAuth:Auth}){
 return <ProjectsShell auth={viewerAuth}>
   <main className="workspace-home"><Repositories auth={viewerAuth}/></main>
  </ProjectsShell>;
}
