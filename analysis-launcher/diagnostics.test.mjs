import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticEvent,emitDiagnostic} from './diagnostics.mjs';
import worker from './worker.mjs';
import {readFileSync} from 'node:fs';
test('diagnostics exclude OAuth paths and sensitive request content',()=>{
 const headers={Authorization:'Bearer private-token',Cookie:'private-cookie'};
 assert.equal(diagnosticEvent(new Request('https://worker/auth/callback?code=private-code',{headers}),500,Date.now(),'id'),null);
 const event=diagnosticEvent(new Request('https://worker/api/project-launch?repository=private-repo&token=private-token',{method:'POST',headers,body:'private-body'}),503,Date.now(),'safe-id');
 assert.deepEqual(Object.keys(event).sort(),['category','elapsed_ms','event','method','request_id','status']);
 assert.equal(event.category,'mutation');assert.ok(!JSON.stringify(event).includes('private'));
});
test('errors are logged, success is sampled and disabled logging stays silent',t=>{
 const calls=t.mock.method(console,'log',()=>{});t.mock.method(Math,'random',()=>0.9);
 const r=new Request('https://worker/api/public/manifest');
 emitDiagnostic(r,502,Date.now(),'id',{SAFE_API_LOGS:'true'});assert.equal(calls.mock.calls.length,1);
 emitDiagnostic(r,200,Date.now(),'id',{SAFE_API_LOGS:'true'});assert.equal(calls.mock.calls.length,1);
 emitDiagnostic(r,502,Date.now(),'id',{});assert.equal(calls.mock.calls.length,1);
 const config=JSON.parse(readFileSync(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(config.observability.logs.invocation_logs,false);assert.equal(config.observability.traces.enabled,false);
});
test('request correlation keeps anonymous errors private and does not bypass authorization',async()=>{
 const env={SOURCE_REPOSITORY:'source/app',ANALYSIS_REPOSITORY:'host/scanners',DASHBOARD_ORIGIN:'https://owner.github.io',GITHUB_CLIENT_ID:'id',GITHUB_CLIENT_SECRET:'secret',SESSION_KEY:Buffer.alloc(32,7).toString('base64url')};
 const response=await worker.fetch(new Request('https://worker/api/launch',{method:'POST',headers:{Origin:env.DASHBOARD_ORIGIN}}),env);
 assert.equal(response.status,401);assert.match(response.headers.get('X-Request-ID'),/^[a-f0-9-]{36}$/);
 assert.match(response.headers.get('Cache-Control'),/no-store/);
});
