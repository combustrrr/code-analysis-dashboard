// Bounded operational events only; no auth callbacks, identities or request payloads.
export function diagnosticEvent(request,status,started,requestId) {
  const path=new URL(request.url).pathname;
  if (!path.startsWith('/api/') || request.method==='OPTIONS') return null;
  const category=path.startsWith('/api/public/')?'reports':path==='/api/session'?'session':
    /launch|install|preview/.test(path)?'mutation':path.includes('activity')?'activity':'configuration';
  return {event:'analysis_api',category,method:['GET','POST'].includes(request.method)?request.method:'other',
    status,elapsed_ms:Math.max(0,Date.now()-started),request_id:requestId};
}
export function emitDiagnostic(request,status,started,requestId,env) {
  if(env.SAFE_API_LOGS!=='true')return;
  const event=diagnosticEvent(request,status,started,requestId);
  if(event && (status>=400 || Math.random()<0.05))console.log(JSON.stringify(event));
}
