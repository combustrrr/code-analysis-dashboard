import {cpSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

const root=resolve('.test-public');
const reportRoot=join(root,'data','reports','retained');
const sha='2c38720d0b6814383779b701345b0c286b7c5f77';
const generated='2026-09-07T07:28:54.107750+00:00';
rmSync(root,{recursive:true,force:true});
mkdirSync(root,{recursive:true});
cpSync(resolve('public-static'),root,{recursive:true});
mkdirSync(join(reportRoot,'details'),{recursive:true});
mkdirSync(join(reportRoot,'finding-locators'),{recursive:true});
mkdirSync(join(reportRoot,'findings-pages'),{recursive:true});
mkdirSync(join(reportRoot,'sources'),{recursive:true});
const write=(path,value)=>{const target=join(root,path);mkdirSync(resolve(target,'..'),{recursive:true});writeFileSync(target,JSON.stringify(value));};

const scanners=['OSV-Scanner','Semgrep','CodeQL','Bandit','Ruff'];
const severities=['HIGH','MEDIUM','LOW','INFO'];
const findings=Array.from({length:25},(_,index)=>{
  const scanner=scanners[index%scanners.length];
  const rule=index===0?'CVE-2026-42561':index%3===0?'shared-review-rule':`${scanner.toLowerCase()}-rule-${index%7}`;
  return {
    id:`fixture:${index.toString(16)}-evidence`,severity:severities[index%severities.length],
    category:index===0?'DEPENDENCY':'SECURITY',
    message:index===0?'CVE-2026-42561 affects the retained fixture dependency':`Fixture finding ${index+1} from ${scanner}`,
    file:`src/module-${index%6}.ts`,line:index+2,scanners:[scanner],rules:[rule],
    observation_count:1,scanner_family_count:1,page:0,
  };
});
const details=findings.map(row=>({...row,origins:[{scanner_family:row.scanners[0],rule:row.rules[0],file:row.file,start_line:row.line,raw_artifact:'fixture.json',observation_id:`observation-${row.id}`}],source:'sources/fixture.json',source_start:1,source_url:`https://github.com/combustrrr/Agentic-Kibana/blob/${sha}/${row.file}#L${row.line}`}));
const channels=[
  {channel:'semgrep',name:'Semgrep',class:'security',status:'COMPLETED',findings:8,observation_count:8,reason:'',workflow:'02-security-sast.yml'},
  {channel:'workflow-annotations',name:'Workflow annotations',class:'reliability',status:'COMPLETED_OPTIONAL',evidence_state:'measured_zero',findings:0,observation_count:0,reason:'GitHub returned zero workflow annotations for the exact run and attempt.',workflow:'https://github.com/combustrrr/code-analysis-dashboard/actions/runs/1'},
  {channel:'schemathesis',name:'Schemathesis',class:'reliability',status:'NOT_AVAILABLE',findings:null,observation_count:0,reason:'No API contract was available.',workflow:'07-api-fuzzing.yml'},
  {channel:'atheris',name:'Atheris',class:'reliability',status:'NOT_AVAILABLE',findings:null,observation_count:0,reason:'No supported fuzz target was available.',workflow:'07-api-fuzzing.yml'},
];
const report={schema_version:'hosted-report-v1',analyzed_sha:sha,generated_at:generated,report_generation_timestamp:generated,status:'partial',finding_count:findings.length,observation_count:findings.length,incomplete_channels:['schemathesis','atheris'],severities:{HIGH:7,MEDIUM:6,LOW:6,INFO:6},channels,producer_runs:[{id:'1',url:'https://github.com/combustrrr/code-analysis-dashboard/actions/runs/1'}],publication_gate:{satisfied:true}};
const count=values=>[...new Map(values.map(value=>[value,values.filter(candidate=>candidate===value).length])).entries()].map(([label,value])=>({label,count:value}));
const overview={schema_version:'project-overview-v1',analyzed_sha:sha,generated_at:generated,findings:{total:findings.length,observations:findings.length,critical:0,high:findings.filter(row=>row.severity==='HIGH').length,located:findings.length},coverage:{completed:2,total:channels.length,publication_gate_satisfied:true,incomplete_channels:['Schemathesis','Atheris']},distributions:{severity:count(findings.map(row=>row.severity)),category:count(findings.map(row=>row.category)),scanner:count(findings.flatMap(row=>row.scanners)),rule:count(findings.flatMap(row=>row.rules)),directory:[{label:'src',count:findings.length}],scanner_overlap:[{label:'1 scanner',count:findings.length}]},priority_findings:findings.slice(0,8),investigation_clusters:[{rule:'shared-review-rule',directory:'src',finding_count:8,file_count:6,finding_ids:findings.filter(row=>row.rules.includes('shared-review-rule')).map(row=>row.id)}]};
const index={schema_version:'dashboard-index-v1',targets:[{id:'fixture-target',repository:'combustrrr/Agentic-Kibana',source_repository:'combustrrr/Agentic-Kibana',kind:'branch',branch:'Testing',head_sha:sha,label:'Testing',report:'reports/retained',status:'partial',checked_at:generated}],preferred_branch:'Testing',analysis_repository:'combustrrr/code-analysis-dashboard',source_repository:'combustrrr/Agentic-Kibana',checked_at:generated};

write('data/index.json',index);
write('data/reports/retained/report.json',report);
write('data/reports/retained/coverage.json',{...report,schema_version:'project-coverage-v1'});
write('data/reports/retained/project-overview.json',overview);
write('data/reports/retained/findings.json',findings);
write('data/reports/retained/findings-catalog.json',{schema_version:'findings-catalog-v1',total:findings.length,page_size:20,pages:2});
write('data/reports/retained/findings-pages/0.json',findings.slice(0,20));
write('data/reports/retained/findings-pages/1.json',findings.slice(20));
write('data/reports/retained/details/0.json',details);
write('data/reports/retained/sources/fixture.json',Array.from({length:80},(_,index)=>`export const fixtureLine${index+1} = ${index+1};`));
const locators={};
for(const finding of findings){const tail=finding.id.slice(finding.id.lastIndexOf(':')+1);const bucket=/^[0-9a-f]/i.test(tail)?tail[0].toLowerCase():'other';(locators[bucket]??=[]).push({id:finding.id,detail_page:0});}
for(const [bucket,rows] of Object.entries(locators))write(`data/reports/retained/finding-locators/${bucket}.json`,rows);
