import {reportToken} from './github-app.mjs';
const apiCache=new Map();
// Public reports are resolved through verified public repositories and managed releases.
const REPO = /^[\w.-]+\/[\w.-]+$/;
export async function publicReports(request,env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['/api/public/manifest','/api/public/asset','/api/public/projects'].includes(url.pathname)) return null;
  const repository = url.searchParams.get('repository');
  const project = url.searchParams.get('project_id');
  if (!REPO.test(repository || '') || (url.pathname!='/api/public/projects'&&!/^[1-9][0-9]*$/.test(project || ''))) return Response.json({error:'Invalid repository or project.'},{status:400});
  const headers = {Accept:'application/vnd.github+json','User-Agent':'code-analysis-reports'};
  async function github(path) {
    const key=(env?.GITHUB_APP_ID||'public')+':'+path;
    const cached=apiCache.get(key);if(cached&&cached.until>Date.now())return cached.value;
    const response = await fetch('https://api.github.com/'+path,{headers});
    if(!response.ok) throw new Error('Current report is unavailable; GitHub may be rate limited.');
    const value=await response.json();
    if(JSON.stringify(value).length<100000){apiCache.set(key,{value,until:Date.now()+30000});if(apiCache.size>32)apiCache.delete(apiCache.keys().next().value);}
    return value;
  }
  try {
    const token=await reportToken(env,repository);if(token)headers.Authorization=`Bearer ${token}`;
    const repo = await github('repos/'+repository);
    if(repo.private) return Response.json({error:'Private reports are not supported.'},{status:403});
    if(url.pathname==='/api/public/projects') {
      const file=await github(`repos/${repository}/contents/.github/code-analysis/projects.json?ref=${encodeURIComponent(repo.default_branch)}`);
      const config=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
      if(config.execution_repository?.id!==repo.id)throw new Error('Project configuration identity mismatch.');
      return Response.json({projects:config.projects.map(p=>({id:p.id,source_repository:p.source_repository.full_name,relationship:p.relationship,preferred_branch:p.preferred_branch}))},{headers:{'Cache-Control':'public, max-age=30'}});
    }
    const release = await github(`repos/${repository}/releases/tags/analysis-current-${project}`);
    let manifest = JSON.parse(release.body || '{}');
    if(manifest.schema_version==='analysis-manifest-pointer-v1') {
      const pointer=manifest.asset;
      if(!Number.isSafeInteger(pointer.id)||pointer.bytes>5000000||!/^manifest-[a-f0-9]{64}\.json\.gz$/.test(pointer.name))throw new Error('Invalid manifest pointer.');
      const metadata=await github(`repos/${repository}/releases/assets/${pointer.id}`);
      if(metadata.name!==pointer.name||metadata.size!==pointer.bytes)throw new Error('Manifest asset identity mismatch.');
      const data=await (await fetch(metadata.browser_download_url)).arrayBuffer();
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
      if(digest!==pointer.sha256||data.byteLength!==pointer.bytes)throw new Error('Manifest integrity mismatch.');
      const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
      let size=0, chunks=[];
      while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>10000000){await reader.cancel();throw new Error('Manifest exceeds the delivery limit.');}chunks.push(value);}
      const decoded=new Uint8Array(size);let offset=0;for(const chunk of chunks){decoded.set(chunk,offset);offset+=chunk.length;}
      manifest=JSON.parse(new TextDecoder().decode(decoded));
    }
    if(manifest.schema_version !== 'analysis-current-v1' || manifest.project_id !== project || manifest.analysis_repository?.toLowerCase() !== repo.full_name.toLowerCase()) throw new Error('Report identity could not be verified.');
    if(url.pathname.endsWith('/manifest')) return Response.json(manifest,{headers:{'Cache-Control':'public, max-age=60'}});
    const name = url.searchParams.get('asset');
    if(!/^analysis-[a-f0-9]{64}\.json\.gz$/.test(name || '') || !manifest.targets.some(t=>t.assets?.[name])) return Response.json({error:'Asset is not part of the current report.'},{status:404});
    let asset;
    for(let page=1;page<=100;page++) {
      const rows=await github(`repos/${repository}/releases/${release.id}/assets?per_page=100&page=${page}`);
      asset=rows.find(a=>a.name===name); if(asset || rows.length<100) break;
      if(page===100) throw new Error('Report asset inventory is incomplete.');
    }
    if(!asset || asset.size>100000000) throw new Error('Report asset missing or exceeds the delivery limit.');
    const response=await fetch(asset.browser_download_url);
    if(!response.ok) throw new Error('Report asset download failed.');
    return new Response(response.body,{headers:{'Content-Type':'application/gzip','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  } catch(error) {return Response.json({error:error.message},{status:502,headers:{'Cache-Control':'no-store'}});}
}
