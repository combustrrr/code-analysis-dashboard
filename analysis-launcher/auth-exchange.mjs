const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const UUID=/^[0-9a-f-]{36}$/i,HANDLE=/^[A-Za-z0-9_-]{43}$/;
const now=()=>Date.now();

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
      if(!intent||!UUID.test(intent.request_id||'')||intent.idempotency_key!==intent.request_id)return json({error:'invalid_request'},400);
      const idKey=`queue:id:${intent.request_id}`,existing=await s.get(idKey);
      if(existing)return JSON.stringify(existing.intent)===JSON.stringify(intent)?json({...existing,duplicate:true}):json({error:'idempotency_conflict'},409);
      const meta=(await s.get('queue:meta'))||{next_sequence:1,pending:0,active:null};
      if(meta.pending>=100)return json({error:'queue_full'},429);
      const row={request_id:intent.request_id,sequence:meta.next_sequence++,status:'queued',attempts:0,created_at:new Date().toISOString(),intent};
      meta.pending++;await s.put(idKey,row);await s.put(`queue:seq:${String(row.sequence).padStart(12,'0')}`,row.request_id);await s.put('queue:meta',meta);
      return json({...row,queue_position:meta.pending},201);
    });
    if(path==='/queue/status'){
      if(!UUID.test(body.request_id||''))return json({error:'invalid_request'},400);
      const row=await this.state.storage.get(`queue:id:${body.request_id}`);if(!row)return json({error:'not_found'},404);
      const entries=row.status==='queued'?await this.state.storage.list({prefix:'queue:seq:'}):new Map();
      const queue_position=row.status==='queued'?([...entries.values()].indexOf(row.request_id)+1||null):null;
      return json({...row,queue_position});
    }
    if(path==='/queue/claim')return this.transact(async s=>{
      const meta=(await s.get('queue:meta'))||{next_sequence:1,pending:0,active:null},timestamp=now();
      if(meta.active&&meta.active.lease_expires_at>timestamp)return json({status:'busy'},409);
      if(meta.active){const old=await s.get(`queue:id:${meta.active.request_id}`);if(old){old.status='queued';await s.put(`queue:id:${old.request_id}`,old);}meta.active=null;}
      const entries=await s.list({prefix:'queue:seq:'}),first=[...entries.entries()].sort(([a],[b])=>a.localeCompare(b))[0];
      if(!first)return new Response(null,{status:204});
      const row=await s.get(`queue:id:${first[1]}`);if(!row)return new Response(null,{status:204});
      row.status='running';row.attempts++;row.claimed_at=new Date().toISOString();row.lease_expires_at=timestamp+1800000;
      meta.active={request_id:row.request_id,lease_expires_at:row.lease_expires_at};await s.put(`queue:id:${row.request_id}`,row);await s.put('queue:meta',meta);return json(row);
    });
    if(path==='/queue/complete')return this.transact(async s=>{
      if(!UUID.test(body.request_id||'')||!['published','failed','superseded'].includes(body.status))return json({error:'invalid_request'},400);
      const key=`queue:id:${body.request_id}`,row=await s.get(key);if(!row)return json({error:'not_found'},404);
      const meta=(await s.get('queue:meta'))||{};
      if(row.status!=='running'||meta.active?.request_id!==row.request_id)return json({error:'request_not_active'},409);
      row.status=body.status;row.completed_at=new Date().toISOString();row.result=body.result||null;
      await s.put(key,row);await s.delete(`queue:seq:${String(row.sequence).padStart(12,'0')}`);meta.pending=Math.max(0,(meta.pending||1)-1);if(meta.active?.request_id===row.request_id)meta.active=null;await s.put('queue:meta',meta);return json(row);
    });
    return json({error:'not_found'},404);
  }
  async alarm(){const rows=await this.state.storage.list({prefix:'exchange:'});for(const [key,value] of rows)if(value.expires_at<=now())await this.state.storage.delete(key);}
}
