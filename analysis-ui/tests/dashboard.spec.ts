import {expect,test} from '@playwright/test';

const PROJECT='/#/projects/1278177697';

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
  await expect(page.getByText('How to read this evidence')).toBeVisible();
  await expect(page.getByText(/scanner.*support.*finding/i).first()).toBeVisible();
  await page.getByLabel('Severities',{exact:true}).click();
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
  await page.getByLabel('Files',{exact:true}).click();
  const pathOptions=page.getByLabel('Files options').getByRole('option');
  await expect(pathOptions.first()).toBeVisible();
  await pathOptions.first().click();
  await pathOptions.first().click();
  await expect(page.getByLabel('Files selected values')).toContainText('Clear files');
  await expect.poll(async()=>new URL(page.url()).hash.match(/file=/g)?.length||0).toBe(2);
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByLabel('Group issues').selectOption('none');
  await page.locator('.issue-link').first().click();
  await expect(page.getByText('Reported by',{exact:true})).toBeVisible();
  await expect(page.getByText('Rules applied',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Open code on GitHub'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Code at the reported location'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Why this was reported'})).toBeVisible();
 });

 test('in-workspace route changes preserve the reading position',async({page})=>{
  await page.goto(PROJECT);
  await expect(page.getByRole('heading',{name:'Investigation plan'})).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,900));
  const before=await page.evaluate(()=>window.scrollY);
  await page.getByRole('tab',{name:/Issues/}).evaluate((element:HTMLElement)=>element.click());
  await expect(page.getByRole('heading',{name:'Findings to investigate'})).toBeVisible();
  await page.waitForTimeout(100);
  const after=await page.evaluate(()=>window.scrollY);
  expect(after).toBeGreaterThan(before-100);
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
  await page.getByLabel('Report severities',{exact:true}).click();
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

 test('legacy activity URLs fall through to Projects and settings remains reachable',async({page})=>{
  await page.goto('/#/activity');
  await expect(page.getByRole('heading',{name:'Projects',level:1})).toBeVisible();
  await expect(page.locator('.project-run-tracker')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Activity'})).toHaveCount(0);
  await page.getByRole('link',{name:'Settings'}).click();
  await expect(page).toHaveURL(/#\/settings\?section=general/);
  await expect(page.locator('.project-run-tracker')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Preferences and access'})).toBeVisible();
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
  await expect(page).toHaveURL(/#\/settings\?section=general&project=1278177697$/);
  await expect(page.getByRole('link',{name:'Trust Lab and Mphasis code analysis workspace'})).toBeVisible();
  await page.locator('.settings-control-card').getByText('Light',{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.screenshot({path:testInfo.outputPath('desktop-light.png'),fullPage:true});
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.shell-header').getByRole('link',{name:'Project register'})).toBeVisible();
  await expect(page.locator('.shell-header').getByRole('link',{name:'Settings'})).toBeVisible();
  await expect(page.getByLabel('Open navigation')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('mobile-light.png'),fullPage:true});
  await page.locator('.settings-control-card').getByText('Dark',{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:testInfo.outputPath('mobile-dark.png'),fullPage:true});
 });
});
