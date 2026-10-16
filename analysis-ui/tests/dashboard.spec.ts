import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// This suite intentionally runs against the explicit Vite fixtures build.
test.describe('local fixture build', () => {

test('favicon is served from the configured base path', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toBe('./favicon.svg');
  const response = await page.request.get(new URL(href!, page.url()).toString());
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
});

test('selected repositories are not silently rewritten', async ({ page }) => {
  await page.goto('/#repository=combustrrr%2Fcode-analysis-dashboard&project=1278177697');
  expect(new URL(page.url()).hash).toContain('repository=combustrrr%2Fcode-analysis-dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Agentic-Kibana');
});

test('retained dataset preserves source identity, filters and issue provenance', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Agentic-Kibana');
  await expect(page.getByText('ANALYZED COMMIT')).toBeVisible();
  await page.getByRole('tab', { name: /^Issues/ }).click();
  await expect(page.getByLabel('Search issues')).toBeVisible();
  await page.getByLabel('Search issues').fill('assert');
  await expect(page.locator('.ant-table-tbody > tr.ant-table-row').first()).toBeVisible();
  await page.locator('.issue-link').first().click();
  await expect(page.getByRole('region', { name: 'Issue detail' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why this was reported' })).toBeVisible();
  await expect(page.getByText('Detected condition, not a proven root cause')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Supporting observations' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Related findings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open exact source revision' })).toHaveAttribute('href', /\/blob\/[a-f0-9]{40}\//);
  const url = page.url(); await page.reload();
  await expect(page.getByRole('heading', { name: 'Supporting observations' })).toBeVisible();
  expect(page.url()).toEqual(url);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Issue detail' })).not.toBeVisible();
  expect(new URL(page.url()).hash).not.toContain('issue=');
  expect(errors).toEqual([]);
});

test('developers can group findings by rule and inspect a relationship', async ({page}) => {
  await page.goto('/');
  await page.getByRole('tab', {name:/^Issues/}).click();
  await page.getByLabel('Group issues').click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:'Group by rule'}).click();
  // Wait for grouping to apply: the Collapse component renders after groupBy state updates
  await expect(page.locator('.issue-groups')).toBeVisible({ timeout: 10000 });
  const group = page.locator('.issue-groups .ant-collapse-item').first();
  await expect(group).toBeVisible({ timeout: 10000 });
  await group.locator('.ant-collapse-header').click();
  await expect(group.locator('.related-finding').first()).toBeVisible();
});
test('overview visualizes issue composition and offers cautious investigation priorities', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('img', {name:'Finding distribution by severity'})).toBeVisible();
  await expect(page.getByRole('img', {name:'Finding distribution by scanner overlap'})).toBeVisible();
  await expect(page.getByRole('heading', {name:'Investigation priorities'})).toBeVisible();
  await expect(page.getByText('Heuristic guidance')).toBeVisible();
  const action = page.getByRole('button', {name:'Investigate cluster'}).first();
  await expect(action).toBeVisible();
  await action.click();
  await expect(page.getByText('Group by rule', {exact:true})).toBeVisible();
  await expect(page.getByText(/^Directory:/)).toBeVisible();
});

test('scanner failures remain separate from findings and navigation works on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#tab=scanners');
  await expect(page.getByText('Scanner execution and evidence')).toBeVisible();
  await page.getByLabel('Execution status').click();
  await expect(page.locator('.ant-select-dropdown:visible')).not.toHaveClass(/(?:enter|appear)-active/);
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:'NOT AVAILABLE'}).click();
  const rows = page.locator('.ant-table-tbody > tr.ant-table-row');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toContainText('Unavailable');
  await expect(page.getByText('Atheris', { exact: true })).toBeVisible();
  await expect(page.getByText('Schemathesis', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Target revision')).toBeVisible();
});

test('untrusted messages render as text', async ({ page }) => {
  await page.route('**/findings.json', async route => {
    const response = await route.fetch(); const rows = await response.json();
    rows[0].message = '<img src=x onerror="window.injected=true">';
    await route.fulfill({ status: response.status(), headers: response.headers(), json: rows });
  });
  await page.goto('/'); await page.getByRole('tab', { name: /^Issues/ }).click();
  await page.getByLabel('Search issues').fill('window.injected');
  await expect(page.locator('.issue-link').first()).toContainText('<img');
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  await page.unrouteAll({ behavior: 'wait' });
});

