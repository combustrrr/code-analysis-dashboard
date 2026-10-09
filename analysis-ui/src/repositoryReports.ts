// Read current repository-owned reports without bundling data into the UI build.
const manifests = new Map<string, {at:number; value:any}>();
const shards = new Map<string, Promise<Record<string, unknown>>>();
export const applicationEndpoint = import.meta.env.VITE_LAUNCH_ENDPOINT as string | undefined;
const fixtureBuild = import.meta.env.MODE === 'fixtures';
export function refreshRepositoryReports(){manifests.clear();shards.clear();}
let reportBearer: string | undefined;
export function setReportSession(token?:string) {
 if(token!==reportBearer){manifests.clear();shards.clear();reportBearer=token;}
}
export async function reportFetch(path:string,init:RequestInit={}) {
 const headers=new Headers(init.headers);
 if(reportBearer && applicationEndpoint && new URL(path,location.href).origin===new URL(applicationEndpoint).origin)headers.set('Authorization','Bearer '+reportBearer);
 const response=await fetch(path,{...init,headers,cache:'no-store'});
 if(reportBearer && [401,403].includes(response.status))window.dispatchEvent(new Event('analysis-access-denied'));
 return response;
}
function selection() {const p=new URLSearchParams(location.hash.slice(1));return {repository:p.get('repository'),project:p.get('project'),target:p.get('target')};}
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
   const {repository,project,target}=selection();
  const base=`${applicationEndpoint}/api/public/`;
  const query=new URLSearchParams({repository:repository!,project_id:project!});
  const key=query.toString();
 let entry=manifests.get(key);
 if(!entry||Date.now()-entry.at>60000){const value=await (await response(base+'manifest?'+query,signal)).json();entry={at:Date.now(),value};manifests.set(key,entry);if(manifests.size>10)manifests.delete(manifests.keys().next().value!);}
 const manifest=entry.value;
 const targetPath=(t:any)=>`repository-reports/${t.id}/${t.collected_run}`;
 if(path==='data/index.json')return {...manifest,launch_endpoint:applicationEndpoint,publishing_repository:repository,repository_assets:true,
   metrics:undefined,report_storage:manifest.metrics,targets:manifest.targets.map((t:any)=>({...t,report:t.documents?targetPath(t):undefined}))} as T;
  const selectedTarget=manifest.targets.find((t:any)=>path.startsWith('data/'+targetPath(t)+'/'));
  if(!selectedTarget)throw new Error('Target report is no longer current. Refresh the target.');
  const document=path.slice(('data/'+targetPath(selectedTarget)+'/').length);
  const name=selectedTarget.documents?.[document];
  if(!name && (document==='threat-report.json'||document==='threat-report.md')) {
    const threatQuery=new URLSearchParams(query); threatQuery.set('target_id',selectedTarget.id);
    const payload=await (await response(base+'threat-report?'+threatQuery,signal)).json();
    return (document.endsWith('.md') ? payload.markdown : payload.report) as T;
  }
  if(!name)throw new Error('Requested report document is unavailable.');
 const assetKey=key+'/'+name;
 let promise=shards.get(assetKey);
 if(!promise){
  const assetQuery=new URLSearchParams(query);assetQuery.set('asset',name);
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
