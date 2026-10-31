import {expect,test,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PROJECT='/#/projects/1278177697';
async function expectAxeClean(page:Page){
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
 expect(result.violations,JSON.stringify(result.violations,null,2)).toEqual([]);
}

test.describe('production shell',()=>{
 test('serves the configured favicon and modern routes only',async({page})=>{
  const favicon=await page.request.get('/favicon.svg');expect(favicon.ok()).toBe(true);
  await page.goto('/#/projects');
  await expect(page.getByRole('heading',{name:'Projects',level:1})).toBeVisible();
  await page.goto('/#/not-a-route');
  await expect(page.getByRole('heading',{name:'Projects',level:1})).toBeVisible();
  await expect(page).toHaveURL(/#\/not-a-route$/);
 });

 test('authenticated header icons remain compact and cannot expand the shell',async({page})=>{
  await page.goto('/#/projects');
  await expect(page.getByRole('heading',{name:'Projects',level:1})).toBeVisible();
  const geometry=await page.evaluate(()=>({
   header:document.querySelector('.shell-header')?.getBoundingClientRect().height||0,
   icons:[...document.querySelectorAll('.shell-header .ui-icon')].map(icon=>icon.getBoundingClientRect().width),
  }));
  expect(geometry.header).toBeLessThanOrEqual(100);
  expect(geometry.icons.length).toBeGreaterThan(0);
  expect(Math.max(...geometry.icons)).toBeLessThanOrEqual(20);
 });

 test('project register primary actions keep accessible text in the light theme',async({page})=>{
  await page.goto('/#/projects');
  await expect(page.getByRole('heading',{name:'Projects',level:1})).toBeVisible();
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await page.evaluate(()=>{
   const shell=document.createElement('div');
   shell.className='projects-shell';
   const actions=document.createElement('div');
   actions.className='project-record-actions';
   const link=document.createElement('a');
   link.className='project-action project-action-primary';
   link.href='#/projects/test/run';
   link.textContent='Run analysis';
   actions.append(link);
   shell.append(actions);
   document.body.append(shell);
  });
  const primaryAction=page.locator('.project-record-actions .project-action-primary').first();
  await expect(primaryAction).toBeVisible();
  await expect(primaryAction).toHaveCSS('color','rgb(255, 255, 255)');
  await primaryAction.hover();
  await expect(primaryAction).toHaveCSS('color','rgb(255, 255, 255)');
 });

 test('project overview keeps one explicit run action and immutable revision context',async({page})=>{
  await page.goto(PROJECT);
  await expect(page.getByLabel('Selected analysis revision')).toContainText('Agentic-Kibana');
  await expect(page.getByLabel('Selected analysis revision')).toContainText(/Revision/);
  await expect(page.getByLabel('Target revision')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Run analysis'})).toHaveCount(1);
  await expect(page.getByRole('tab',{name:/Overview/})).toHaveAttribute('aria-selected','true');
  await expect(page.getByText('CURRENT REVIEW OBJECTIVE',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:/Validate critical findings|Triage high-severity findings|Close the scanner coverage gaps|Review the leading evidence clusters/})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Where should the review focus?'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Investigation plan'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Review critical findings|Review high findings|Review all issues/})).toBeVisible();
  await expect(page.locator('.overview-chart')).toHaveCount(5);
  await expect(page.getByLabel('Finding counts by severity')).toBeVisible();
  await expect(page.getByLabel('Finding counts by scanner')).toBeVisible();
  await expect(page.getByLabel('Finding counts by rule')).toBeVisible();
 });

 test('issues support search, grouping, advanced filters, and evidence',async({page})=>{
  await page.goto(PROJECT+'/issues');
  await expect(page.getByRole('heading',{name:'Findings to investigate'})).toBeVisible();
  await page.getByRole('button',{name:'Load complete catalog'}).click();
  await expect(page.getByLabel('Search issues')).toBeVisible();
  await expect(page.getByText('How to read this evidence')).toBeVisible();
  await expect(page.getByText(/scanner.*support.*finding/i).first()).toBeVisible();
  await page.locator('.path-multi-picker summary').first().click();
  const severityOptions=page.getByLabel('Severities options').getByRole('option');
  await severityOptions.first().click();
  await severityOptions.first().click();
  await expect.poll(async()=>new URL(page.url()).hash.match(/severity=/g)?.length||0).toBe(2);
  await expect(page.getByLabel('Location',{exact:true})).toBeVisible();
  await page.getByLabel('Location',{exact:true}).fill('Any file and line');
  await expect(page).toHaveURL(/location=located/);
  await page.getByLabel('Search issues').fill('CVE-2026-42561');
  await expect(page).toHaveURL(/q=CVE-2026-42561/);
  await expect(page.locator('.ant-table-tbody > tr.ant-table-row').first()).toBeVisible();
  await page.getByLabel('Group issues').selectOption('rule');
  await expect(page).toHaveURL(/group=rule/);
  await expect(page.getByText(/finding/).first()).toBeVisible();
  await page.getByRole('button',{name:'More filters'}).click();
  await page.locator('.path-multi-picker summary').filter({hasText:/Choose files/i}).click();
  const pathOptions=page.getByLabel('Files options').getByRole('option');
  await expect(pathOptions.first()).toBeVisible();
  await pathOptions.first().click();
  await pathOptions.first().click();
  await expect(page.getByLabel('Files selected values')).toContainText('Clear files');
  await expect.poll(async()=>new URL(page.url()).hash.match(/file=/g)?.length||0).toBe(2);
  await page.locator('.path-multi-picker summary').filter({hasText:/files selected/i}).click();
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByLabel('Group issues').selectOption('none');
  await page.locator('.issue-link').first().click();
  await expect(page.locator('.filters')).toBeHidden();
  await expect(page.getByRole('button',{name:'Back to findings'})).toBeVisible();
  await expect.poll(async()=>page.locator('.evidence-panel').evaluate(element=>element.getBoundingClientRect().width/window.innerWidth)).toBeGreaterThan(.9);
  await expect(page.getByText('Reported by',{exact:true})).toBeVisible();
  await expect(page.getByText('Rules applied',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Open code on GitHub'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Code at the reported location'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Why this was reported'})).toBeVisible();
 });

 test('workflow annotations filter safely and expose exact run provenance',async({page})=>{
  const annotation={id:'workflow-annotation:1',severity:'MEDIUM',category:'WORKFLOW',message:'Compiler warning <script>alert(1)</script>',file:'src/example.ts',line:12,scanners:['Workflow annotations'],rules:['TS1234'],observation_count:1,scanner_family_count:1,page:0,annotation:{source:'check-run',level:'warning',workflow:'.github/workflows/ci.yml',run_id:123,run_attempt:2,job:'build',step:null,check_run_id:456,policy:'actionable',contributes_to_needs_attention:true,run_url:'https://github.com/combustrrr/code-analysis-dashboard/actions/runs/123/attempts/2',check_url:'https://github.com/combustrrr/code-analysis-dashboard/runs/456',file_url:'https://github.com/combustrrr/Agentic-Kibana/blob/'+'a'.repeat(40)+'/src/example.ts#L12',correlation:{status:'unmatched',finding_id:null,scanner:null}}};
  await page.route('**/*',route=>{const url=decodeURIComponent(route.request().url());if(url.includes('data/index.json'))return route.fulfill({json:{schema_version:'dashboard-index-v1',checked_at:'2026-01-01T00:00:00Z',preferred_branch:'main',analysis_repository:'combustrrr/code-analysis-dashboard',source_repository:'combustrrr/Agentic-Kibana',targets:[{id:'current',label:'main',repository:'combustrrr/Agentic-Kibana',source_repository:'combustrrr/Agentic-Kibana',head_sha:'a'.repeat(40),kind:'branch',branch:'main',checked_at:'2026-01-01T00:00:00Z',status:'current',report:'reports/fixture'}]}});if(url.includes('project-overview.json'))return route.fulfill({json:{schema_version:'project-overview-v1',analyzed_sha:'a'.repeat(40),generated_at:'2026-01-01T00:00:00Z',findings:{total:1,observations:1,critical:0,high:0,located:1},coverage:{completed:1,total:1,publication_gate_satisfied:true,incomplete_channels:[]},distributions:{severity:[{label:'MEDIUM',count:1}],category:[{label:'WORKFLOW',count:1}],scanner:[{label:'Workflow annotations',count:1}],rule:[{label:'TS1234',count:1}],directory:[{label:'src',count:1}],scanner_overlap:[{label:'1 scanner',count:1}]},priority_findings:[annotation],investigation_clusters:[]}});if(url.includes('findings-catalog.json'))return route.fulfill({json:{schema_version:'findings-catalog-v1',total:1,page_size:500,pages:1}});if(url.includes('findings-pages/0.json'))return route.fulfill({json:[annotation]});if(url.includes('finding-locators/1.json'))return route.fulfill({json:[{id:annotation.id,detail_page:0}]});if(url.includes('details/0.json'))return route.fulfill({json:[{...annotation,origins:[{scanner_family:'Workflow annotations',rule:'TS1234',file:'src/example.ts',start_line:12,raw_artifact:'workflow-annotations.json',observation_id:annotation.id}],source:null,source_start:null,source_url:null}]});return route.continue();});
  await page.goto(PROJECT+'/issues');
  await expect(page.getByText('Compiler warning <script>alert(1)</script>')).toBeVisible();
  await expect(page.locator('.issue-link').first()).toContainText('<script>alert(1)</script>');
  await page.getByRole('button',{name:'More filters'}).click();
  await page.locator('.path-multi-picker summary').filter({hasText:/Choose annotation sources/i}).click();
  await page.getByLabel('Annotation sources options').getByRole('option',{name:'check-run'}).click();
  await expect(page).toHaveURL(/annotationSource=check-run/);
  await page.getByRole('button',{name:'Compiler warning <script>alert(1)</script>'}).click();
  await expect(page.getByRole('heading',{name:'Workflow annotation provenance'})).toBeVisible();
  await expect(page.getByText(/run 123 attempt 2/)).toBeVisible();
  for(const name of ['Open trusted run','Open trusted check','Open immutable file']){
   const link=page.getByRole('link',{name});await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel',/noopener noreferrer/);
  }
 });

 test('project status and issue content remain in intrinsic document flow',async({page})=>{
  await page.goto(PROJECT+'/issues');
  await expect(page.getByRole('heading',{name:'Findings to investigate'})).toBeVisible();
  const geometry=await page.locator('.project-workspace').evaluate(workspace=>{
   const banner=document.createElement('section');
   banner.className='analysis-progress-banner';
   banner.innerHTML='<div><strong>Dynamic analysis status</strong><small>Evidence remains available while scanners run.</small></div><a class="ant-btn">View progress</a>';
   const following=workspace.firstElementChild as HTMLElement|null;
   workspace.insertBefore(banner,following);
   const bannerRect=banner.getBoundingClientRect();
   const followingRect=following?.getBoundingClientRect();
   return{
    position:getComputedStyle(banner).position,
    bannerBottom:bannerRect.bottom,
    followingTop:followingRect?.top||0,
    workspaceWidth:workspace.getBoundingClientRect().width,
    viewportWidth:window.innerWidth,
   };
  });
  expect(geometry.position).not.toBe('sticky');
  expect(geometry.bannerBottom).toBeLessThanOrEqual(geometry.followingTop);
  expect(geometry.workspaceWidth/geometry.viewportWidth).toBeGreaterThan(.9);
 });

 test('mobile issues use bounded evidence cards instead of compressed table columns',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(PROJECT+'/issues');
  await expect(page.getByRole('heading',{name:'Findings to investigate'})).toBeVisible();
  await expect(page.locator('.issues-table .ant-table-thead')).toHaveCSS('position','absolute');
  await expect(page.locator('.issues-table .ant-table-row')).toHaveCount(20);
  const geometry=await page.evaluate(()=>({
   documentWidth:document.documentElement.scrollWidth,
   viewportWidth:window.innerWidth,
   tabs:[...document.querySelectorAll('.project-navigation .ant-tabs-tab')].map(item=>item.getBoundingClientRect()),
   firstRow:document.querySelector('.issues-table .ant-table-row')?.getBoundingClientRect(),
  }));
  expect(geometry.documentWidth).toBe(geometry.viewportWidth);
  expect(geometry.tabs).toHaveLength(4);
  expect(new Set(geometry.tabs.map(tab=>Math.round(tab.top))).size).toBe(2);
  expect(geometry.firstRow?.width).toBeLessThanOrEqual(370);
 });

 test('mobile finding detail opens as a bounded full-screen evidence sheet',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(PROJECT+'/issues');
  await expect(page.getByRole('heading',{name:'Findings to investigate'})).toBeVisible();
  await expect(page.locator('.issues-table .ant-table-row')).toHaveCount(20);
  await page.locator('.issue-link').first().click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(':scope > header')).toContainText('Issue detail');
  await expect(dialog.getByRole('button',{name:'Close'})).toHaveCSS('min-height','44px');
  const geometry=await dialog.evaluate(element=>{
   const rect=element.getBoundingClientRect(),body=element.querySelector('.ant-drawer-body') as HTMLElement|null,source=element.querySelector('.source') as HTMLElement|null;
   return{left:rect.left,right:rect.right,width:rect.width,viewport:window.innerWidth,bodyWidth:body?.clientWidth||0,bodyScrollWidth:body?.scrollWidth||0,sourceWidth:source?.clientWidth||0};
  });
  expect(geometry.left).toBe(0);
  expect(geometry.right).toBe(geometry.viewport);
  expect(geometry.width).toBe(geometry.viewport);
  expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.bodyWidth);
  expect(geometry.sourceWidth).toBeLessThanOrEqual(geometry.bodyWidth);
 });

 test('in-workspace route changes preserve the reading position',async({page})=>{
  await page.goto(PROJECT);
  await expect(page.getByRole('heading',{name:'Investigation plan'})).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,900));
  const before=await page.evaluate(()=>window.scrollY);
  await page.getByRole('tab',{name:/Issues/}).evaluate((element:HTMLElement)=>element.click());
  await expect(page.getByRole('heading',{name:'Findings to investigate'})).toBeVisible();
  await page.waitForTimeout(100);
  const {after,maximum}=await page.evaluate(()=>({after:window.scrollY,maximum:document.documentElement.scrollHeight-window.innerHeight}));
  expect(after).toBeGreaterThanOrEqual(Math.min(before-100,maximum));
 });

 test('coverage keeps scanner outcomes separate from downloadable reports',async({page})=>{
  await page.goto(PROJECT+'/coverage');
  await expect(page.getByRole('heading',{name:'Analysis channels'})).toBeVisible();
  await expect(page.getByText('Atheris',{exact:true})).toBeVisible();
  await expect(page.getByText('Schemathesis',{exact:true})).toBeVisible();
  await expect(page.getByText('Coverage does not guarantee that the code is secure')).toBeVisible();
 });

 test('reports provides a direct issues PDF export without duplicating issue content',async({page})=>{
  await page.route('**/data/reports/retained/threat-report.json',route=>route.fulfill({json:{schema_version:'threat-report-v1',report_id:'report-fixture',analysis_id:'analysis-fixture',immutable:true,source_repository:'combustrrr/Agentic-Kibana',ref:'Testing',target_sha:'2c38720d0b6814383779b701345b0c286b7c5f77',generated_at:'2026-09-07T00:00:00Z',guidance_catalog_version:'fixture',generator_version:'fixture',status:'partial',limitations:['Fixture limitation'],coverage:{status:'partial',expected_channels:['semgrep','atheris'],available_channels:['semgrep'],incomplete_channels:['atheris'],positioning_statement:'Fixture evidence.',channel_matrix:[]},metrics:{findings_total:1,findings_by_category:{security:1},findings_by_severity:{HIGH:1},advisories_total:0,guidance_matched:1,guidance_fallback:0},findings:[{finding_id:'finding-1',category:'security',severity:'HIGH',evidence_sources:['semgrep'],guidance_source:'catalog',guidance_match:'fixture',title:'Fixture issue',explanation:'Fixture explanation',impact:'Fixture impact',remediation_steps:['Fixture remediation'],references:[],message:'Fixture scanner message',file:'src/example.ts',line:12,rule:'fixture-rule',scanners:['semgrep']}]}}));
  await page.route('**/data/reports/retained/threat-report.md',route=>route.fulfill({body:'# Fixture report',contentType:'text/markdown'}));
  await page.goto(PROJECT+'/report');
  await expect(page.getByRole('heading',{name:'Downloadable reports'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Complete issues report'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Download complete PDF'})).toBeVisible();
  await expect(page.getByText('Build a filtered issues report',{exact:true})).toBeVisible();
  await expectAxeClean(page);
  await page.locator('.report-export-filters .path-multi-picker summary').first().click();
  await page.getByLabel('Report severities options').getByRole('option',{name:'HIGH'}).click();
  await expect(page.getByRole('button',{name:'Download filtered PDF'})).toBeEnabled();
  const filteredDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download filtered PDF'}).click();
  expect((await filteredDownload).suggestedFilename()).toMatch(/Agentic-Kibana-2c38720d0b68-filtered\.pdf$/);
  await expect(page.getByRole('heading',{name:'Highest-severity findings'})).toHaveCount(0);
  await expect(page.getByText('Channel coverage',{exact:true})).toHaveCount(0);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download complete PDF'}).click();
  expect((await download).suggestedFilename()).toMatch(/Agentic-Kibana-2c38720d0b68-complete\.pdf$/);
 });

 test('every evidence workspace route passes automated WCAG checks',async({page})=>{
  test.setTimeout(90_000);
  await page.goto(PROJECT);
  await expect(page.getByRole('heading',{name:'Where should the review focus?'})).toBeVisible();
  await expectAxeClean(page);

  await page.goto(PROJECT+'/issues');
  await expect(page.getByRole('heading',{name:'Findings to investigate'})).toBeVisible();
  await page.getByRole('button',{name:'Load complete catalog'}).click();
  await expect(page.getByLabel('Search issues')).toBeVisible();
  await expectAxeClean(page);

  await page.goto(PROJECT+'/coverage');
  await expect(page.getByRole('heading',{name:'Analysis channels'})).toBeVisible();
  await expectAxeClean(page);

  await page.goto(PROJECT+'/report');
  await expect(page.getByRole('heading',{name:'Downloadable reports'})).toBeVisible();
  await expectAxeClean(page);

  await page.setViewportSize({width:390,height:844});
  await page.goto(PROJECT+'/issues');
  await expect(page.locator('.issue-link').first()).toBeVisible();
  await page.locator('.issue-link').first().click();
  await expect(page.getByRole('dialog',{name:'Issue detail'})).toBeVisible();
  await expectAxeClean(page);
 });

 test('issue detail navigation uses stable scroll and focus anchors',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto(PROJECT+'/issues');
  const loadAll=page.getByRole('button',{name:'Load complete catalog'});
  if(await loadAll.isVisible())await loadAll.click();
  const issue=page.locator('.issue-link').nth(10);
  await issue.scrollIntoViewIfNeeded();
  const label=(await issue.textContent())?.trim();
  expect(label).toBeTruthy();
  await issue.click();
  const detail=page.locator('.evidence-panel');
  await expect(detail).toBeVisible();
  const detailPosition=await detail.evaluate(element=>({top:element.getBoundingClientRect().top,bottom:element.getBoundingClientRect().bottom,viewport:innerHeight}));
  expect(detailPosition.top).toBeGreaterThanOrEqual(0);
  expect(detailPosition.top).toBeLessThan(detailPosition.viewport);
  await detail.getByRole('button',{name:'Back to findings'}).click();
  const restored=page.locator('.issue-link').filter({hasText:label!}).first();
  await expect(restored).toBeFocused();
  const restoredPosition=await restored.evaluate(element=>({top:element.getBoundingClientRect().top,bottom:element.getBoundingClientRect().bottom,viewport:innerHeight}));
  expect(restoredPosition.bottom).toBeGreaterThan(0);
  expect(restoredPosition.top).toBeLessThan(restoredPosition.viewport);
 });

 test('legacy activity URLs fall through to Projects and settings remains reachable',async({page})=>{
  await page.goto('/#/activity');
  await expect(page.getByRole('heading',{name:'Projects',level:1})).toBeVisible();
  await expect(page.locator('.project-run-tracker')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Activity'})).toHaveCount(0);
  await page.getByRole('link',{name:'Settings'}).click();
  await expect(page).toHaveURL(/#\/settings\/overview$/);
  await expect(page.locator('.project-run-tracker')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Account and preferences'})).toBeVisible();
  await expect(page.getByRole('link',{name:/Integrations/})).toBeVisible();
  await expect(page.getByRole('link',{name:/Security & provenance/})).toBeVisible();
  await page.goto('/#/settings?section=connections');
  await expect(page.getByRole('heading',{name:'Integrations'})).toBeVisible();
  await page.goto('/#/settings?section=provenance');
  await expect(page.getByRole('heading',{name:'Security & provenance'})).toBeVisible();
 });

 test('run route opens confirmation without starting from navigation',async({page})=>{
  await page.goto(PROJECT);
  await page.getByRole('link',{name:'Run analysis'}).click();
  await expect(page).toHaveURL(/#\/projects\/1278177697\/run$/);
  await expect(page.getByRole('dialog',{name:'Run analysis'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Fast analysis/})).toBeVisible();
  await page.getByRole('button',{name:/Configure analysis/}).click();
  await expect(page.getByLabel('Full commit SHA')).toBeVisible();
  await expect(page.getByRole('button',{name:'Choose a branch or pull request instead'})).toBeVisible();
  await page.getByRole('button',{name:'Choose a branch or pull request instead'}).click();
  await expect(page.getByRole('radiogroup',{name:'Revision type'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/projects\/1278177697$/);
 });

 test('theme persists and mobile navigation remains bounded',async({page},testInfo)=>{
  await page.goto(PROJECT);
  await expect(page.getByText('CURRENT REVIEW OBJECTIVE',{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('desktop-dark.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.locator('.shell-header').getByText('Light',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Open navigation')).toHaveCount(0);
  await page.locator('.shell-header').getByRole('link',{name:'Settings'}).click();
  await expect(page).toHaveURL(/#\/settings\/overview$/);
  await expect(page.getByRole('link',{name:'Trust Lab and Mphasis code analysis workspace'})).toBeVisible();
  await page.locator('.settings-preference-list').getByText('Light',{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('group',{name:'Information density'}).getByText('Compact',{exact:true}).click();
  await page.getByRole('group',{name:'Interface motion'}).getByText('Reduced',{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-density','compact');
  await expect(page.locator('html')).toHaveAttribute('data-motion','reduced');
  await page.screenshot({path:testInfo.outputPath('desktop-light.png'),fullPage:true});
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('html')).toHaveAttribute('data-density','compact');
  await expect(page.locator('html')).toHaveAttribute('data-motion','reduced');
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.shell-header').getByRole('link',{name:'Project register'})).toBeVisible();
  await expect(page.locator('.shell-header').getByRole('link',{name:'Settings'})).toBeVisible();
  await expect(page.getByLabel('Open navigation')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('mobile-light.png'),fullPage:true});
  await page.locator('.settings-preference-list').getByText('Dark',{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:testInfo.outputPath('mobile-dark.png'),fullPage:true});
 });
});
