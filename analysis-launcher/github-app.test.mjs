import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWebhook,webhook} from './github-app.mjs';
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
