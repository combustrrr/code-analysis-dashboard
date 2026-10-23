import React, {lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/sora/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import {AppearanceProvider} from './Appearance';
import {DashboardAccess} from './DashboardAccess';
import {LandingPage} from './LandingPage';
import {isWorkspaceRoute, routeHash} from './appRoutes';
import type {useLaunchAuth} from './useLaunchAuth';

const WorkspaceApp=lazy(()=>import('./WorkspaceApp').then(module=>({default:module.WorkspaceApp})));
type Auth=ReturnType<typeof useLaunchAuth>;

function openWorkspace(){
 try{sessionStorage.setItem('analysis-workspace-requested','true');}catch{}
 location.hash=routeHash({kind:'projects'});
}

function PublicLanding({auth,accessError,accessPending,workspaceRequested}:{auth:Auth;accessError?:string;accessPending?:boolean;workspaceRequested?:boolean}){
 return <LandingPage auth={auth} accessError={accessError} accessPending={accessPending} workspaceRequested={workspaceRequested} onStart={openWorkspace}/>;
}

function Authenticated({auth}:{auth:Auth}){
 if(!isWorkspaceRoute())return <PublicLanding auth={auth}/>;
 return <Suspense fallback={<main className="workspace-loading" role="status">Opening workspace...</main>}><WorkspaceApp viewerAuth={auth}/></Suspense>;
}

createRoot(document.getElementById('root')!).render(
 <AppearanceProvider>
  <DashboardAccess publicFallback={(auth,accessError,accessPending,workspaceRequested)=><PublicLanding auth={auth} accessError={accessError} accessPending={accessPending} workspaceRequested={workspaceRequested}/>}>{auth=><Authenticated auth={auth!}/>}</DashboardAccess>
 </AppearanceProvider>
);
