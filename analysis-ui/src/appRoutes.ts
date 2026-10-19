export type ReportView='overview'|'issues'|'scanners'|'provenance'|'threat-report';
export type AppRoute=
 |{kind:'landing'}
 |{kind:'dashboard'}
 |{kind:'projects'}
 |{kind:'project';projectId:string;repository?:string;view:ReportView;target?:string;issue?:string}
 |{kind:'custom-run';projectId:string;repository?:string}
 |{kind:'settings';projectId:string;repository?:string;section?:string};

const reportViews=new Set<ReportView>(['overview','issues','scanners','provenance','threat-report']);
const clean=(value:string|null)=>value?.trim()||undefined;
const safeProject=(value:string|undefined)=>value&&/^[1-9][0-9]*$/.test(value)?value:undefined;

export function parseAppRoute(hash=location.hash):AppRoute{
 const raw=hash.replace(/^#/,'');
 if(raw.startsWith('/')){
  const [pathname,query='']=raw.split('?',2);const parts=pathname.split('/').filter(Boolean).map(decodeURIComponent);const params=new URLSearchParams(query);
  if(parts[0]==='dashboard'&&parts.length===1)return{kind:'dashboard'};
  if(parts[0]==='projects'&&parts.length===1)return{kind:'projects'};
  const projectId=safeProject(parts[1]);const repository=clean(params.get('repository'));
  if(parts[0]==='projects'&&projectId){
   if(parts[2]==='custom-run')return{kind:'custom-run',projectId,repository};
   if(parts[2]==='settings')return{kind:'settings',projectId,repository,section:clean(params.get('section'))};
   const candidate=clean(params.get('view')) as ReportView|undefined;
   return{kind:'project',projectId,repository,view:candidate&&reportViews.has(candidate)?candidate:'overview',target:clean(params.get('target')),issue:clean(params.get('issue'))};
  }
  return{kind:'dashboard'};
 }
 const params=new URLSearchParams(raw);const projectId=safeProject(clean(params.get('project')));const repository=clean(params.get('repository'));const tab=clean(params.get('tab'));
 if(params.has('analysis_auth')||params.has('analysis_auth_error'))return{kind:'landing'};
 if(!projectId)return tab==='repositories'?{kind:'projects'}:{kind:'landing'};
 if(tab==='settings'||['connections','repositories','provenance'].includes(tab||''))return{kind:'settings',projectId,repository,section:clean(params.get('section'))||(tab&&tab!=='settings'?tab:undefined)};
 const view=(tab&&reportViews.has(tab as ReportView)?tab:'overview') as ReportView;
 return{kind:'project',projectId,repository,view,target:clean(params.get('target')),issue:clean(params.get('issue'))};
}

export function routeHash(route:AppRoute){
 if(route.kind==='landing')return'#';if(route.kind==='dashboard')return'#/dashboard';if(route.kind==='projects')return'#/projects';
 const params=new URLSearchParams();if(route.repository)params.set('repository',route.repository);
 if(route.kind==='custom-run')return`#/projects/${encodeURIComponent(route.projectId)}/custom-run${params.size?'?'+params:''}`;
 if(route.kind==='settings'){if(route.section)params.set('section',route.section);return`#/projects/${encodeURIComponent(route.projectId)}/settings${params.size?'?'+params:''}`;}
 if(route.view!=='overview')params.set('view',route.view);if(route.target)params.set('target',route.target);if(route.issue)params.set('issue',route.issue);
 return`#/projects/${encodeURIComponent(route.projectId)}${params.size?'?'+params:''}`;
}

export function normalizeLegacyHash(){const route=parseAppRoute();const modern=routeHash(route);if(location.hash&&!location.hash.startsWith('#/')&&modern!==location.hash)history.replaceState(null,'',modern);return route;}
export function isWorkspaceRoute(hash=location.hash){return parseAppRoute(hash).kind!=='landing';}
