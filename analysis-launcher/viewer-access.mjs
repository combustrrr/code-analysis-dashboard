import {reportToken, invalidateReportToken} from './github-app.mjs';
// Use installation metadata access so read-only collaborators can also be viewers.
export async function isCollaborator(env, login, tokenProvider=reportToken) {
  if(!/^[a-z0-9](?:[a-z0-9-]{0,38})$/i.test(login||''))return false;
  const target=`https://api.github.com/repos/${env.ANALYSIS_REPOSITORY}/collaborators/${encodeURIComponent(login)}`;
  const headers=token=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'code-analysis-viewer','X-GitHub-Api-Version':'2022-11-28'});
  let token=await tokenProvider(env,env.ANALYSIS_REPOSITORY);
  if(!token)throw new Error('Repository collaborator verification is unavailable.');
  let response=await fetch(target,{headers:headers(token)});
  if(response.status===401 || response.status===403) {
    // The cached installation token was rejected (revoked or re-scoped).
    // Drop it and verify once more with a freshly minted token.
    invalidateReportToken(env,env.ANALYSIS_REPOSITORY);
    const fresh=await tokenProvider(env,env.ANALYSIS_REPOSITORY);
    if(fresh && fresh!==token) response=await fetch(target,{headers:headers(fresh)});
  }
  if(response.status===204)return true;
  if(response.status===404)return false;
  throw new Error('GitHub could not verify repository collaboration.');
}
