import {test,expect} from '@playwright/test';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
test('public welcome page explains the evidence workflow at desktop and mobile widths',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 await context.route('https://launcher.example/api/public/config',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Know what your code is carrying.'})).toBeVisible();
 await expect(page.locator('.landing-copy > div.ant-typography')).toHaveCSS('color','rgb(162, 190, 182)');
 await page.getByText('Light',{exact:true}).click();
 await expect(page.locator('.landing-copy > div.ant-typography')).toHaveCSS('color','rgb(77, 102, 106)');
 await expect(page.getByText('ILLUSTRATIVE · NOT LIVE DATA')).toBeVisible();
 await expect(page.getByText(/First time here\? Sign in with GitHub—no separate app account is needed/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Sign in with GitHub'})).toHaveCount(2);
 await page.getByRole('link',{name:'See how it works'}).click();
 await expect(page).toHaveURL(/#workflow$/);
 await expect(page.getByRole('heading',{name:'A clear path from code to context.'})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('view access requires login and clears on logout',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 let reports=0;let allowed=true;
 await context.route('https://launcher.example/**',async route=>{
  const u=new URL(route.request().url());const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(u.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
   if(u.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
   if(u.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'opaque-session',login:'combustrrr'}});
  expect(route.request().headers().authorization).toBe('Bearer opaque-session');
   if(u.pathname==='/api/session')return route.fulfill({headers,status:allowed?200:403,json:allowed?{login:'combustrrr'}:{error:'Account not authorized',code:'viewer_not_authorized'}});
  reports++;return route.fulfill({headers,json:u.pathname.endsWith('projects')?{projects:[]}:{schema_version:'analysis-current-v1',analysis_repository:'owner/repo',project_id:'1',targets:[]}});
 });
 await page.goto('/#repository=owner%2Frepo&project=1');
 await expect(page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/})).toBeVisible();expect(reports).toBe(0);
 await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toHaveCount(0);
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toBeVisible();await expect.poll(()=>reports).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toHaveCount(0);
  allowed=false;await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();await expect(page.getByText(/Ask a dashboard maintainer to invite your account/)).toBeVisible();await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toHaveCount(0);
 });

test('cancellation and exchange failures stay on the public shell',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let attempts=0;let sessionChecks=0;let reportRequests=0;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true,require_report_login:true}});
  if(url.pathname==='/auth/login'){
   attempts++;
   const callback=attempts===1?'#analysis_auth_error=cancelled':`#analysis_auth=${'e'.repeat(43)}`;
   return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/${callback}`}});
  }
  if(url.pathname==='/api/auth/redeem')return route.fulfill({status:503,headers,json:{error:'private store diagnostic',code:'exchange_store_unavailable'}});
  if(url.pathname==='/api/session'){sessionChecks++;return route.fulfill({headers,json:{login:'developer'}});}
  reportRequests++;
  return route.fulfill({status:200,headers,json:{targets:[],projects:[]}});
 });
 await page.goto('/#tab=repositories');
 const signIn=page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/});
 await signIn.click();
 await expect(page.getByText('GitHub sign-in was cancelled. Retry when you are ready.')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Connect and analyze a repository'})).toHaveCount(0);
 await signIn.click();
 await expect(page.getByText('GitHub sign-in could not be completed. Check your connection and retry.')).toBeVisible();
 await expect(page.getByText('private store diagnostic')).toHaveCount(0);
 expect(sessionChecks).toBe(0);expect(reportRequests).toBe(0);
});

test('a revoked workspace API request clears the session immediately',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let revoked=false;let reportRequests=0;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true,require_report_login:true}});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`} });
  if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'revoked-session',login:'developer'}});
  expect(route.request().headers().authorization).toBe('Bearer revoked-session');
  if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
  if(url.pathname==='/api/repositories')return route.fulfill({headers,status:revoked?403:200,json:revoked?{code:'viewer_not_authorized'}:{repositories:[],has_more:false}});
  reportRequests++;
  return route.fulfill({headers,status:200,json:{targets:[],projects:[]}});
 });
 await page.goto('/#tab=repositories');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await page.getByRole('button',{name:/Load repositories|Refresh repositories/}).waitFor();
 revoked=true;
 await page.getByRole('button',{name:/Load repositories|Refresh repositories/}).click();
 await expect(page.getByText('Access expired or was revoked. Sign in with an authorized GitHub account.')).toBeVisible();
 await expect(page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/})).toBeVisible();
 expect(reportRequests).toBe(0);
});

