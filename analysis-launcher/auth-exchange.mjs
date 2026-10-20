const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const UUID=/^[0-9a-f-]{36}$/i,HANDLE=/^[A-Za-z0-9_-]{43}$/;
const now=()=>Date.now();
const QUEUE_SCHEMA='analysis-queue-v3',LEASE_MS=30*60*1000;
const emptyMeta=()=>({schema_version:QUEUE_SCHEMA,next_sequence:1,pending:0,active:null,generation:1,paused:false,reset_notice:null});
const leaseToken=()=>crypto.randomUUID();

export class AuthExchangeStore {
  constructor(state){this.state=state;}
  transact(fn){return this.state.storage.transaction(storage=>fn(storage));}
  async fetch(request){
    const path=new URL(request.url).pathname;
    if(request.method!=='POST')return json({error:'not_found'},404);
    let body;try{body=await request.json();}catch{return json({error:'invalid_request'},400);}
    if(path==='/exchange/issue'){
      if(!HANDLE.test(body.code||'')||!HANDLE.test(body.verifier_hash||'')||!HANDLE.test(body.session_handle||''))return json({error:'invalid_request'},400);
      const expires_at=now()+120000;
      await this.transact(s=>s.put(`exchange:${body.code}`,{verifier_hash:body.verifier_hash,session_handle:body.session_handle,expires_at}));
      await this.state.storage.setAlarm(expires_at);return json({ok:true},201);
    }
    if(path==='/exchange/consume')return this.transact(async s=>{
      if(!HANDLE.test(body.code||'')||!HANDLE.test(body.verifier_hash||''))return json({error:'invalid_request'},400);
      const key=`exchange:${body.code}`,row=await s.get(key);
      if(!row)return json({error:'exchange_invalid'},404);
      if(row.expires_at<=now()){await s.delete(key);return json({error:'exchange_expired'},410);}
      if(row.verifier_hash!==body.verifier_hash)return json({error:'exchange_invalid'},401);
      await s.delete(key);return json({session_handle:row.session_handle});
    });
    if(path==='/session/create'){
      if(!HANDLE.test(body.handle||'')||typeof body.grant!=='string'||!Number.isSafeInteger(body.user_id)||typeof body.login!=='string')return json({error:'invalid_request'},400);
      const issued_at=now(),absolute_expires_at=Math.min(issued_at+28800000,Number(body.grant_expires_at)||issued_at+28800000);
      await this.transact(s=>s.put(`session:${body.handle}`,{user_id:body.user_id,login:body.login,grant:body.grant,issued_at,last_seen_at:issued_at,absolute_expires_at}));
      return json({ok:true},201);
    }
    if(path==='/session/get')return this.transact(async s=>{
      if(!HANDLE.test(body.handle||''))return json({error:'session_invalid'},401);
      const key=`session:${body.handle}`,row=await s.get(key),timestamp=now();
      if(!row||row.absolute_expires_at<=timestamp||row.last_seen_at+1800000<=timestamp){if(row)await s.delete(key);return json({error:'session_expired'},401);}
      row.last_seen_at=timestamp;await s.put(key,row);return json(row);
    });
    if(path==='/session/delete'){
      if(HANDLE.test(body.handle||''))await this.state.storage.delete(`session:${body.handle}`);return json({ok:true});
    }
    if(path==='/queue/admit')return this.transact(async s=>{
      const intent=body.request;
      if(!intent||intent.schema_version!=='analysis-request-v3'||!UUID.test(intent.request_id||'')||!UUID.test(intent.idempotency_key||'')||!/^[0-9a-f]{40}$/.test(intent.source_sha||''))return json({error:'invalid_request'},400);
      const idKey=`queue:id:${intent.request_id}`,dedupeKey=`queue:dedupe:${intent.idempotency_key}`,dedupe=await s.get(dedupeKey),existing=dedupe?await s.get(`queue:id:${dedupe}`):await s.get(idKey);
      if(existing)return JSON.stringify(existing.intent)===JSON.stringify(intent)?json({...existing,duplicate:true}):json({error:'idempotency_conflict'},409);
      const meta=(await s.get('queue:meta'))||emptyMeta();
      if(meta.paused)return json({error:'admission_paused',reset_notice:meta.reset_notice},503);
      if(meta.pending>=100)return json({error:'queue_full'},429);
      const row={schema_version:QUEUE_SCHEMA,request_id:intent.request_id,sequence:meta.next_sequence++,generation:meta.generation,status:'queued',attempts:0,created_at:new Date().toISOString(),intent};
      meta.pending++;await s.put(idKey,row);await s.put(dedupeKey,row.request_id);await s.put(`queue:seq:${String(row.sequence).padStart(12,'0')}`,row.request_id);await s.put('queue:meta',meta);
      return json({...row,queue_position:meta.pending},201);
    });
    if(path==='/queue/status'){
      if(!UUID.test(body.request_id||''))return json({error:'invalid_request'},400);
      const row=await this.state.storage.get(`queue:id:${body.request_id}`);if(!row)return json({error:'not_found'},404);
      const entries=row.status==='queued'?await this.state.storage.list({prefix:'queue:seq:'}):new Map();
      const queue_position=row.status==='queued'?([...entries.values()].indexOf(row.request_id)+1||null):null;
      return json({...row,queue_position});
    }
    if(path==='/queue/recent'){
      const entries=await this.state.storage.list({prefix:'queue:id:'});
      const rows=[...entries.values()].sort((a,b)=>(b.sequence||0)-(a.sequence||0)).slice(0,20);
      return json({checked_at:new Date().toISOString(),requests:rows.map(row=>({request_id:row.request_id,status:row.status,created_at:row.created_at,completed_at:row.completed_at||null,intent:row.intent,result:row.result||null}))});
    }
    if(path==='/queue/public-state'){const meta=(await this.state.storage.get('queue:meta'))||emptyMeta();return json({admission_paused:meta.paused===true,reset_notice:meta.reset_notice||null,generation:meta.generation});}
    if(path==='/queue/claim')return this.transact(async s=>{
      const meta=(await s.get('queue:meta'))||emptyMeta(),timestamp=now();
      if(meta.paused)return json({status:'paused',reset_notice:meta.reset_notice},409);
      if(meta.active&&meta.active.lease_expires_at>timestamp)return json({status:'busy'},409);
      if(meta.active){const old=await s.get(`queue:id:${meta.active.request_id}`);if(old){old.status='queued';await s.put(`queue:id:${old.request_id}`,old);}meta.active=null;}
      const entries=await s.list({prefix:'queue:seq:'}),first=[...entries.entries()].sort(([a],[b])=>a.localeCompare(b))[0];
      if(!first)return new Response(null,{status:204});
      const row=await s.get(`queue:id:${first[1]}`);if(!row)return new Response(null,{status:204});
      if((body.request_id&&body.request_id!==row.request_id)||(body.source_sha&&body.source_sha!==row.intent.source_sha))return json({error:'wake_hint_mismatch',expected_request_id:row.request_id},409);
      row.status='running';row.attempts++;row.claimed_at=new Date().toISOString();row.lease_expires_at=timestamp+LEASE_MS;row.generation=meta.generation;row.lease_token=leaseToken();
      meta.active={request_id:row.request_id,generation:row.generation,lease_token:row.lease_token,lease_expires_at:row.lease_expires_at};await s.put(`queue:id:${row.request_id}`,row);await s.put('queue:meta',meta);return json(row);
    });
    if(path==='/queue/heartbeat')return this.transact(async s=>{
      const meta=(await s.get('queue:meta'))||emptyMeta(),active=meta.active;
      if(!active||body.request_id!==active.request_id||body.generation!==active.generation||body.lease_token!==active.lease_token)return json({error:'stale_lease'},409);
      const row=await s.get(`queue:id:${body.request_id}`);if(!row||row.status!=='running')return json({error:'request_not_active'},409);
      const timestamp=now();if(active.lease_expires_at<=timestamp)return json({error:'lease_expired'},409);
      row.lease_expires_at=timestamp+LEASE_MS;active.lease_expires_at=row.lease_expires_at;row.workflow_run_id=body.workflow_run_id||row.workflow_run_id;row.workflow_run_attempt=body.workflow_run_attempt||row.workflow_run_attempt;
      await s.put(`queue:id:${row.request_id}`,row);await s.put('queue:meta',meta);return json({ok:true,request_id:row.request_id,generation:row.generation,lease_expires_at:row.lease_expires_at});
    });
    if(path==='/queue/complete')return this.transact(async s=>{
      if(!UUID.test(body.request_id||'')||!['published','failed','superseded'].includes(body.status))return json({error:'invalid_request'},400);
      const key=`queue:id:${body.request_id}`,row=await s.get(key);if(!row)return json({error:'not_found'},404);
      const meta=(await s.get('queue:meta'))||{};
      if(row.status!=='running'||meta.active?.request_id!==row.request_id||body.generation!==meta.active?.generation||body.lease_token!==meta.active?.lease_token)return json({error:'stale_lease'},409);
      row.status=body.status;row.completed_at=new Date().toISOString();row.result=body.result||null;
      await s.put(key,row);await s.delete(`queue:seq:${String(row.sequence).padStart(12,'0')}`);meta.pending=Math.max(0,(meta.pending||1)-1);if(meta.active?.request_id===row.request_id)meta.active=null;
      const entries=await s.list({prefix:'queue:seq:'}),nextEntry=[...entries.entries()].sort(([a],[b])=>a.localeCompare(b))[0];
      const next=nextEntry?await s.get(`queue:id:${nextEntry[1]}`):null;
      await s.put('queue:meta',meta);return json({...row,next_request:next?{request_id:next.request_id,source_sha:next.intent.source_sha}:null});
    });
    if(path==='/queue/pause')return this.transact(async s=>{const meta=(await s.get('queue:meta'))||emptyMeta();meta.paused=true;meta.reset_notice=String(body.reason||'Analysis is temporarily unavailable for a planned execution-backbone reset.').slice(0,500);await s.put('queue:meta',meta);return json(meta);});
    if(path==='/queue/resume')return this.transact(async s=>{const meta=(await s.get('queue:meta'))||emptyMeta();meta.paused=false;await s.put('queue:meta',meta);return json(meta);});
    if(path==='/queue/reset')return this.transact(async s=>{
      const meta=(await s.get('queue:meta'))||emptyMeta();if(!meta.paused)return json({error:'pause_required'},409);
      const rows=await s.list({prefix:'queue:id:'}),cancelled_at=new Date().toISOString();let cancelled=0;
      for(const [key,row] of rows){if(['queued','running'].includes(row.status)){cancelled++;row.status='cancelled_cutover';row.completed_at=cancelled_at;row.result={reason:meta.reset_notice};await s.put(key,row);}await s.delete(`queue:seq:${String(row.sequence).padStart(12,'0')}`);}
      const dedupe=await s.list({prefix:'queue:dedupe:'});for(const key of dedupe.keys())await s.delete(key);
      const next={...emptyMeta(),generation:(meta.generation||1)+1,paused:true,reset_notice:meta.reset_notice};await s.put('queue:meta',next);return json({ok:true,cancelled,generation:next.generation,reset_notice:next.reset_notice});
    });
    return json({error:'not_found'},404);
  }
  async alarm(){const rows=await this.state.storage.list({prefix:'exchange:'});for(const [key,value] of rows)if(value.expires_at<=now())await this.state.storage.delete(key);}
}
