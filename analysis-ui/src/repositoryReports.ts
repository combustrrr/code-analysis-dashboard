import {parseAppRoute} from './appRoutes';

// Read current repository-owned reports without bundling data into the UI build.
type ManifestAsset={sha256:string;bytes:number};
type ManifestTarget={id:string;collected_run:number;documents?:Record<string,string>;assets:Record<string,ManifestAsset>;[key:string]:unknown};
type RepositoryManifest={targets:ManifestTarget[];current_overlay?:ManifestTarget;metrics?:unknown;[key:string]:unknown};
const manifests = new Map<string, {at:number; value:RepositoryManifest}>();
const manifestRequests = new Map<string, Promise<RepositoryManifest>>();
const shards = new Map<string, Promise<Record<string, unknown>>>();
let cacheGeneration=0;
export const applicationEndpoint = import.meta.env.VITE_LAUNCH_ENDPOINT as string | undefined;
const fixtureBuild = import.meta.env.MODE === 'fixtures';
const MANIFEST_CACHE_MS=60*1000;
export function refreshRepositoryReports(){cacheGeneration++;manifests.clear();manifestRequests.clear();shards.clear();}
let reportBearer: string | undefined;
export function setReportSession(token?:string) {
 if(token!==reportBearer){refreshRepositoryReports();reportBearer=token;}
}
export async function reportFetch(path:string,init:RequestInit={}) {
 const headers=new Headers(init.headers);
 if(reportBearer && applicationEndpoint && new URL(path,location.href).origin===new URL(applicationEndpoint).origin)headers.set('Authorization','Bearer '+reportBearer);
 const response=await fetch(path,{...init,headers,cache:'no-store'});
 if(reportBearer && [401,403].includes(response.status)){
  try{const failure=await response.clone().json() as {code?:string};if(['session_invalid','viewer_not_authorized'].includes(failure.code||''))window.dispatchEvent(new Event('analysis-access-denied'));}catch{}
 }
 return response;
}
function selection() {const route=parseAppRoute();return 'projectId' in route&&route.kind!=='settings'?{repository:import.meta.env.VITE_DEFAULT_EXECUTION_REPOSITORY||'combustrrr/code-analysis-dashboard',project:route.projectId,target:route.kind==='project'?route.target||null:null}:{repository:null,project:null,target:null};}
export function hasRepositorySelection() {const s=selection();return !!(applicationEndpoint&&s.repository&&s.project);}
async function response(path:string,signal?:AbortSignal) {
 const r=await reportFetch(path,{signal});if(!r.ok){let payload:{error?:string;code?:string}={};try{payload=await r.json();}catch{}const error=new Error(payload.error||'Report unavailable.') as Error & {status?:number;code?:string};error.status=r.status;error.code=payload.code;throw error;}return r;
}
export async function repositoryJson<T>(path:string,signal?:AbortSignal):Promise<T> {
  // Only the explicitly named fixture build may read checked-in report data.
  if(!applicationEndpoint) {
   if(fixtureBuild)return (await response(path,signal)).json() as Promise<T>;
   throw new Error('Live report endpoint is not configured.');
  }
   const {repository,project}=selection();
  const base=`${applicationEndpoint}/api/public/`;
  const query=new URLSearchParams({repository:repository!,project_id:project!});
  const key=query.toString();
 let entry=manifests.get(key);
 if(!entry||Date.now()-entry.at>MANIFEST_CACHE_MS){
  signal?.throwIfAborted();
  let request=manifestRequests.get(key);const started=cacheGeneration;
  if(!request){
   request=(async()=>await (await response(base+'manifest?'+query)).json() as RepositoryManifest)();
   manifestRequests.set(key,request);request.finally(()=>{if(manifestRequests.get(key)===request)manifestRequests.delete(key);}).catch(()=>{});
  }
  const value=await request;signal?.throwIfAborted();entry={at:Date.now(),value};if(started===cacheGeneration)manifests.set(key,entry);if(manifests.size>10)manifests.delete(manifests.keys().next().value!);
 }
  const manifest=entry.value;
  const targetPath=(t:ManifestTarget)=>`repository-reports/${t.id}/${t.collected_run}`;
  if(path==='data/index.json')return {...manifest,launch_endpoint:applicationEndpoint,publishing_repository:repository,repository_assets:true,
    metrics:undefined,report_storage:manifest.metrics,targets:manifest.targets.map(t=>({...t,report:t.documents?targetPath(t):undefined}))} as T;
   const overlayPrefix='data/current-overlay/';
   const isOverlay=path.startsWith(overlayPrefix);
   const selectedTarget=isOverlay?manifest.current_overlay:manifest.targets.find(t=>path.startsWith('data/'+targetPath(t)+'/'));
   if(!selectedTarget)throw new Error('Target report is no longer current. Refresh the target.');
   const document=path.slice(isOverlay?overlayPrefix.length:('data/'+targetPath(selectedTarget)+'/').length);
  const name=selectedTarget.documents?.[document];
  if(!name)throw new Error('Requested report document is unavailable.');
  const assetKey=key+'/'+(isOverlay?'overlay/':'')+name;
 let promise=shards.get(assetKey);
 if(!promise){
   const assetQuery=new URLSearchParams(query);assetQuery.set('asset',name);if(isOverlay)assetQuery.set('overlay','current');
  promise=(async()=>{const r=await response(base+'asset?'+assetQuery);const bytes=await r.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    if(hash!==selectedTarget.assets[name].sha256||bytes.byteLength!==selectedTarget.assets[name].bytes)throw new Error('Report integrity check failed.');
   return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();})();
  shards.set(assetKey,promise);promise.catch(()=>shards.delete(assetKey));
  if(shards.size>4)shards.delete(shards.keys().next().value!);
 }
 const documents=await promise;
 if(!(document in documents))throw new Error('Report document missing from verified asset.');
 return documents[document] as T;
}
