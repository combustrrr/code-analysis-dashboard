import {reportToken, invalidateReportToken} from './github-app.mjs';
export class ViewerAccessError extends Error { constructor(message,code,status=503,retryAfter){super(message);this.name='ViewerAccessError';this.code=code;this.status=status;this.retryAfter=retryAfter;} }
const timedFetch=(target,init)=>fetch(target,{...init,signal:AbortSignal.timeout(4000)});

// Use installation metadata access so read-only collaborators can also be viewers.
export async function verifyCollaborator(env, login, tokenProvider=reportToken, etag) {
  if(!/^[a-z0-9](?:[a-z0-9-]{0,38})$/i.test(login||''))return{authorized:false};
  const target=`https://api.github.com/repos/${env.ANALYSIS_REPOSITORY}/collaborators/${encodeURIComponent(login)}`;
  const headers=token=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'code-analysis-viewer','X-GitHub-Api-Version':'2022-11-28',...(etag?{'If-None-Match':etag}:{})});
  let token=await tokenProvider(env,env.ANALYSIS_REPOSITORY);
  if(!token)throw new ViewerAccessError('Repository collaborator verification is unavailable.','github_unavailable');
  let response;try{response=await timedFetch(target,{headers:headers(token)});}catch(error){throw new ViewerAccessError('GitHub collaborator verification timed out.','github_unavailable',503);}
  if(response.status===401 || response.status===403) {
    // The cached installation token was rejected (revoked or re-scoped).
    // Drop it and verify once more with a freshly minted token.
    invalidateReportToken(env,env.ANALYSIS_REPOSITORY);
    const fresh=await tokenProvider(env,env.ANALYSIS_REPOSITORY);
    if(fresh && fresh!==token)try{response=await timedFetch(target,{headers:headers(fresh)});}catch{throw new ViewerAccessError('GitHub collaborator verification timed out.','github_unavailable',503);}
  }
  if(response.status===204)return{authorized:true,etag:response.headers.get('ETag')||undefined};
  if(response.status===304)return{authorized:true,notModified:true,etag};
  if(response.status===404)return{authorized:false};
  const retryAfter=response.headers.get('Retry-After');
  if(response.status===429||response.status===403)throw new ViewerAccessError('GitHub is temporarily limiting collaborator verification.','github_rate_limited',429,retryAfter?Number(retryAfter):undefined);
  throw new ViewerAccessError('GitHub could not verify repository collaboration.','github_unavailable',503);
}
export async function isCollaborator(env,login,tokenProvider=reportToken){return(await verifyCollaborator(env,login,tokenProvider)).authorized;}
