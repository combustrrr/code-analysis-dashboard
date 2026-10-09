// GitHub App installation tokens and signature-verified background dispatch.
import {readBody, BodyLimitError, resolveLimit, DEFAULT_LIMITS} from './request-limits.mjs';
const encoder=new TextEncoder();
const b64=data=>btoa(String.fromCharCode(...new Uint8Array(data))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const deliveryKey=delivery=>'github-webhook-delivery:'+delivery;
export async function verifyWebhook(body,signature,secret) {
  if(!secret || !/^sha256=[a-f0-9]{64}$/.test(signature || '')) return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=Uint8Array.from(signature.slice(7).match(/../g),x=>parseInt(x,16));
  return crypto.subtle.verify('HMAC',key,bytes,body);
}
async function appJwt(env) {
  const pem=env.GITHUB_APP_PRIVATE_KEY.replace(/-----[^-]+-----|\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const now=Math.floor(Date.now()/1000);
  const input=b64(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})))+'.'+b64(encoder.encode(JSON.stringify({iat:now-30,exp:now+300,iss:env.GITHUB_APP_ID})));
  return input+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(input)));
}
export async function installationToken(env,installationId,repositoryId,permissions={actions:'write',contents:'read'}) {
  if(!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !Number.isSafeInteger(installationId) || !(Number.isSafeInteger(repositoryId)||(typeof repositoryId==='string'&&/^[\w.-]+$/.test(repositoryId)))) throw new Error('GitHub App background authentication is not configured.');
  const jwt=await appJwt(env);
  const response=await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`,{method:'POST',headers:{Authorization:`Bearer ${jwt}`,Accept:'application/vnd.github+json','User-Agent':'code-analysis-application'},body:JSON.stringify({...typeof repositoryId==='string'?{repositories:[repositoryId]}:{repository_ids:[repositoryId]},permissions})});
  if(!response.ok) throw new Error('GitHub App installation token could not be issued.');
  return (await response.json()).token;
}
const reportTokens=new Map();
const tokenCacheKey=(env,repository)=>`${env?.GITHUB_APP_ID||'app'}:${String(repository||'').toLowerCase()}`;
// Drop a cached installation token so the next call mints a fresh one.
// Call whenever GitHub rejects a cached token (401/403): revoked or
// re-scoped installations must never keep serving stale credentials.
export function invalidateReportToken(env,repository) {
  reportTokens.delete(tokenCacheKey(env,repository));
}
export async function reportToken(env,repository) {
  if(!env?.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY)return undefined;
  const cacheKey=tokenCacheKey(env,repository);
  const cached=reportTokens.get(cacheKey);if(cached&&cached.until>Date.now())return cached.token;
  const jwt=await appJwt(env);
  const headers={Authorization:`Bearer ${jwt}`,Accept:'application/vnd.github+json','User-Agent':'code-analysis-reports'};
  const installation=await fetch(`https://api.github.com/repos/${repository}/installation`,{headers});
  if(!installation.ok){const failure=await installation.json().catch(()=>({}));throw new Error(`GitHub App installation lookup failed (${installation.status}): ${failure.message||'Install the App on this execution repository.'}`);}
  const value=await installation.json();
  // Restrict the token to this single execution repository and read-only contents.
  const token=await installationToken(env,value.id,repository.split('/')[1],{contents:'read'});
  reportTokens.set(cacheKey,{token,until:Date.now()+3000000});
  if(reportTokens.size>10)reportTokens.delete(reportTokens.keys().next().value);
  return token;
}
async function claimWebhookDelivery(env,delivery) {
  if(!env.ANALYSIS_STATE) throw new Error('Webhook replay state is not configured.');
  if(!/^[A-Za-z0-9._:-]{1,200}$/.test(delivery||'')) throw new Error('Webhook delivery id is missing or invalid.');
  const key=deliveryKey(delivery);
  if(await env.ANALYSIS_STATE.get(key)) return false;
  // KV has no conditional put. Keeping the marker gives this boundary safe
  // at-most-once dispatch semantics; hourly reconciliation recovers failures.
  await env.ANALYSIS_STATE.put(key,JSON.stringify({created_at:new Date().toISOString()}),{expirationTtl:86400});
  return true;
}
export async function webhook(request,env) {
  if(new URL(request.url).pathname!=='/webhook' || request.method!=='POST') return null;
  let buffer;
  try {
    buffer=await readBody(request,resolveLimit(env.MAX_WEBHOOK_BYTES,DEFAULT_LIMITS.webhook));
  } catch(error) {
    if(error instanceof BodyLimitError) return Response.json({error:'Webhook too large.'},{status:413});
    throw error;
  }
  if(!await verifyWebhook(buffer,request.headers.get('X-Hub-Signature-256'),env.GITHUB_WEBHOOK_SECRET)) return Response.json({error:'Invalid webhook signature.'},{status:401});
  let event;try{event=JSON.parse(new TextDecoder().decode(buffer));}catch{return Response.json({error:'Invalid webhook payload.'},{status:400});}
  const kind=request.headers.get('X-GitHub-Event');
  const repository=event.repository;
  if(!repository || repository.private || [1267340546,1278177697].includes(repository.id) || ['arydestroyer/kavach-agenticsoc','combustrrr/agentic-kibana'].includes(repository.full_name?.toLowerCase())) return Response.json({status:'ignored'});
  const supported=kind==='push'||(kind==='pull_request'&&['opened','reopened','synchronize','closed','edited'].includes(event.action))||(kind==='workflow_run'&&event.action==='completed'&&event.workflow_run?.path?.split('@')[0]==='.github/workflows/code-analysis-source.yml');
  if(!supported) return Response.json({status:'ignored'});
  try {
    const delivery=request.headers.get('X-GitHub-Delivery');
    if(!await claimWebhookDelivery(env,delivery)) return Response.json({status:'duplicate'},{status:202});
    const token=await installationToken(env,event.installation?.id,repository.id);
    const response=await fetch(`https://api.github.com/repos/${repository.full_name}/actions/workflows/code-analysis-reconcile.yml/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'code-analysis-application'},body:JSON.stringify({ref:repository.default_branch,inputs:{request_id:request.headers.get('X-GitHub-Delivery')||''}})});
    if(!response.ok) throw new Error('Reconciliation dispatch failed.');
    return Response.json({status:'submitted'},{status:202});
  } catch {return Response.json({error:'Background dispatch unavailable. Hourly repository reconciliation remains the recovery path.'},{status:503});}
}
