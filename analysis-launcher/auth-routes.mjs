export const AUTH_SCHEMA='auth-bootstrap-v1';
export const AUTH_CACHE_MS=60000;
export const authRoutePaths=new Set(['/api/auth/redeem','/api/auth/logout','/api/bootstrap']);

export function authorizationFresh(row,repositoryId,now=Date.now()){
 const value=row?.authorization;
 return Boolean(value&&value.user_id===row.user_id&&value.login?.toLowerCase()===row.login?.toLowerCase()&&value.repository_id===repositoryId&&now-value.verified_at>=0&&now-value.verified_at<AUTH_CACHE_MS);
}

export function bootstrapDocument(handle,row,repository,registry){
 const authorization=row.authorization,verified_at=new Date(authorization.verified_at).toISOString();
 return{schema_version:AUTH_SCHEMA,session:{handle,login:row.login,user_id:row.user_id,role:authorization.role,capabilities:authorization.capabilities,verified_at},registry,token:handle,login:row.login};
}

export function authErrorDocument(code,message,status,retryAfter){
 const signOut=['viewer_not_authorized','session_invalid','session_expired','session_identity_changed'].includes(code),signIn=['exchange_invalid','exchange_expired','oauth_state_mismatch'].includes(code);
 return{error:{code,message,recoverable:!signOut,action:signOut?'SIGN_OUT':signIn?'SIGN_IN':'RETRY',...(retryAfter?{retry_after_seconds:Number(retryAfter)}:{})},code,message,status};
}
