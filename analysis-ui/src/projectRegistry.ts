type RegistrySession={token:string;registry?:unknown};
type RegistryAuth={session?:RegistrySession;api:(path:string,body?:unknown,extraHeaders?:Record<string,string>)=>Promise<unknown>};

const REGISTRY_CACHE_MS=5*60*1000;
let token='';
let value:unknown;
let storedAt=0;
let request:Promise<unknown>|undefined;

function selectSession(auth:RegistryAuth){
 const next=auth.session?.token||'';
 if(next!==token){token=next;value=auth.session?.registry;storedAt=value?Date.now():0;request=undefined;}
}

export function cachedProjectRegistry<T>(auth:RegistryAuth){
 selectSession(auth);
 return value as T|undefined;
}

export function getProjectRegistry<T>(auth:RegistryAuth,force=false):Promise<T>{
 selectSession(auth);
 if(!auth.session)return Promise.reject(new Error('Sign in to view configured projects.'));
 if(!force&&value&&Date.now()-storedAt<REGISTRY_CACHE_MS)return Promise.resolve(value as T);
 if(!request||force){
  request=auth.api('projects').then(result=>{value=result;storedAt=Date.now();return result;}).finally(()=>{request=undefined;});
 }
 return request as Promise<T>;
}

export function refreshProjectRegistry(){value=undefined;storedAt=0;request=undefined;}
