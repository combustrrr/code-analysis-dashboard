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