test('Ant Design filters, pagination and responsive layout remain usable', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Browse issues', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });
  await page.getByRole('tab', { name: /^Issues/ }).click();
  const first = await page.locator('.issue-link').first().textContent();
  await page.getByTitle('Next Page').click();
  await expect(page.locator('.issue-link').first()).not.toHaveText(first!);
  await page.getByLabel('Severity', { exact: true }).click();
  await page.getByTitle('HIGH', { exact: true }).click();
  await expect(page.locator('.ant-table-tbody > tr.ant-table-row').first()).toContainText('HIGH');
  await page.screenshot({ path: testInfo.outputPath('issues.png'), fullPage: true });
  await page.locator('.issue-link').first().click();
  await expect(page.getByRole('heading', { name: 'Supporting observations' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('detail.png') });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Browse issues', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  await page.getByLabel('Target revision').click();
  await expect(page.getByRole('listbox')).toBeAttached();
  await page.keyboard.press('Escape');
});


test('overview drilldown, scanner filters and provenance use retained evidence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Directories with most findings' })).toBeVisible({timeout:30000});
  const directory = page.locator('.directory-row .ant-btn').first();
  const path = await directory.innerText();
  await directory.click();
  await expect(page.getByText(`Directory: ${path}`, {exact:true})).toBeVisible();
  await expect(page.locator('.ant-table-tbody > tr.ant-table-row').first()).toContainText(path);
  await page.getByRole('tab', {name:'Scanners',exact:true}).click();
  await page.getByLabel('Execution status').click();
  await expect(page.locator('.ant-select-dropdown:visible')).not.toHaveClass(/(?:enter|appear)-active/);
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:'NOT AVAILABLE'}).click();
  const rows=page.locator('.ant-table-tbody > tr.ant-table-row');
  await expect(rows.first()).toContainText('Unavailable');
  for (const row of await rows.all()) await expect(row).toContainText('Unavailable');
  await page.getByRole('tab', {name:'Readiness',exact:true}).click();
  await page.getByRole('tab', {name:'Provenance',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Analysis identity'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Producing workflows'})).toBeVisible();
  await expect(page.locator('.panel').filter({hasText:'Producing workflows'}).getByRole('link').first()).toHaveAttribute('href', /github.com.*actions\/runs\/\d+/);
});

test('mobile issue evidence opens accessibly and closes with Escape', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('tab',{name:/^Issues/}).click();
  await page.locator('.issue-link').first().click();
  await expect(page.getByRole('dialog',{name:'Issue detail'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Supporting observations'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Issue detail'})).not.toBeVisible();
});