test('repository deep links open the authenticated workspace with a shared theme',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true,installation_url:null}});
   if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
   if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'workspace-session',login:'developer'}});
  expect(route.request().headers().authorization).toBe('Bearer workspace-session');
  if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
  if(url.pathname==='/api/repositories')return route.fulfill({headers,json:{repositories:[],has_more:false}});
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/#tab=repositories');
 await expect(page.getByRole('heading',{name:'Know what your code is carrying.'})).toBeVisible();
 await expect(page.getByText(/Sign in with an approved GitHub account to open the repository workspace/)).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByText('Light',{exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
  await expect(page.getByRole('heading',{name:'Connect and analyze a repository'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Load repositories|Refresh repositories/})).toBeVisible();
 await expect(page.getByText('Signed in as developer')).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await expect.poll(()=>page.locator('.connections-panel').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(251, 252, 248)');
 await page.getByText('Dark',{exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect.poll(()=>page.locator('.connections-panel').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(24, 54, 64)');
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByText('Light',{exact:true})).toBeVisible();
 const mobileLayout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,overflowing:[...document.querySelectorAll('body *')].map(element=>({element:element.tagName+'.'+(element as HTMLElement).className?.toString().replaceAll(' ',' .'),right:Math.round(element.getBoundingClientRect().right)})).filter(item=>item.right>innerWidth+1).slice(0,8)}));
 expect(mobileLayout.scrollWidth,JSON.stringify(mobileLayout.overflowing)).toBeLessThanOrEqual(390);
 await page.getByRole('link',{name:/Code Analysis/}).click();
 await expect(page.getByRole('heading',{name:'Know what your code is carrying.'})).toBeVisible();
 await page.locator('.landing-actions').getByRole('button',{name:'Open workspace'}).click();
  await expect(page.getByRole('heading',{name:'Connect and analyze a repository'})).toBeVisible();
});

test('workspace intent survives a transient hash reset while GitHub access is checked',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let releaseSessionCheck=()=>{};let notifySessionCheck=()=>{};
 const sessionGate=new Promise<void>(resolve=>{releaseSessionCheck=resolve;});
 const sessionCheckStarted=new Promise<void>(resolve=>{notifySessionCheck=resolve;});
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
   if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
   if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'workspace-intent',login:'developer'}});
  expect(route.request().headers().authorization).toBe('Bearer workspace-intent');
  if(url.pathname==='/api/session') { notifySessionCheck();await sessionGate;return route.fulfill({headers,json:{login:'developer'}}); }
  if(url.pathname==='/api/repositories')return route.fulfill({headers,json:{repositories:[],has_more:false}});
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/#tab=repositories');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await sessionCheckStarted;
 await page.evaluate(()=>{location.hash='';});
 releaseSessionCheck();
 await expect(page.getByRole('heading',{name:'Connect and analyze a repository'})).toBeVisible({timeout:10000});
  await expect(page).toHaveURL(/#tab=repositories$/);
  });

test('reloads and new tabs require a fresh in-memory sign-in',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let sessionChecks=0;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true,require_report_login:true}});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
  if(url.pathname==='/api/auth/redeem'){
   const body=route.request().postDataJSON();expect(body.code).toBe('e'.repeat(43));expect(body.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
   return route.fulfill({headers,json:{token:'memory-only-session',login:'developer'}});
  }
  expect(route.request().headers().authorization).toBe('Bearer memory-only-session');
  if(url.pathname==='/api/session'){sessionChecks++;return route.fulfill({headers,json:{login:'developer'}});}
  if(url.pathname==='/api/repositories')return route.fulfill({headers,json:{repositories:[],has_more:false}});
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/#tab=repositories');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await expect(page.getByRole('heading',{name:'Connect and analyze a repository'})).toBeVisible();
 await expect(page).toHaveURL(/#tab=repositories$/);
 expect(page.url()).not.toContain('analysis_auth');
 expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('memory-only-session');
 expect(await page.evaluate(()=>sessionStorage.getItem('analysis-auth-verifier'))).toBeNull();
 await page.reload();
 await expect(page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/})).toBeVisible();
 expect(sessionChecks).toBe(1);
 const anotherTab=await context.newPage();
 await anotherTab.goto('/#tab=repositories');
 await expect(anotherTab.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/})).toBeVisible();
 expect(sessionChecks).toBe(1);
});

