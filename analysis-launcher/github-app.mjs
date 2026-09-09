// GitHub App installation tokens and signature-verified background dispatch.
const encoder=new TextEncoder();
const b64=data=>btoa(String.fromCharCode(...new Uint8Array(data))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export async function verifyWebhook(body,signature,secret) {
  if(!secret || !/^sha256=[a-f0-9]{64}$/.test(signature || '')) return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=Uint8Array.from(signature.slice(7).match(/../g),x=>parseInt(x,16));
  return crypto.subtle.verify('HMAC',key,bytes,body);
}
export async function installationToken(env,installationId,repositoryId) {
  if(!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY || !Number.isSafeInteger(installationId) || !Number.isSafeInteger(repositoryId)) throw new Error('GitHub App background authentication is not configured.');
  const pem=env.GITHUB_APP_PRIVATE_KEY.replace(/-----[^-]+-----|\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const now=Math.floor(Date.now()/1000);
  const input=b64(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})))+'.'+b64(encoder.encode(JSON.stringify({iat:now-30,exp:now+300,iss:env.GITHUB_APP_ID})));
  const jwt=input+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(input)));
  const response=await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`,{method:'POST',headers:{Authorization:`Bearer ${jwt}`,Accept:'application/vnd.github+json','User-Agent':'code-analysis-application'},body:JSON.stringify({repository_ids:[repositoryId],permissions:{actions:'write',contents:'read'}})});
  if(!response.ok) throw new Error('GitHub App installation token could not be issued.');
  return (await response.json()).token;
}
export async function webhook(request,env) {
  if(new URL(request.url).pathname!=='/webhook' || request.method!=='POST') return null;
  const buffer=await request.arrayBuffer();
  if(buffer.byteLength>1000000) return Response.json({error:'Webhook too large.'},{status:413});
  if(!await verifyWebhook(buffer,request.headers.get('X-Hub-Signature-256'),env.GITHUB_WEBHOOK_SECRET)) return Response.json({error:'Invalid webhook signature.'},{status:401});
  let event;try{event=JSON.parse(new TextDecoder().decode(buffer));}catch{return Response.json({error:'Invalid webhook payload.'},{status:400});}
  const kind=request.headers.get('X-GitHub-Event');
  const repository=event.repository;
  if(!repository || repository.private || repository.full_name?.toLowerCase()==='arydestroyer/kavach-agenticsoc') return Response.json({status:'ignored'});
  const supported=kind==='push'||(kind==='pull_request'&&['opened','reopened','synchronize','closed','edited'].includes(event.action))||(kind==='workflow_run'&&event.action==='completed'&&event.workflow_run?.path?.split('@')[0]==='.github/workflows/code-analysis-source.yml');
  if(!supported) return Response.json({status:'ignored'});
  try {
    const token=await installationToken(env,event.installation?.id,repository.id);
    const response=await fetch(`https://api.github.com/repos/${repository.full_name}/actions/workflows/code-analysis-reconcile.yml/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'code-analysis-application'},body:JSON.stringify({ref:repository.default_branch,inputs:{request_id:request.headers.get('X-GitHub-Delivery')||''}})});
    if(!response.ok) throw new Error('Reconciliation dispatch failed.');
    return Response.json({status:'submitted'},{status:202});
  } catch {return Response.json({error:'Background dispatch unavailable. Hourly repository reconciliation remains the recovery path.'},{status:503});}
}