test('theme persists and direct analysis accepts an exact commit', async ({page}) => {
  await page.route('**/index.json', async route => { const data = JSON.parse(readFileSync('public/data/index.json','utf8')); data.analysis_default_branch = 'Testing'; await route.fulfill({json:data}); });
  await page.goto('/');
  await page.getByText('Light', {exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Run analysis'});
  await dialog.getByRole('radio',{name:'Commit SHA'}).click();
  await dialog.getByLabel('Full commit SHA').fill('a'.repeat(40));
  await expect(dialog.getByLabel('Full commit SHA')).toHaveValue('a'.repeat(40));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Refresh results',exact:true}).click();
  await expect(page.getByText(/Reports checked:/)).toBeVisible();
});


test('authenticated developer selects live source and directly starts analysis', async ({page, context}) => {
  const source = 'ARYDESTROYER/Kavach-AgenticSOC';
  const execution = 'combustrrr/code-analysis-dashboard';
  const project = '1267340546';
  const sha = 'b'.repeat(40);
  let submitted: any;
  await page.route('**/index.json', async route => {
    const data = JSON.parse(readFileSync('public/data/index.json','utf8'));
    Object.assign(data, {launch_endpoint:'https://launcher.example', analysis_repository:execution});
    await route.fulfill({json:data});
  });
  await context.route('https://launcher.example/**', async route => {
    const url = new URL(route.request().url());
    const headers = {'Access-Control-Allow-Origin':'http://127.0.0.1:4178', 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204, headers});
    if (url.pathname === '/auth/login') return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
    if (url.pathname === '/api/auth/redeem') return route.fulfill({headers,json:{token:'opaque-session',login:'developer'}});
    if (url.pathname === '/api/session') return route.fulfill({headers,json:{login:'developer'}});
    if (url.pathname === '/api/projects') return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:execution},can_launch:true,can_configure:false,projects:[{id:project,source_repository:source,source_repository_id:1267340546,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
    expect(route.request().headers().authorization).toBe('Bearer opaque-session');
    if (url.pathname === '/api/project-targets') return route.fulfill({headers,json:{repository:source,branches:[{name:'Testing',sha}],prs:[]}});
    if (url.pathname === '/api/project-readiness') return route.fulfill({headers,json:{tooling_sha:'a'.repeat(40),channels:[{channel:'codeql',status:'configured',reason:''}]}});
    if (url.pathname === '/api/project-launch') { submitted=route.request().postDataJSON(); return route.fulfill({status:202,headers,json:{request_id:'request-42',run_id:42}}); }
    if (url.pathname === '/api/project-activity') return route.fulfill({headers,json:{phase:'scanning',source_sha:sha,message:'Scanner jobs are running.'}});
    throw new Error(url.pathname);
  });
  await page.goto('/#'+new URLSearchParams({repository:execution,project,tab:'overview'}).toString());
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Run analysis'});
  await expect(dialog.getByText(execution)).toBeVisible();
  await dialog.getByRole('button',{name:'Sign in with GitHub'}).click();
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  const revision=dialog.getByLabel('Revision');
  await revision.click();
  await revision.press('ArrowDown');
  await revision.press('Enter');
  await expect(dialog.getByRole('button',{name:'Run analysis',exact:true})).toBeEnabled();
  await dialog.getByRole('button',{name:'Run analysis',exact:true}).click();
  await expect(page.getByText('Analysis is running against the selected revision.')).toBeVisible();
  expect(submitted).toEqual({project_id:project,kind:'branch',ref:'Testing'});
  await expect(page.getByRole('link',{name:'Request workflow #42'})).toHaveAttribute('href',`https://github.com/${execution}/actions/runs/42`);
  await expect(page.getByText(/Resolved source commit:/)).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('opaque-session');
});

test('commit launch resumes after sign-in and old output is not mistaken for new results', async ({page, context}) => {
  const data = JSON.parse(readFileSync('public/data/index.json','utf8'));
  const execution = 'combustrrr/code-analysis-dashboard';
  const source = 'combustrrr/Agentic-Kibana';
  const project = '1278177697';
  const sha = 'c'.repeat(40);
  let phase='queued';
  let submitted: unknown;
  Object.assign(data, {launch_endpoint:'https://launcher.example', analysis_repository:execution});
  await page.route('**/index.json', route => route.fulfill({json:data}));
  await context.route('https://launcher.example/**', async route => {
    const url = new URL(route.request().url());
    const headers = {'Access-Control-Allow-Origin':'http://127.0.0.1:4178', 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204,headers});
    if (url.pathname === '/auth/login') return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
    if (url.pathname === '/api/auth/redeem') return route.fulfill({headers,json:{token:'test-session',login:'developer'}});
    if (url.pathname === '/api/session') return route.fulfill({headers,json:{login:'developer'}});
    if (url.pathname === '/api/projects') return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:execution},can_launch:true,can_configure:false,projects:[{id:project,source_repository:source,source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
    if (url.pathname === '/api/project-targets') return route.fulfill({headers,json:{repository:source,branches:[{name:'Testing',sha}],prs:[]}});
    if (url.pathname === '/api/project-readiness') return route.fulfill({headers,json:{tooling_sha:'a'.repeat(40),channels:[]}});
    if (url.pathname === '/api/project-launch') { submitted=route.request().postDataJSON(); return route.fulfill({headers,status:202,json:{request_id:'commit-request',run_id:42}}); }
    if (url.pathname === '/api/project-activity') return route.fulfill({headers,json:{phase,source_sha:sha,message:`Analysis ${phase}.`}});
    throw new Error(url.pathname);
  });
  await page.goto('/#'+new URLSearchParams({repository:execution,project,tab:'overview'}).toString());
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Run analysis'});
  await dialog.getByRole('button',{name:'Sign in with GitHub'}).click();
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  await dialog.getByRole('radio',{name:'Commit SHA'}).click();
  await dialog.getByLabel('Full commit SHA').fill(sha.toUpperCase());
  await expect(dialog.getByLabel('Full commit SHA')).toHaveValue(sha.toUpperCase());
  await dialog.getByRole('button',{name:'Run analysis',exact:true}).click();
  expect(submitted).toEqual({project_id:project,kind:'commit',ref:sha});
  await expect(page.getByText('Analysis queued — the previous report is still being shown.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'combustrrr/Agentic-Kibana'})).toBeVisible();
  phase='scanning';
  await page.getByRole('button',{name:'Check status now'}).click();
  await expect(page.getByText('Analysis is running against the selected revision.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'combustrrr/Agentic-Kibana'})).toBeVisible();
});

test('commit validation prevents an invalid project launch', async ({page,context}) => {
  const execution='combustrrr/code-analysis-dashboard';const source='ARYDESTROYER/Kavach-AgenticSOC';const project='1267340546';
  await page.route('**/index.json', async route => {
    const data=JSON.parse(readFileSync('public/data/index.json','utf8'));
    data.launch_endpoint='https://launcher.example';
    await route.fulfill({json:data});
  });
  await context.route('https://launcher.example/**', async route => {
    const url=new URL(route.request().url());
    const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
    if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'valid-session',login:'developer'}});
    if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
    if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:execution},can_launch:true,can_configure:false,projects:[{id:project,source_repository:source,source_repository_id:1267340546,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
    if(url.pathname==='/api/project-targets')return route.fulfill({headers,json:{repository:'ARYDESTROYER/Kavach-AgenticSOC',branches:[{name:'Testing',sha:'b'.repeat(40)}],prs:[]}});
    if(url.pathname==='/api/project-readiness')return route.fulfill({headers,json:{tooling_sha:'a'.repeat(40),channels:[]}});
    throw new Error(url.pathname);
  });
  await page.goto('/#'+new URLSearchParams({repository:execution,project,tab:'overview'}));
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Run analysis'});
  await dialog.getByRole('button',{name:'Sign in with GitHub'}).click();
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  await dialog.getByRole('radio',{name:'Commit SHA'}).click();
  await dialog.getByLabel('Full commit SHA').fill('abc');
  await expect(dialog.getByRole('button',{name:'Run analysis',exact:true})).toBeDisabled();
  await dialog.getByLabel('Full commit SHA').fill('a'.repeat(40));
  await expect(dialog.getByRole('button',{name:'Run analysis',exact:true})).toBeEnabled();
});

test('connections verify live configuration without claiming scanner completion', async ({page,context}, testInfo) => {
  const data = JSON.parse(readFileSync('public/data/index.json','utf8'));
  const source = 'combustrrr/Agentic-Kibana';
  const execution = 'combustrrr/code-analysis-dashboard';
  Object.assign(data,{source_repository:source,analysis_repository:execution,launch_endpoint:'https://launcher.example',publishing_repository:execution});
  await page.route('**/index.json',route=>route.fulfill({json:data}));
  let ready = true;
  await context.route('https://launcher.example/**',async route=>{
    const url = new URL(route.request().url());
    const headers = {'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
    if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers});
    if(url.pathname==='/auth/login') return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
    if(url.pathname==='/api/auth/redeem') return route.fulfill({headers,json:{token:'connection-session',login:'developer'}});
    if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
    if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:execution},can_launch:true,can_configure:false,projects:[{id:'1278177697',source_repository:source,source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
    expect(url.searchParams.get('repository')).toBe(null);expect(url.searchParams.get('project_id')).toBe('1278177697');
    if(url.pathname==='/api/project-readiness')return route.fulfill({headers,json:{channels:[{channel:'ruff',status:'configured',reason:'Profile supports this channel.'},{channel:'coverage',status:'deferred',reason:'Deferred by the project owner.'},{channel:'semgrep',status:'setup_required',reason:'No reviewed adapter is configured.'}],checked_at:new Date().toISOString()}});
    expect(url.pathname).toBe('/api/project-integration');
    return route.fulfill({headers,json:{source_repository:source,analysis_repository:execution,publishing_repository:execution,workflow_branch:'main',workflow_state:ready?'active':'disabled_manually',configuration_matches:true,ready,enabled_scanners:['ruff','coverage'],checked_at:new Date().toISOString()}});
  });
  await page.goto('/#'+new URLSearchParams({tab:'connections',repository:execution,project:'1278177697'}));
  await expect(page.getByRole('heading',{name:'Application connections'})).toBeVisible();
  await expect(page.getByText('Launch configuration verified')).not.toBeVisible();
  await page.getByRole('button',{name:'Sign in to verify connections'}).click();
  await page.getByRole('button',{name:'Verify connections'}).click();
  await expect(page.getByText('Launch configuration verified')).toBeVisible();
  await expect(page.getByText('This verifies routing and workflow availability. Scanner results determine which channels actually completed.')).toBeVisible();
  const channelReadiness=page.getByRole('region',{name:'Scanner channel readiness'});
  await expect(channelReadiness).toContainText('configured');
  await expect(channelReadiness).toContainText('deferred');
  await expect(channelReadiness).toContainText('setup required');
  await expect(channelReadiness).toContainText('No reviewed adapter is configured.');
  ready=false;
  await page.getByRole('button',{name:'Verify connections'}).click();
  await expect(page.getByText('Configuration needs attention')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:testInfo.outputPath('connections-mobile.png'),fullPage:true});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('banner').getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByText('Configuration needs attention')).not.toBeVisible();
});

test('project run tracking survives the launch dialog and separates the old report',async({page,context})=>{
 const execution='combustrrr/code-analysis-dashboard';const source='combustrrr/Agentic-Kibana';const project='1278177697';
 let polls=0;
 await page.route('**/index.json',async route=>{const data=JSON.parse(readFileSync('public/data/index.json','utf8'));data.launch_endpoint='https://launcher.example';await route.fulfill({json:data});});
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
  if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'opaque-session',login:'developer'}});
  if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
   if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:execution}}});
   if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:execution},can_launch:true,can_configure:false,projects:[{id:project,source_repository:source,source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]} });
   if(url.pathname==='/api/project-targets')return route.fulfill({headers,json:{repository:source,project_id:project,branches:[{name:'Testing',sha:'a'.repeat(40)}],prs:[]} });
  if(url.pathname==='/api/project-readiness')return route.fulfill({headers,json:{tooling_sha:'b'.repeat(40),channels:[{channel:'bandit',status:'configured',reason:'Native evidence required'}]}});
  if(url.pathname==='/api/project-launch')return route.fulfill({headers,json:{request_id:'11111111-1111-1111-1111-111111111111',run_id:10}});
    if(url.pathname==='/api/project-activity'){polls++;return route.fulfill({headers,json:{phase:polls===1?'scanning':'published',target_id:'selected-target',source_sha:'a'.repeat(40),producer:{url:`https://github.com/${execution}/actions/runs/11/attempts/2`,attempt:2,status:polls===1?'in_progress':'completed'},...(polls>1?{completeness:'partial'}:{})}});}
  throw new Error(url.pathname);
 });
  await page.goto(`/#repository=${encodeURIComponent(execution)}&project=${project}`);
 await expect(page.getByText('ANALYZED COMMIT')).toBeVisible();
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  await page.getByRole('button',{name:'Sign in with GitHub',exact:true}).click();
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
 await page.getByLabel('Revision',{exact:true}).click();await page.getByLabel('Revision',{exact:true}).press('ArrowDown');await page.getByLabel('Revision',{exact:true}).press('Enter');
 await expect(page.getByRole('button',{name:'Continue',exact:true})).toHaveCount(0);
 await page.getByRole('dialog').getByRole('button',{name:'Run analysis',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByText('Analysis is running against the selected revision.',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Scanner workflow attempt 2'})).toHaveAttribute('href',`https://github.com/${execution}/actions/runs/11/attempts/2`);
 await expect(page.getByText(/It will remain visible until this request publishes\./)).toBeVisible();
 await page.getByRole('button',{name:'Check status now'}).click();
 await expect(page.getByText('New report published for this request.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Open published report'})).toBeVisible();
 expect(polls).toBeGreaterThanOrEqual(2);
 await page.getByRole('button',{name:'Open published report'}).click();
 await expect(page).toHaveURL(/target=selected-target/);
});


