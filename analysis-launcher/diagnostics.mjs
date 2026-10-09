// Bounded operational events only; no auth callbacks, identities or request payloads.
// Error classification is a fixed-shape code (lowercase, dots, underscores),
// never free-form upstream text, so diagnostics stay actionable without
// leaking secrets or vendor response bodies.
const ERROR_CODE = /^[a-z0-9_.]{1,64}$/;
export function diagnosticEvent(request,status,started,requestId,code) {
  const path=new URL(request.url).pathname;
  if (!path.startsWith('/api/') || request.method==='OPTIONS') return null;
  const category=path.startsWith('/api/public/')?'reports':path==='/api/session'?'session':
    /launch|install|preview/.test(path)?'mutation':path.includes('activity')?'activity':'configuration';
  const event={event:'analysis_api',category,method:['GET','POST'].includes(request.method)?request.method:'other',
    status,elapsed_ms:Math.max(0,Date.now()-started),request_id:requestId};
  if(typeof code==='string'&&ERROR_CODE.test(code))event.error_code=code;
  return event;
}
export function emitDiagnostic(request,status,started,requestId,env,code) {
  if(env.SAFE_API_LOGS!=='true')return;
  const event=diagnosticEvent(request,status,started,requestId,code);
  if(event && (status>=400 || Math.random()<0.05))console.log(JSON.stringify(event));
}
