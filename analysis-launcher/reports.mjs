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
    
    if (!env.ANALYSIS_REPORTS) throw new Error('Storage binding not configured.');
    const manifestObj = await env.ANALYSIS_REPORTS.get(`analysis-current-${project}.json`);
    if (!manifestObj) throw new Error('Report not found in storage.');
    const manifest = await manifestObj.json();
    
    if(manifest.schema_version !== 'analysis-current-v1' || manifest.project_id !== project || manifest.analysis_repository?.toLowerCase() !== repo.full_name.toLowerCase()) throw new Error('Report identity could not be verified.');
    if(url.pathname.endsWith('/manifest')) return Response.json(manifest,{headers:{'Cache-Control':'public, max-age=60'}});
    
    const name = url.searchParams.get('asset');
    if(!/^analysis-[a-f0-9]{64}\.json\.gz$/.test(name || '') || !manifest.targets.some(t=>t.assets?.[name])) return Response.json({error:'Asset is not part of the current report.'},{status:404});
    
    const assetObj = await env.ANALYSIS_REPORTS.get(`analysis-current-${project}/${name}`);
    if(!assetObj) throw new Error('Report asset missing or exceeds the delivery limit.');
    return new Response(assetObj.body,{headers:{'Content-Type':'application/gzip','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  } catch(error) {return Response.json({error:error.message},{status:502,headers:{'Cache-Control':'no-store'}});}
}
