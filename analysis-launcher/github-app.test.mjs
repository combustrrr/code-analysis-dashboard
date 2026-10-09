import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWebhook,webhook,reportToken,invalidateReportToken} from './github-app.mjs';
test('webhook authentication rejects tampering and absent signatures',async()=>{
 const body=new TextEncoder().encode('{"ok":true}');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('test-key'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature='sha256='+Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,body)),x=>x.toString(16).padStart(2,'0')).join('');
 assert.equal(await verifyWebhook(body,signature,'test-key'),true);
 assert.equal(await verifyWebhook(body,signature,'wrong'),false);
 assert.equal(await verifyWebhook(body,null,'test-key'),false);
});
test('unauthenticated webhook never dispatches',async()=>{
 const result=await webhook(new Request('https://worker.example/webhook',{method:'POST',body:'{}'}),{GITHUB_WEBHOOK_SECRET:'key'});
 assert.equal(result.status,401);
});

test('cached installation tokens are invalidated on demand',async()=>{
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
  const original=globalThis.fetch;let mints=0;
  globalThis.fetch=async(url)=>{
   if(String(url).endsWith('/installation'))return Response.json({id:5});
   if(String(url).endsWith('/access_tokens')){mints++;return Response.json({token:`minted-${mints}`});}
   throw new Error('Unexpected request');
  };
  try {
   const tokenEnv={GITHUB_APP_ID:'app-cache-test',GITHUB_APP_PRIVATE_KEY:pem};
   assert.equal(await reportToken(tokenEnv,'owner/cached'),'minted-1');
   assert.equal(await reportToken(tokenEnv,'owner/cached'),'minted-1');
   assert.equal(mints,1);
   invalidateReportToken(tokenEnv,'owner/cached');
   assert.equal(await reportToken(tokenEnv,'owner/cached'),'minted-2');
   assert.equal(mints,2);
   // Invalidation is scoped per application and repository.
   assert.equal(await reportToken(tokenEnv,'owner/other'),'minted-3');
   assert.equal(mints,3);
  } finally {globalThis.fetch=original;}
});

async function signedWebhook(body, overrides = {}) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('webhook-key'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new TextEncoder().encode(body);
  const signature='sha256='+Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  return new Request('https://worker.example/webhook',{method:'POST',body,headers:{'X-Hub-Signature-256':signature,'X-GitHub-Event':'push','X-GitHub-Delivery':'delivery-1',...overrides}});
}
const supportedPayload=JSON.stringify({repository:{id:99,full_name:'owner/repository',private:false,default_branch:'main'},installation:{id:7}});
test('signed supported webhook fails closed when replay state is unavailable',async t=>{
  const calls=t.mock.method(globalThis,'fetch',()=>{throw new Error('must not dispatch without replay state');});
  const response=await (await import('./github-app.mjs')).webhook(await signedWebhook(supportedPayload),{GITHUB_WEBHOOK_SECRET:'webhook-key'});
  assert.equal(response.status,503);
  assert.equal(calls.mock.calls.length,0);
});
test('signed delivery is dispatched once and replay is idempotent',async t=>{
  const state={store:new Map(),async get(key){return this.store.get(key)||null;},async put(key,value,options){this.store.set(key,value);assert.equal(options.expirationTtl,86400);}};
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
  let dispatches=0;
  t.mock.method(globalThis,'fetch',async url=>{ if(String(url).endsWith('/access_tokens')) return Response.json({token:'installation-token'}); dispatches++; return new Response(null,{status:204}); });
  const env={GITHUB_WEBHOOK_SECRET:'webhook-key',GITHUB_APP_ID:'app',GITHUB_APP_PRIVATE_KEY:pem,ANALYSIS_STATE:state};
  const module=await import('./github-app.mjs');
  assert.equal((await module.webhook(await signedWebhook(supportedPayload),env)).status,202);
  assert.equal((await module.webhook(await signedWebhook(supportedPayload),env)).status,202);
  assert.equal(dispatches,1);
  assert.equal((await (await module.webhook(await signedWebhook(supportedPayload),env)).json()).status,'duplicate');
});