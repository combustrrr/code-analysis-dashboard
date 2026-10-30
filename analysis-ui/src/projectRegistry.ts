type RegistrySession={token:string;registry?:unknown};
type RegistryAuth={session?:RegistrySession;api:(path:string,body?:unknown,extraHeaders?:Record<string,string>)=>Promise<unknown>};

const REGISTRY_CACHE_MS=60*1000;
let token='';
let value:unknown;
let storedAt=0;
let request:Promise<unknown>|undefined;
let generation=0;

function selectSession(auth:RegistryAuth){
 const next=auth.session?.token||'';
 if(next!==token){token=next;value=auth.session?.registry;storedAt=value?Date.now():0;request=undefined;generation++;}
}

export function cachedProjectRegistry<T>(auth:RegistryAuth){
 selectSession(auth);
 return value as T|undefined;
}

export function getProjectRegistry<T>(auth:RegistryAuth,force=false):Promise<T>{
 selectSession(auth);
 if(!auth.session)return Promise.reject(new Error('Sign in to view configured projects.'));
 if(!force&&value&&Date.now()-storedAt<REGISTRY_CACHE_MS)return Promise.resolve(value as T);
 if(!request){
  const started=generation;
  request=auth.api('projects').then(result=>{if(started===generation){value=result;storedAt=Date.now();}return result;}).finally(()=>{if(started===generation)request=undefined;});
 }
 return request as Promise<T>;
}

export function refreshProjectRegistry(){value=undefined;storedAt=0;request=undefined;generation++;}

export function markProjectPreparing(projectId:string,requestId:string,targetSha?:string){
 if(!value||typeof value!=='object')return;const registry=value as {projects?:unknown[];summary?:Record<string,number>;refresh_after_seconds?:number};if(!Array.isArray(registry.projects))return;
 let changed=false;const projects=registry.projects.map(item=>{if(!item||typeof item!=='object'||String((item as {id?:unknown}).id)!==projectId)return item;changed=true;return{...item,lifecycle:'Preparing',attention_reason:null,active_analysis:{request_id:requestId,status:'preparing',target_sha:targetSha||null,created_at:new Date().toISOString(),scanner_summary:{completed:0,total:0,incomplete:0}},primary_action:{type:'VIEW_PROGRESS',label:'View progress',project_id:projectId,disabled:false,reason:'An analysis request is active.'},secondary_action:null};});
 if(changed){const previous=registry.projects.find(item=>item&&typeof item==='object'&&String((item as {id?:unknown}).id)===projectId) as {lifecycle?:string}|undefined;value={...registry,projects,refresh_after_seconds:8,summary:registry.summary?{...registry.summary,preparing:(registry.summary.preparing||0)+(previous?.lifecycle==='Preparing'?0:1),analyzing:Math.max(0,(registry.summary.analyzing||0)-(previous?.lifecycle==='Analyzing'?1:0)),needs_attention:Math.max(0,(registry.summary.needs_attention||0)-(previous?.lifecycle==='Needs attention'?1:0))}:registry.summary};storedAt=Date.now();}
}
