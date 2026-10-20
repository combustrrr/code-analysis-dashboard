export type ProjectView='overview'|'issues'|'report';
export type SettingsSection='general'|'projects'|'connections'|'provenance';
export type AppRoute=
 |{kind:'landing'}
 |{kind:'projects'}
 |{kind:'project';projectId:string;view:ProjectView;target?:string;issue?:string}
 |{kind:'project-run';projectId:string}
 |{kind:'settings';section:SettingsSection;projectId?:string};

const settingsSections=new Set<SettingsSection>(['general','projects','connections','provenance']);
const clean=(value:string|null)=>value?.trim()||undefined;
const safeProject=(value:string|undefined)=>value&&/^[1-9][0-9]*$/.test(value)?value:undefined;

export function parseAppRoute(hash=location.hash):AppRoute{
 const raw=hash.replace(/^#/,'');
 if(!raw)return{kind:'landing'};
 if(!raw.startsWith('/'))return{kind:'projects'};
 const [pathname,query='']=raw.split('?',2);const parts=pathname.split('/').filter(Boolean).map(decodeURIComponent);const params=new URLSearchParams(query);
 if(parts[0]==='projects'&&parts.length===1)return{kind:'projects'};
 if(parts[0]==='settings'&&parts.length===1){const candidate=clean(params.get('section')) as SettingsSection|undefined;return{kind:'settings',section:candidate&&settingsSections.has(candidate)?candidate:'general',projectId:safeProject(clean(params.get('project')))};}
 const projectId=parts[0]==='projects'?safeProject(parts[1]):undefined;
 if(projectId){
  if(parts[2]==='run')return{kind:'project-run',projectId};
  const view:ProjectView=parts[2]==='issues'?'issues':parts[2]==='report'?'report':'overview';
  return{kind:'project',projectId,view,target:clean(params.get('target')),issue:view==='issues'?clean(params.get('issue')):undefined};
 }
 return{kind:'projects'};
}

export function routeHash(route:AppRoute){
 if(route.kind==='landing')return'#';if(route.kind==='projects')return'#/projects';
 if(route.kind==='settings'){const params=new URLSearchParams({section:route.section});if(route.projectId)params.set('project',route.projectId);return`#/settings?${params}`;}
 if(route.kind==='project-run')return`#/projects/${encodeURIComponent(route.projectId)}/run`;
 const suffix=route.view==='overview'?'':`/${route.view}`;const params=new URLSearchParams();if(route.target)params.set('target',route.target);if(route.issue)params.set('issue',route.issue);
 return`#/projects/${encodeURIComponent(route.projectId)}${suffix}${params.size?'?'+params:''}`;
}

export function isWorkspaceRoute(hash=location.hash){return parseAppRoute(hash).kind!=='landing';}
