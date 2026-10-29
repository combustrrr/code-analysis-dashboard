import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {AUTH_PENDING_MS,AUTH_SESSION_KEY,clearSessionHandle,pendingAuthValid,readSessionHandle,safeReturnRoute,writeSessionHandle,type PendingAuth} from './authClient';
import {decodeAuthError,decodeBootstrap} from './authContract';
import bootstrap from './test-fixtures/auth-bootstrap-v1.json';

describe('auth bootstrap contract',()=>{
 it('accepts the versioned Worker response and rejects drift',()=>{expect(decodeBootstrap(bootstrap).session.login).toBe('developer');expect(()=>decodeBootstrap({...bootstrap,schema_version:'future'})).toThrow(/incompatible/);expect(()=>decodeBootstrap({...bootstrap,registry:{projects:[]}})).toThrow(/incompatible/);});
 it('normalizes structured and compatibility errors',()=>{expect(decodeAuthError({error:{code:'github_rate_limited',message:'Wait',recoverable:true,action:'RETRY',retry_after_seconds:60}},429)).toMatchObject({action:'RETRY',retry_after_seconds:60});expect(decodeAuthError({code:'session_invalid',error:'Expired'},401).action).toBe('SIGN_OUT');});
});

describe('tab-scoped auth storage',()=>{
 const values=new Map<string,string>();
 beforeEach(()=>{values.clear();vi.stubGlobal('sessionStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});});
 afterEach(()=>vi.unstubAllGlobals());
 it('stores only a validated opaque handle',()=>{writeSessionHandle('s'.repeat(43));expect(values.get(AUTH_SESSION_KEY)).toBe('s'.repeat(43));expect(readSessionHandle()).toBe('s'.repeat(43));clearSessionHandle();expect(readSessionHandle()).toBeUndefined();expect(()=>writeSessionHandle('github-token')).toThrow();});
 it('expires pending PKCE transactions after ten minutes',()=>{const pending:PendingAuth={verifier:'v'.repeat(43),createdAt:1000,returnRoute:'#/projects',endpoint:'https://worker.example'};vi.spyOn(Date,'now').mockReturnValue(1000+AUTH_PENDING_MS);expect(pendingAuthValid(pending,pending.endpoint)).toBe(true);vi.spyOn(Date,'now').mockReturnValue(1001+AUTH_PENDING_MS);expect(pendingAuthValid(pending,pending.endpoint)).toBe(false);});
 it('canonicalizes only recognized application routes',()=>{expect(safeReturnRoute('#/projects/1360051890/report?target=current')).toBe('#/projects/1360051890/report?target=current');expect(safeReturnRoute('#/admin/escape')).toBe('#/projects');});
});
