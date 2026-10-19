// Read-only GitHub App installation tokens for registry and report metadata.
const encoder=new TextEncoder();
const b64=data=>btoa(String.fromCharCode(...new Uint8Array(data))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function appJwt(env) {
  const pem=env.GITHUB_APP_PRIVATE_KEY.replace(/-----[^-]+-----|\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const now=Math.floor(Date.now()/1000);
  const input=b64(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})))+'.'+b64(encoder.encode(JSON.stringify({iat:now-30,exp:now+300,iss:env.GITHUB_APP_ID})));
  return input+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(input)));
}
export async function installationToken(env,installationId,repositoryId,permissions={actions:'read',contents:'read'}) {
  if(!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !Number.isSafeInteger(installationId) || !(Number.isSafeInteger(repositoryId)||(typeof repositoryId==='string'&&/^[\w.-]+$/.test(repositoryId)))) throw new Error('GitHub App background authentication is not configured.');
  const jwt=await appJwt(env);
  const response=await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`,{method:'POST',headers:{Authorization:`Bearer ${jwt}`,Accept:'application/vnd.github+json','User-Agent':'code-analysis-application'},body:JSON.stringify({...typeof repositoryId==='string'?{repositories:[repositoryId]}:{repository_ids:[repositoryId]},permissions})});
  if(!response.ok) throw new Error('GitHub App installation token could not be issued.');
  return (await response.json()).token;
}
const reportTokens=new Map();
const tokenCacheKey=(env,repository,permissions={contents:'read'})=>`${env?.GITHUB_APP_ID||'app'}:${String(repository||'').toLowerCase()}:${Object.keys(permissions).sort().map(key=>`${key}:${permissions[key]}`).join(',')}`;
// Drop a cached installation token so the next call mints a fresh one.
// Call whenever GitHub rejects a cached token (401/403): revoked or
// re-scoped installations must never keep serving stale credentials.
export function invalidateReportToken(env,repository) {
  const prefix=`${env?.GITHUB_APP_ID||'app'}:${String(repository||'').toLowerCase()}:`;
  for(const key of reportTokens.keys())if(key.startsWith(prefix))reportTokens.delete(key);
}
export async function reportToken(env,repository,permissions={contents:'read'}) {
  if(!env?.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY)return undefined;
  const cacheKey=tokenCacheKey(env,repository,permissions);
  const cached=reportTokens.get(cacheKey);if(cached&&cached.until>Date.now())return cached.token;
  const jwt=await appJwt(env);
  const headers={Authorization:`Bearer ${jwt}`,Accept:'application/vnd.github+json','User-Agent':'code-analysis-reports'};
  const installation=await fetch(`https://api.github.com/repos/${repository}/installation`,{headers});
  if(!installation.ok){const failure=await installation.json().catch(()=>({}));throw new Error(`GitHub App installation lookup failed (${installation.status}): ${failure.message||'Install the App on this execution repository.'}`);}
  const value=await installation.json();
  // Restrict the token to this single execution repository and read-only contents.
  const token=await installationToken(env,value.id,repository.split('/')[1],permissions);
  reportTokens.set(cacheKey,{token,until:Date.now()+3000000});
  if(reportTokens.size>10)reportTokens.delete(reportTokens.keys().next().value);
  return token;
}
