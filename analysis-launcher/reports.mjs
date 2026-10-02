import {reportToken} from './github-app.mjs';
const apiCache=new Map();
const markdownText=value=>String(value??'').replaceAll('\\','\\\\').replaceAll('`','\\`').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('|','\\|');
// Public reports are resolved through verified public repositories and managed releases.
const REPO = /^[\w.-]+\/[\w.-]+$/;
export async function publicReports(request,env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['/api/public/manifest','/api/public/asset','/api/public/projects','/api/public/threat-report'].includes(url.pathname)) return null;
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

    if(url.pathname.endsWith('/threat-report')) {
      const targetId=url.searchParams.get('target_id');
      const target=manifest.targets.find(row=>row.id===targetId);
      if(!target) return Response.json({error:'Selected report target is unavailable.'},{status:404});
      if(target.documents?.['threat-report.json']) return Response.json({error:'Stored threat report must be fetched as a verified asset.'},{status:409});
      const maxInput=2*1024*1024, deadline=Date.now()+1500;
      let documents;
      for(const [asset,meta] of Object.entries(target.assets||{})) {
        if(meta.bytes>maxInput || Date.now()>deadline) return Response.json({error:'Threat Report unavailable; rerun analysis.'},{status:413});
        const object=await env.ANALYSIS_REPORTS.get(`analysis-current-${project}/${asset}`);
        if(!object) continue;
        const bytes=new Uint8Array(await object.arrayBuffer());
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
        if(digest!==meta.sha256 || bytes.byteLength!==meta.bytes) return Response.json({error:'Threat Report unavailable; rerun analysis.'},{status:502});
        const unpacked=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
        if(unpacked['findings.json']) { documents=unpacked; break; }
      }
      if(!documents || !Array.isArray(documents['findings.json']) || !documents['report.json']) return Response.json({error:'Threat Report unavailable; rerun analysis.'},{status:404});
      const defaults={security:['Security condition requires review','A security scanner identified a condition that may weaken confidentiality, integrity, or availability.',['Inspect the exact source location and trace relevant inputs and callers.','Apply the scanner rule documentation guidance after confirming runtime context.']],dependency:['Dependency or component requires review','A dependency scanner identified a package or component that may need attention.',['Confirm the dependency is used in the deployed artifact.','Upgrade to a reviewed fixed version or apply the vendor mitigation.']],quality:['Code quality condition requires review','A code-quality scanner identified a maintainability or correctness condition.',['Confirm the finding reflects the intended behavior.','Refactor the smallest safe unit and preserve behavior with tests.']],unknown:['Finding requires developer review','The available scanner metadata does not identify a more specific guidance category.',['Inspect the scanner message, rule documentation, and exact source location.','Determine whether the condition affects production behavior.']]};
      const findings=documents['findings.json'].slice(0,5000).map((row,index)=>{const category=/secret|security|vuln/i.test(`${row.message} ${(row.rules||[]).join(' ')}`)?'security':/depend|package|license/i.test(`${row.message} ${(row.rules||[]).join(' ')}`)?'dependency':/quality|style|complex/i.test(`${row.message} ${(row.rules||[]).join(' ')}`)?'quality':'unknown';const d=defaults[category]||defaults.unknown;return {finding_id:row.id,category,severity:['CRITICAL','HIGH','MEDIUM','LOW','INFO'].includes(row.severity)?row.severity:'UNKNOWN',evidence_sources:['scanner'],guidance_source:'fallback',guidance_match:'legacy_category_fallback',title:d[0],explanation:d[1],impact:'Potential impact depends on reachable code, inputs, deployment configuration, and available controls.',remediation_steps:d[2],references:[],message:String(row.message||'').slice(0,4000),file:String(row.file||'').slice(0,1000),line:Number(row.line)||0,rule:String((row.rules||[])[0]||'unknown').slice(0,300),scanners:Array.isArray(row.scanners)?row.scanners.slice(0,8):[],uncertainty_notice:true};});
      if(documents['findings.json'].length>5000 || Date.now()>deadline) return Response.json({error:'Threat Report unavailable; rerun analysis.'},{status:413});
      const report=documents['report.json'];const legacy={schema_version:'threat-report-v1',report_id:`legacy:${target.id}:${report.analyzed_sha}`,immutable:false,generation_mode:'legacy-runtime',target:report.target,target_sha:report.analyzed_sha,generated_at:new Date().toISOString(),guidance_catalog_version:'legacy-worker-fallback',generator_version:'legacy-worker-v1',status:report.status,limitations:['Generated at request from a stored report that predates Threat Report publication.','Guidance is fallback content and is not an immutable publication artifact.'],coverage:{status:report.status==='partial'?'partial':'complete',expected_channels:(report.channels||[]).map(c=>c.channel),available_channels:(report.channels||[]).filter(c=>['COMPLETED','COMPLETED_OPTIONAL','CONFIGURED_COMPLETE','POLICY_FINDINGS'].includes(c.status)).map(c=>c.channel),incomplete_channels:report.incomplete_channels||[]},metrics:{findings_total:findings.length,findings_by_category:Object.fromEntries(Object.entries(findings.reduce((m,f)=>(m[f.category]=(m[f.category]||0)+1,m),{}))),findings_by_severity:Object.fromEntries(Object.entries(findings.reduce((m,f)=>(m[f.severity]=(m[f.severity]||0)+1,m),{}))),advisories_total:0,guidance_matched:0,guidance_fallback:findings.length},findings};
      const md=['# Threat Report','', '> Legacy runtime report: generated from an older stored analysis; rerun analysis for an immutable publication artifact.','',`- Analyzed SHA: \`${markdownText(legacy.target_sha)}\``,`- Findings: ${findings.length}`,'','## Findings','',...findings.map((f,i)=>`### ${i+1}. [${markdownText(f.severity)}] ${markdownText(f.title)}\n\n- Category: ${markdownText(f.category)}\n- Location: \`${markdownText(f.file)}:${f.line}\`\n- Scanner message: ${markdownText(f.message)}\n\n**Explanation:** ${markdownText(f.explanation)}\n\n**Remediation:**\n${f.remediation_steps.map(s=>`- ${markdownText(s)}`).join('\n')}\n`)].join('\n');
      return Response.json({report:legacy,markdown:md},{headers:{'Cache-Control':'private, max-age=30'}});
    }
    
    const name = url.searchParams.get('asset');
    if(!/^analysis-[a-f0-9]{64}\.json\.gz$/.test(name || '') || !manifest.targets.some(t=>t.assets?.[name])) return Response.json({error:'Asset is not part of the current report.'},{status:404});
    
    const assetObj = await env.ANALYSIS_REPORTS.get(`analysis-current-${project}/${name}`);
    if(!assetObj) throw new Error('Report asset missing or exceeds the delivery limit.');
    return new Response(assetObj.body,{headers:{'Content-Type':'application/gzip','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  } catch(error) {return Response.json({error:error.message},{status:502,headers:{'Cache-Control':'no-store'}});}
}
