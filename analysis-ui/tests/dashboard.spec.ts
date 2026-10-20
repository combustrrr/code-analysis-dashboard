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
  await expect(page.getByRole('button',{name:/Run analysis/})).toHaveCount(1);
  await expect(page.getByRole('tab',{name:/Overview/})).toHaveAttribute('aria-selected','true');
  await expect(page.getByText('Reported issues',{exact:true})).toBeVisible();
  await expect(page.locator('.overview-chart')).toHaveCount(2);
  await expect(page.locator('.finding-bar')).toHaveCount(6);
  await expect(page.getByRole('img',{name:'Finding counts by severity'})).toBeVisible();
 });

 test('issues support search, grouping, advanced filters, and evidence',async({page})=>{
  await page.goto(PROJECT+'/issues');
  await page.getByLabel('Search issues').fill('CVE-2026-42561');
  await expect(page.locator('.ant-table-tbody > tr.ant-table-row').first()).toBeVisible();
  await page.getByLabel('Group issues').click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:'Rule'}).click();
  await expect(page.getByText(/finding/).first()).toBeVisible();
  await page.getByRole('button',{name:'More filters'}).click();
  await expect(page.getByLabel('Source location',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByLabel('Group issues').click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:'No grouping'}).click();
  await page.locator('.issue-link').first().click();
  await expect(page.getByRole('heading',{name:'Why this was reported'})).toBeVisible();
 });

 test('report combines scanner outcomes and immutable coverage context',async({page})=>{
  await page.goto(PROJECT+'/report');
  await expect(page.getByRole('heading',{name:'Report and scanner coverage'})).toBeVisible();
  await expect(page.getByText('Atheris',{exact:true})).toBeVisible();
  await expect(page.getByText('Schemathesis',{exact:true})).toBeVisible();
  await expect(page.getByText('Coverage is not a clean bill of health')).toBeVisible();
 });

 test('legacy activity URLs fall through to Projects and settings remains reachable',async({page})=>{
  await page.goto('/#/activity');
  await expect(page.getByRole('heading',{name:'Projects',level:1})).toBeVisible();
  await expect(page.getByRole('link',{name:'Activity'})).toHaveCount(0);
  await page.getByRole('link',{name:'Settings'}).click();
  await expect(page).toHaveURL(/#\/settings\?section=general/);
  await expect(page.getByRole('heading',{name:'Appearance'})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Connections & readiness'})).toBeVisible();
 });

 test('run route opens confirmation without starting from navigation',async({page})=>{
  await page.goto(PROJECT);
  await page.getByRole('link',{name:'Choose a revision and scanners'}).click();
  await expect(page).toHaveURL(/#\/projects\/1278177697\/run$/);
  await expect(page.getByRole('dialog',{name:'Run analysis'})).toBeVisible();
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