test('authorized user follows one repository project from selection through publication',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const execution='owner/execution';const source='owner/source';const project='project-7';const sha='d'.repeat(40);
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 const report={analyzed_sha:sha,generated_at:new Date().toISOString(),status:'partial',finding_count:0,observation_count:0,channels:[],severities:{},producer_runs:[],publication_gate:{satisfied:false}};
 const assetName='published-report.json.gz';const compressedReport=gzipSync(Buffer.from(JSON.stringify({'report.json':report,'findings.json':[]})));
 const assets={[assetName]:{sha256:createHash('sha256').update(compressedReport).digest('hex'),bytes:compressedReport.byteLength}};
 let projectReads=0;let activityReads=0;let launches=0;let published=false;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
   if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
   if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'flow-session',login:'developer'}});
  expect(route.request().headers().authorization).toBe('Bearer flow-session');
  if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
  if(url.pathname==='/api/repositories')return route.fulfill({headers,json:{repositories:[{id:7,full_name:execution,can_configure:true}],has_more:false}});
  if(url.pathname==='/api/projects')return route.fulfill({headers,json:{projects:[{id:project,source_repository:{full_name:source},relationship:'observer',preferred_branch:'Testing',profile:{},enabled_scanners:[],deferred_channels:{}}]}});
  if(url.pathname==='/api/public/projects'){
   projectReads++;
   if(projectReads===1)return route.fulfill({headers,status:503,json:{error:'temporarily unavailable'}});
   return route.fulfill({headers,json:{projects:[{id:project,source_repository:source}]}});
  }
  if(url.pathname==='/api/public/manifest')return route.fulfill({headers,json:{schema_version:'analysis-current-v1',analysis_repository:execution,project_id:project,checked_at:new Date().toISOString(),preferred_branch:'Testing',targets:published?[{id:'published-target',label:'Testing',repository:source,source_repository:source,head_sha:sha,kind:'branch',branch:'Testing',checked_at:new Date().toISOString(),status:'partial',collected_run:43,documents:{'report.json':assetName,'findings.json':assetName},assets}]:[]}});
  if(url.pathname==='/api/public/asset')return route.fulfill({headers,body:compressedReport});
  if(url.pathname==='/api/project-targets')return route.fulfill({headers,json:{repository:source,branches:[{name:'Testing',sha}],prs:[]}});
  if(url.pathname==='/api/project-readiness')return route.fulfill({headers,json:{tooling_sha:'e'.repeat(40),channels:[]}});
  if(url.pathname==='/api/project-launch'){
   launches++;
   expect(route.request().postDataJSON()).toEqual({repository:execution,project_id:project,kind:'branch',ref:'Testing'});
   return route.fulfill({headers,status:202,json:{request_id:'flow-request',run_id:42}});
  }
  if(url.pathname==='/api/project-activity'){
   activityReads++;const isPublished=activityReads>1;published=isPublished;
   return route.fulfill({headers,json:{phase:isPublished?'published':'scanning',target_id:isPublished?'published-target':undefined,source_sha:sha,analyzed_sha:isPublished?sha:undefined,completeness:isPublished?'partial':undefined,producer:{url:`https://github.com/${execution}/actions/runs/43/attempts/2`,attempt:2,status:isPublished?'completed':'in_progress'}}});
  }
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await expect(page.locator('.landing-actions').getByRole('button',{name:'Open workspace'})).toBeVisible();
 await page.locator('.landing-actions').getByRole('button',{name:'Open workspace'}).click();
 await page.getByLabel('Execution repository').click();
 await page.getByLabel('Execution repository').press('ArrowDown');
 await page.getByLabel('Execution repository').press('Enter');
 await expect(page.getByRole('link',{name:source})).toBeVisible();
 await page.getByRole('link',{name:source}).click();
 await expect(page.getByRole('button',{name:'Retry projects'})).toBeVisible();
 await page.getByRole('button',{name:'Retry projects'}).click();
 await expect(page.getByLabel('Source project')).toBeEnabled();
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Run analysis'});
  await dialog.getByLabel('Revision').click();
  await dialog.getByLabel('Revision').press('ArrowDown');
  await dialog.getByLabel('Revision').press('Enter');
 await dialog.getByRole('button',{name:'Run analysis',exact:true}).click();
 await expect(page.getByText('Analysis is running against the selected revision.')).toBeVisible();
 await expect(page.getByText(`Resolved source commit: ${sha}`)).toBeVisible();
 await page.getByRole('button',{name:'Check status now'}).click();
 await expect(page.getByText('New report published for this request.')).toBeVisible();
 await expect(page.getByText(/Published report completeness: partial/)).toBeVisible();
 await expect(page.getByRole('link',{name:'Scanner workflow attempt 2'})).toHaveAttribute('href',`https://github.com/${execution}/actions/runs/43/attempts/2`);
 await page.getByRole('button',{name:'Open published report'}).click();
 await expect(page).toHaveURL(/target=published-target/);
 await expect(page.locator('.identity')).toContainText(sha);
 expect(projectReads).toBe(2);expect(activityReads).toBeGreaterThanOrEqual(2);expect(launches).toBe(1);
});
