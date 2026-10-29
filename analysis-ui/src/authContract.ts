export type ProjectRegistry={execution_repository:{id:number;full_name:string};projects:Array<{id:string|number}>;[key:string]:unknown};
export type AuthSession={handle:string;login:string;user_id:number;role:'read'|'write'|'admin';capabilities:{read:boolean;write:boolean;admin:boolean};verified_at:string};
export type AuthBootstrap={schema_version:'auth-bootstrap-v1';session:AuthSession;registry:ProjectRegistry;token?:string;login?:string};
export type AuthErrorAction='RETRY'|'SIGN_IN'|'SIGN_OUT'|'NONE';
export type AuthError={code:string;message:string;recoverable:boolean;action:AuthErrorAction;retry_after_seconds?:number};

export function decodeBootstrap(value:unknown):AuthBootstrap{
 const candidate=value as Partial<AuthBootstrap>|null,session=candidate?.session,registry=candidate?.registry;
 if(candidate?.schema_version!=='auth-bootstrap-v1'||!session||!registry||!/^[A-Za-z0-9_-]{12,128}$/.test(session.handle||'')||typeof session.login!=='string'||!Number.isSafeInteger(session.user_id)||!['read','write','admin'].includes(session.role)||typeof session.capabilities?.read!=='boolean'||typeof session.capabilities?.write!=='boolean'||typeof session.capabilities?.admin!=='boolean'||typeof session.verified_at!=='string'||!Number.isSafeInteger(registry.execution_repository?.id)||typeof registry.execution_repository?.full_name!=='string'||!Array.isArray(registry.projects))throw new Error('The authentication response is incompatible. Retry sign-in.');
 return candidate as AuthBootstrap;
}

export function decodeAuthError(value:unknown,status=0):AuthError{
 const candidate=value as {error?:Partial<AuthError>|string;code?:string;message?:string}|null;
 if(candidate?.error&&typeof candidate.error==='object'&&typeof candidate.error.code==='string'&&typeof candidate.error.message==='string')return{code:candidate.error.code,message:candidate.error.message,recoverable:candidate.error.recoverable!==false,action:candidate.error.action||'RETRY',...(Number.isFinite(candidate.error.retry_after_seconds)?{retry_after_seconds:candidate.error.retry_after_seconds}: {})};
 const code=candidate?.code||'AUTH_UNAVAILABLE';
 const message=candidate?.message||(typeof candidate?.error==='string'?candidate.error:`Authentication failed (${status}).`);
 return{code,message,recoverable:!['viewer_not_authorized','session_invalid'].includes(code),action:['viewer_not_authorized','session_invalid'].includes(code)?'SIGN_OUT':'RETRY'};
}
