import test from 'node:test';
import assert from 'node:assert/strict';
import {reportToken,invalidateReportToken} from './github-app.mjs';

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
   invalidateReportToken(tokenEnv,'owner/cached');
   assert.equal(await reportToken(tokenEnv,'owner/cached'),'minted-2');
   assert.equal(await reportToken(tokenEnv,'owner/other'),'minted-3');
  } finally {globalThis.fetch=original;}
});
