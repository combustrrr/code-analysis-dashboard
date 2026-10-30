export type ProjectView='overview'|'issues'|'coverage'|'report';
type MultiFilter=string|string[];
export type IssueRouteFilters={query?:string;severity?:MultiFilter;category?:MultiFilter;scanner?:MultiFilter;rule?:MultiFilter;files?:string[];directory?:MultiFilter;location?:string;overlap?:string;group?:string};
export type SettingsSection='overview'|'integrations'|'provenance';
export type AppRoute=
 |{kind:'landing'}
 |{kind:'projects'}
 |{kind:'project';projectId:string;view:ProjectView;target?:string;issue?:string;filters?:IssueRouteFilters}
 |{kind:'project-run';projectId:string}
 |{kind:'project-progress';projectId:string;requestId?:string}
 |{kind:'settings';section:SettingsSection;projectId?:string};

const settingsSections=new Set<SettingsSection>(['overview','integrations','provenance']);
const legacySettings:Record<string,SettingsSection>={general:'overview',connections:'integrations',provenance:'provenance'};
const clean=(value:string|null)=>value?.trim()||undefined;
const safeProject=(value:string|undefined)=>value&&/^[1-9][0-9]*$/.test(value)?value:undefined;
export const safeOpaqueId=(value:string|undefined,max=160)=>value&&value.length<=max&&!/[\u0000-\u001f\u007f\\/]/.test(value)&&!value.includes('..')&&!/%2e|%2f|%5c/i.test(value)?value:undefined;

export function parseAppRoute(hash=location.hash):AppRoute{
 const raw=hash.replace(/^#/,'');
 if(!raw)return{kind:'landing'};
 if(!raw.startsWith('/'))return{kind:'projects'};
 const [pathname,query='']=raw.split('?',2);const parts=pathname.split('/').filter(Boolean).map(decodeURIComponent);const params=new URLSearchParams(query);
 if(parts[0]==='projects'&&parts.length===1)return{kind:'projects'};
 if(parts[0]==='settings'&&parts.length<=2){const pathSection=parts[1],legacy=clean(params.get('section'));if(pathSection==='projects'||legacy==='projects')return{kind:'projects'};const candidate=pathSection&&settingsSections.has(pathSection as SettingsSection)?pathSection as SettingsSection:legacy&&legacySettings[legacy];return{kind:'settings',section:candidate||'overview',projectId:safeProject(clean(params.get('project')))};}
 const projectId=parts[0]==='projects'?safeProject(parts[1]):undefined;
 if(projectId){
  if(parts[2]==='run')return{kind:'project-run',projectId};
  if(parts[2]==='progress')return{kind:'project-progress',projectId,requestId:safeOpaqueId(clean(params.get('request')),96)};
  const view:ProjectView=parts[2]==='issues'?'issues':parts[2]==='coverage'?'coverage':parts[2]==='report'?'report':'overview';
  const many=(name:string)=>{const values=params.getAll(name).map(value=>value.trim()).filter(Boolean);return values.length>1?values:values[0];};
  const files=params.getAll('file').map(value=>value.trim()).filter(Boolean);
  const filters=view==='issues'?{query:clean(params.get('q')),severity:many('severity'),category:many('category'),scanner:many('scanner'),rule:many('rule'),files:files.length?files:undefined,directory:many('directory'),location:clean(params.get('location')),overlap:clean(params.get('overlap')),group:clean(params.get('group'))}:undefined;
  return{kind:'project',projectId,view,target:safeOpaqueId(clean(params.get('target'))),issue:view==='issues'?safeOpaqueId(clean(params.get('issue'))):undefined,filters};
 }
 return{kind:'projects'};
}

export function routeHash(route:AppRoute){
 if(route.kind==='landing')return'#';if(route.kind==='projects')return'#/projects';
 if(route.kind==='settings'){const params=new URLSearchParams();if(route.projectId)params.set('project',route.projectId);return`#/settings/${route.section}${params.size?'?'+params:''}`;}
 if(route.kind==='project-run')return`#/projects/${encodeURIComponent(route.projectId)}/run`;
 if(route.kind==='project-progress'){const params=new URLSearchParams();if(route.requestId)params.set('request',route.requestId);return`#/projects/${encodeURIComponent(route.projectId)}/progress${params.size?'?'+params:''}`;}
 const suffix=route.view==='overview'?'':`/${route.view}`;const params=new URLSearchParams();if(route.target)params.set('target',route.target);if(route.issue)params.set('issue',route.issue);if(route.view==='issues'&&route.filters){const names:Record<string,string>={query:'q',severity:'severity',category:'category',scanner:'scanner',rule:'rule',files:'file',directory:'directory',location:'location',overlap:'overlap',group:'group'};Object.entries(route.filters).forEach(([key,value])=>{const name=names[key]||key;if(Array.isArray(value))value.forEach(item=>params.append(name,item));else if(value)params.set(name,String(value));});}
 return`#/projects/${encodeURIComponent(route.projectId)}${suffix}${params.size?'?'+params:''}`;
}

export function navigateAppHash(nextHash:string,{preserveScroll=false,replace=false}:{preserveScroll?:boolean;replace?:boolean}={}){
 const x=window.scrollX,y=window.scrollY;
 if(location.hash===nextHash)return;
 history[replace?'replaceState':'pushState'](null,'',nextHash);
 window.dispatchEvent(new Event('hashchange'));
 if(preserveScroll){
  const restore=()=>window.scrollTo(x,y);
  restore();requestAnimationFrame(()=>{restore();requestAnimationFrame(restore);});
 }else window.scrollTo(0,0);
}

export function isWorkspaceRoute(hash=location.hash){return parseAppRoute(hash).kind!=='landing';}
