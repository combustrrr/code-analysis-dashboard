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

 test('project overview keeps one explicit run action and immutable revision context',async({page})=>{
  await page.goto(PROJECT);
  await expect(page.getByLabel('Selected analysis revision')).toContainText('Agentic-Kibana');
  await expect(page.getByLabel('Selected analysis revision')).toContainText(/Revision/);
  await expect(page.getByLabel('Target revision')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Run analysis'})).toHaveCount(1);
  await expect(page.getByRole('tab',{name:/Overview/})).toHaveAttribute('aria-selected','true');
  await expect(page.getByText('Reported issues',{exact:true})).toBeVisible();
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
  await page.getByLabel('Search issues').fill('CVE-2026-42561');
  await expect(page).toHaveURL(/q=CVE-2026-42561/);
  await expect(page.locator('.ant-table-tbody > tr.ant-table-row').first()).toBeVisible();
  await page.getByLabel('Group issues').selectOption('rule');
  await expect(page).toHaveURL(/group=rule/);
  await expect(page.getByText(/finding/).first()).toBeVisible();
  await page.getByRole('button',{name:'More filters'}).click();
  await expect(page.getByLabel('Source location',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByLabel('Group issues').selectOption('none');
  await page.locator('.issue-link').first().click();
  await expect(page.getByText('Reported by',{exact:true})).toBeVisible();
  await expect(page.getByText('Rules applied',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Open code on GitHub'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Code at the reported location'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Why this was reported'})).toBeVisible();
 });

 test('report combines scanner outcomes and immutable coverage context',async({page})=>{
  await page.goto(PROJECT+'/report');
  await expect(page.getByRole('heading',{name:'Published report and scanner coverage'})).toBeVisible();
  await expect(page.getByText('Atheris',{exact:true})).toBeVisible();
  await expect(page.getByText('Schemathesis',{exact:true})).toBeVisible();
  await expect(page.getByText('Coverage does not guarantee that the code is secure')).toBeVisible();
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
  await page.screenshot({path:testInfo.outputPath('desktop-dark.png'),fullPage:true});
  await page.locator('.shell-actions').getByText('Light',{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.screenshot({path:testInfo.outputPath('desktop-light.png'),fullPage:true});
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.setViewportSize({width:390,height:844});
  await page.getByLabel('Open navigation').click();
  await expect(page.locator('.ant-drawer').getByRole('link',{name:'Project register'})).toBeVisible();
  await expect(page.locator('.ant-drawer').getByRole('link',{name:'Activity'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('mobile-light.png'),fullPage:true});
  await page.locator('.ant-drawer').getByText('Dark',{exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.screenshot({path:testInfo.outputPath('mobile-dark.png'),fullPage:true});
 });
});
