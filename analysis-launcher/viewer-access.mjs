import {reportToken} from './github-app.mjs';
// Use installation metadata access so read-only collaborators can also be viewers.
export async function isCollaborator(env, login, tokenProvider=reportToken) {
  if(!/^[a-z0-9](?:[a-z0-9-]{0,38})$/i.test(login||''))return false;
  const token=await tokenProvider(env,env.ANALYSIS_REPOSITORY);
  if(!token)throw new Error('Repository collaborator verification is unavailable.');
  const response=await fetch(`https://api.github.com/repos/${env.ANALYSIS_REPOSITORY}/collaborators/${encodeURIComponent(login)}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'code-analysis-viewer','X-GitHub-Api-Version':'2022-11-28'}
  });
  if(response.status===204)return true;
  if(response.status===404)return false;
  throw new Error('GitHub could not verify repository collaboration.');
}
