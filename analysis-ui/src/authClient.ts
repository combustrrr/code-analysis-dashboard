import {parseAppRoute,routeHash,type AppRoute} from './appRoutes';

export const AUTH_SESSION_KEY='analysis-auth-session';
export const AUTH_PENDING_KEY='analysis-auth-pending';
export const AUTH_ENDPOINT_KEY='analysis-auth-endpoint';
export const AUTH_PENDING_MS=10*60*1000;

export type PendingAuth={verifier:string;createdAt:number;returnRoute:string;endpoint:string};

const canonicalRoute=(hash=location.hash)=>{
 const parsed=parseAppRoute(hash);
 return routeHash(parsed.kind==='landing'?{kind:'projects'}:parsed as AppRoute);
};

export function readSessionHandle(){try{const value=sessionStorage.getItem(AUTH_SESSION_KEY)||'';return/^[A-Za-z0-9_-]{43}$/.test(value)?value:undefined}catch{return undefined}}
export function writeSessionHandle(value:string){if(!/^[A-Za-z0-9_-]{43}$/.test(value))throw new Error('Invalid session handle.');sessionStorage.setItem(AUTH_SESSION_KEY,value)}
export function clearSessionHandle(){try{sessionStorage.removeItem(AUTH_SESSION_KEY)}catch{}}
export function readPendingAuth():PendingAuth|undefined{try{const value=JSON.parse(sessionStorage.getItem(AUTH_PENDING_KEY)||'null') as Partial<PendingAuth>|null;if(!value||typeof value.verifier!=='string'||typeof value.createdAt!=='number'||typeof value.returnRoute!=='string'||typeof value.endpoint!=='string')return undefined;return value as PendingAuth}catch{return undefined}}
export function clearPendingAuth(){try{sessionStorage.removeItem(AUTH_PENDING_KEY)}catch{}}
export function pendingAuthValid(value:PendingAuth,endpoint:string){return value.endpoint===endpoint&&Date.now()-value.createdAt>=0&&Date.now()-value.createdAt<=AUTH_PENDING_MS&&/^[A-Za-z0-9_-]{43}$/.test(value.verifier)}
export function safeReturnRoute(value?:string){if(!value)return routeHash({kind:'projects'});try{const parsed=parseAppRoute(value);return routeHash(parsed.kind==='landing'?{kind:'projects'}:parsed)}catch{return routeHash({kind:'projects'})}}

function randomVerifier(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
async function challengeFor(verifier:string){return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}

export async function beginGitHubSignIn(endpoint:string){
 const verifier=randomVerifier(),challenge=await challengeFor(verifier),returnRoute=canonicalRoute();
 const pending:PendingAuth={verifier,createdAt:Date.now(),returnRoute,endpoint};
 sessionStorage.setItem(AUTH_PENDING_KEY,JSON.stringify(pending));
 sessionStorage.setItem(AUTH_ENDPOINT_KEY,endpoint);
 location.assign(`${endpoint}/auth/login?challenge=${encodeURIComponent(challenge)}`);
}

export function pendingEndpoint(){try{return sessionStorage.getItem(AUTH_ENDPOINT_KEY)||undefined}catch{return undefined}}
