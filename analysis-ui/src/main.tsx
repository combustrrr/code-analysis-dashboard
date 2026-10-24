import React, {lazy, Suspense, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/sora/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './document.css';
import {AppearanceProvider} from './Appearance';
import {DashboardAccess} from './DashboardAccess';
import {LandingPage} from './LandingPage';
import {isWorkspaceRoute, parseAppRoute, routeHash} from './appRoutes';
import type {useLaunchAuth} from './useLaunchAuth';

const loadWorkspaceApp=()=>import('./WorkspaceApp');
const WorkspaceApp=lazy(()=>loadWorkspaceApp().then(module=>({default:module.WorkspaceApp})));
const loadProjectsApp=()=>import('./ProjectsApp');
const ProjectsApp=lazy(()=>loadProjectsApp().then(module=>({default:module.ProjectsApp})));
type Auth=ReturnType<typeof useLaunchAuth>;

const initialRoute=parseAppRoute();
if(initialRoute.kind==='projects')void loadProjectsApp();
else if(isWorkspaceRoute())void loadWorkspaceApp();

function openWorkspace(){
 try{sessionStorage.setItem('analysis-workspace-requested','true');}catch{}
 location.hash=routeHash({kind:'projects'});
}

function PublicLanding({auth,accessError,accessPending,workspaceRequested}:{auth:Auth;accessError?:string;accessPending?:boolean;workspaceRequested?:boolean}){
 return <LandingPage auth={auth} accessError={accessError} accessPending={accessPending} workspaceRequested={workspaceRequested} onStart={openWorkspace}/>;
}

function Authenticated({auth}:{auth:Auth}){
 if(!isWorkspaceRoute())return <PublicLanding auth={auth}/>;
 return <WorkspaceRoute auth={auth}/>;
}

function WorkspaceRoute({auth}:{auth:Auth}){
 const [kind,setKind]=useState(()=>parseAppRoute().kind);
 useEffect(()=>{const update=()=>setKind(parseAppRoute().kind);window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 return <Suspense fallback={<main className="workspace-loading" role="status">Opening workspace...</main>}>{kind==='projects'?<ProjectsApp viewerAuth={auth}/>:<WorkspaceApp viewerAuth={auth}/>}</Suspense>;
}

createRoot(document.getElementById('root')!).render(
 <AppearanceProvider>
  <DashboardAccess publicFallback={(auth,accessError,accessPending,workspaceRequested)=><PublicLanding auth={auth} accessError={accessError} accessPending={accessPending} workspaceRequested={workspaceRequested}/>}>{auth=><Authenticated auth={auth!}/>}</DashboardAccess>
 </AppearanceProvider>
);