test('issue filters compose, clear and remain usable on mobile',async({page})=>{
 await page.goto('/#tab=issues');
 const rows=page.locator('.ant-table-tbody > tr.ant-table-row');
 await expect(rows.first()).toBeVisible();
 await page.getByLabel('Rule',{exact:true}).click();
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option').nth(1).click();
 await expect(rows.first()).toBeVisible();
 await page.getByLabel('Search issues').fill('no-such-issue-unique-123');
 await expect(page.getByText('No findings match these filters.')).toBeVisible();
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await expect(rows.first()).toBeVisible();
 await page.getByLabel('Source location',{exact:true}).click();
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:'File and line available'}).click();
 await expect(rows.first()).toBeVisible();
 await page.getByLabel('Scanner overlap',{exact:true}).click();
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:'Single scanner'}).click();
 await expect(rows.first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test.skip('legacy arbitrary-repository setup is intentionally unsupported',async({page,context})=>{
 const data=JSON.parse(readFileSync('public/data/index.json','utf8'));data.launch_endpoint='https://launcher.example';
 await page.route('**/index.json',r=>r.fulfill({json:data}));
  let fail=true;let selectedFolders:unknown;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
   if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'test-session',login:'developer'}});
   if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
   if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{installation_url:'https://github.com/apps/test/installations/new'}});
   if(url.pathname==='/api/repositories')return route.fulfill({headers,status:fail?503:200,json:fail?{error:'GitHub temporarily unavailable'}:{repositories:[{id:1,full_name:'owner/service',can_configure:true}],has_more:false}});
   if(url.pathname==='/api/projects')return route.fulfill({headers,json:{projects:[]}});
    if(url.pathname==='/api/connections/preview'){
     const body=route.request().postDataJSON() as {analysis_folders?:{python:string|null;javascript:string|null}};
     if(body.analysis_folders)selectedFolders=body.analysis_folders;
     const profile={mode:'portable',...(body.analysis_folders?.python?{python_root:body.analysis_folders.python}:{python_root:'.'}),...(body.analysis_folders?.javascript?{javascript_root:body.analysis_folders.javascript}:{})};
     return route.fulfill({headers,json:{confirmation:'opaque',files:{'config.json':JSON.stringify(profile)},project:{relationship:'observer',source_repository:{full_name:'owner/source'},profile},detection:{notice:'Review scanner setup',detected_manifests:[],language_roots:{python:['.','backend'],javascript:['.','client']}}}});
    }
  throw Error('Unexpected request '+url.pathname);
 });
 await page.goto('/#tab=repositories');
 await page.getByRole('button',{name:'Sign in with GitHub',exact:true}).click();
 await page.getByRole('button',{name:'Load repositories',exact:true}).click();
 await expect(page.getByText('Error: GitHub temporarily unavailable',{exact:true})).toBeVisible();
  fail=false;await page.getByRole('button',{name:'Load repositories',exact:true}).click();
  await page.getByLabel('Execution repository',{exact:true}).click();
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({hasText:'owner/service'}).click();
   await page.getByText('Optional setup · map analysis folders',{exact:true}).click();
   await page.getByRole('button',{name:'Detect source folders',exact:true}).click();
   await page.getByLabel('Python analysis folder',{exact:true}).fill('backend');
   await page.getByLabel('Python analysis folder',{exact:true}).press('Enter');
   await expect(page.getByText('Python: backend',{exact:true})).toBeVisible();
   await page.getByLabel('JavaScript analysis folder',{exact:true}).fill('client');
   await page.getByLabel('JavaScript analysis folder',{exact:true}).press('Enter');
   await expect(page.getByText('JavaScript: client',{exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Review selected analysis folders',exact:true}).click();
   expect(selectedFolders).toEqual({python:'backend',javascript:'client'});
  await expect(page.getByRole('button',{name:'Confirm installation commit'})).toBeVisible();
 await page.getByLabel('Source repository',{exact:true}).fill('owner/another');
 await expect(page.getByRole('button',{name:'Confirm installation commit'})).not.toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Detect source folders',exact:true})).toBeDisabled();
});
test('unsafe source URLs are omitted from report links', async ({ page }) => {
  const findings = JSON.parse(readFileSync('public/data/reports/retained/findings.json', 'utf8'));
  const target = findings.find((finding: { file: string }) => finding.file === 'backend/app/middleware/security_headers.py');
  if (!target) throw new Error('Expected retained unsafe-URL fixture finding is missing');
  await page.route(`**/details/${target.page}.json`, async route => {
    const response = await route.fetch(); const rows = await response.json();
    const detail = rows.find((row: { id: string }) => row.id === target.id);
    if (!detail) throw new Error(`Expected detail ${target.id} is missing from page ${target.page}`);
    detail.source_url = 'javascript:alert(document.domain)';
    await route.fulfill({ status: response.status(), headers: response.headers(), json: rows });
  });
  await page.goto('/');
  await page.getByRole('tab', { name: /^Issues/ }).click();
  await page.getByLabel('Search issues').fill(target.file);
  await page.locator('.issue-link').first().click();
  await expect(page.getByRole('link', { name: 'Open exact source revision' })).toHaveCount(0);
  await page.unrouteAll({ behavior: 'wait' });
});

});
