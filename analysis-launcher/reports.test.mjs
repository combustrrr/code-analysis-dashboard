import test from 'node:test';
import assert from 'node:assert/strict';
import {reportToken} from './github-app.mjs';
test('public report tokens are limited to one repository and read-only contents',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pem=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options={})=>{calls.push({url,options});
  if(url.endsWith('/installation'))return Response.json({id:77});
  if(url.endsWith('/repos/owner/public'))return Response.json({id:88,private:false});
  if(url.endsWith('/access_tokens'))return Response.json({token:'test-read-only'});
  throw new Error('Unexpected request');
 };
 try {
  const env={GITHUB_APP_ID:'123',GITHUB_APP_PRIVATE_KEY:pem};
  assert.equal(await reportToken(env,'owner/public'),'test-read-only');
  const request=calls.find(c=>c.url.endsWith('/access_tokens'));
  assert.deepEqual(JSON.parse(request.options.body),{repositories:['public'],permissions:{contents:'read'}});
  await reportToken(env,'owner/public');assert.equal(calls.length,2);
 } finally {globalThis.fetch=original;}
});
