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
 const execution='combustrrr/code-analysis-dashboard';
 const registry={execution_repository:{id:1360051890,full_name:execution},can_launch:true,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]};
 await context.route('https://launcher.example/**',async route=>{
  const u=new URL(route.request().url());const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(u.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
    if(u.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
    if(u.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'opaque-session',login:'combustrrr'}});
  expect(route.request().headers().authorization).toBe('Bearer opaque-session');
    if(u.pathname==='/api/session')return route.fulfill({headers,status:allowed?200:403,json:allowed?{login:'combustrrr'}:{error:'Account not authorized',code:'viewer_not_authorized'}});
  if(u.pathname==='/api/projects')return route.fulfill({headers,json:registry});
  if(u.pathname==='/api/public/manifest'){reports++;return route.fulfill({headers,json:{schema_version:'analysis-current-v1',analysis_repository:execution,project_id:'1278177697',targets:[]}});}
  throw new Error(`Unexpected request ${u.pathname}`);
 });
  await page.goto(`/#repository=${encodeURIComponent(execution)}&project=1278177697`);
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
    const callback=attempts===1?'#analysis_auth_error=not_authorized':attempts===2?'#analysis_auth_error=cancelled':`#analysis_auth=${'e'.repeat(43)}`;
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
  await expect(page.getByText(/Ask a dashboard maintainer to invite your account/)).toBeVisible();
  await expect(page.getByRole('heading',{name:'Choose a codebase'})).toHaveCount(0);
  await signIn.click();
  await expect(page.getByText('GitHub sign-in was cancelled. Retry when you are ready.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Choose a codebase'})).toHaveCount(0);
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
  if(url.pathname==='/api/projects')return route.fulfill({headers,status:revoked?403:200,json:revoked?{code:'viewer_not_authorized'}:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[]}});
    reportRequests++;
    return route.fulfill({headers,status:200,json:{targets:[],projects:[]}});
   });
   await page.goto('/#tab=repositories');
  revoked=true;
   await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
   await expect(page.getByText('Access expired or was revoked. Sign in with an authorized GitHub account.')).toBeVisible();
  await expect(page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/})).toBeVisible();
  expect(reportRequests).toBe(0);
 });

test('a mismatched target registry is shown as an error, not an empty project list',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let writes=0;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`} });
  if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'registry-error-session',login:'developer'}});
  if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
  if(url.pathname==='/api/projects')return route.fulfill({headers,status:503,json:{code:'target_registry_invalid',error:'The configured target registry does not match the approved project identities.'}});
  writes++;
  throw new Error(`Unexpected write or endpoint ${url.pathname}`);
 });
 await page.goto('/#tab=repositories');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await expect(page.getByRole('heading',{name:'Choose a codebase'})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('Project registry unavailable');
 await expect(page.getByText('No configured projects are available.')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toHaveCount(0);
 expect(writes).toBe(0);
});

test('visible tabs recheck collaborator access and clear the session when revoked',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 await page.clock.install();
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let sessionChecks=0;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
  if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'visible-tab-session',login:'developer'}});
   if(url.pathname==='/api/session'){
    sessionChecks++;
    return route.fulfill({headers,status:sessionChecks===1?200:403,json:sessionChecks===1?{login:'developer'}:{code:'viewer_not_authorized'}});
   }
   if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
   if(url.pathname==='/api/public/manifest')return route.fulfill({headers,json:{schema_version:'analysis-current-v1',analysis_repository:'combustrrr/code-analysis-dashboard',project_id:'1278177697',preferred_branch:'Testing',targets:[]}});
  throw new Error(`Unexpected request ${url.pathname}`);
 });
  await page.goto('/#tab=repositories');
   await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
    await expect(page.getByRole('heading',{name:'Choose a codebase'})).toBeVisible();
   await page.getByRole('button',{name:'Open report'}).click();
   await expect(page.getByRole('heading',{name:'Code quality dashboard'})).toBeVisible();
   await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toHaveCount(0);
   expect(sessionChecks).toBe(1);
  await page.clock.fastForward(15_000);
  await expect(page.getByText(/Ask a dashboard maintainer to invite your account/)).toBeVisible();
  await expect(page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/})).toBeVisible();
  expect(sessionChecks).toBe(2);
});

test('repository deep links open the authenticated workspace with a shared theme',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
   if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
   if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'workspace-session',login:'developer'}});
  expect(route.request().headers().authorization).toBe('Bearer workspace-session');
  if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
    if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/#tab=repositories');
 await expect(page.getByRole('heading',{name:'Know what your code is carrying.'})).toBeVisible();
 await expect(page.getByText(/Sign in with an approved GitHub account to open the repository workspace/)).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByText('Light',{exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
   await expect(page.getByRole('heading',{name:'Choose a codebase'})).toBeVisible();
   await expect(page.getByRole('button',{name:'Open report'})).toBeVisible();
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
   await expect(page.getByRole('heading',{name:'Choose a codebase'})).toBeVisible();
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
   if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true,execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'}}});
   if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
   if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'workspace-intent',login:'developer'}});
  expect(route.request().headers().authorization).toBe('Bearer workspace-intent');
  if(url.pathname==='/api/session') { notifySessionCheck();await sessionGate;return route.fulfill({headers,json:{login:'developer'}}); }
   if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
   throw new Error(`Unexpected request ${url.pathname}`);
  });
  await page.goto('/#tab=repositories');
  await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
  await sessionCheckStarted;
  await page.evaluate(()=>{location.hash='';});
  releaseSessionCheck();
   await expect(page.getByRole('heading',{name:'Choose a codebase'})).toBeVisible({timeout:10000});
  await expect(page).toHaveURL(/#tab=repositories$/);
 });

test('authorization restores the exact requested repository route',async({page,context})=>{
  test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
  const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
   const destination='#repository=combustrrr%2Fcode-analysis-dashboard&project=1278177697&target=target-1&tab=issues&issue=F-1';
  const requestOrder:string[]=[];
  let projectsVerified=false;
  await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
  if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'route-session',login:'developer'}});
   if(url.pathname==='/api/session'){requestOrder.push('session');return route.fulfill({headers,json:{login:'developer'}});}
    if(url.pathname==='/api/projects'){
     requestOrder.push('projects');projectsVerified=true;
     return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
    }
    if(url.pathname==='/api/public/manifest'){
     expect(projectsVerified).toBe(true);requestOrder.push('manifest');
     return route.fulfill({headers,json:{schema_version:'analysis-current-v1',analysis_repository:'combustrrr/code-analysis-dashboard',project_id:'1278177697',checked_at:new Date().toISOString(),preferred_branch:'Testing',targets:[]}});
    }
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/'+destination);
  await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
  await expect(page.getByRole('heading',{name:'Code quality dashboard'})).toBeVisible();
  await expect.poll(()=>new URL(page.url()).hash).toBe(destination);
  expect(requestOrder.indexOf('session')).toBeLessThan(requestOrder.indexOf('projects'));
  expect(requestOrder.indexOf('projects')).toBeLessThan(requestOrder.indexOf('manifest'));
 });

test('a removed requested project is not restored or fetched after sign-in',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let reportRequests=0;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true,require_report_login:true}});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`} });
  if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'stale-project-session',login:'developer'}});
  if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
  if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1267340546',source_repository:'ARYDESTROYER/Kavach-AgenticSOC',source_repository_id:1267340546,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
  if(url.pathname==='/api/public/manifest'){reportRequests++;return route.fulfill({headers,json:{targets:[]}});}
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/#repository=combustrrr%2Fcode-analysis-dashboard&project=1278177697&tab=issues');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await expect(page.getByText(/The requested project is no longer configured/)).toBeVisible();
 expect(new URL(page.url()).hash).toBe('');
 expect(reportRequests).toBe(0);
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
   if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
  throw new Error(`Unexpected request ${url.pathname}`);
 });
  await page.goto('/#tab=repositories');
  await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
   await expect(page.getByRole('heading',{name:'Choose a codebase'})).toBeVisible();
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
 const execution='combustrrr/code-analysis-dashboard';const source='combustrrr/Agentic-Kibana';const project='1278177697';const sha='d'.repeat(40);
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  const report={analyzed_sha:sha,generated_at:new Date().toISOString(),status:'partial',finding_count:0,observation_count:0,channels:[],severities:{},producer_runs:[],publication_gate:{satisfied:false}};
  const assetName='published-report.json.gz';const compressedReport=gzipSync(Buffer.from(JSON.stringify({'report.json':report,'findings.json':[]})));
  const assets={[assetName]:{sha256:createHash('sha256').update(compressedReport).digest('hex'),bytes:compressedReport.byteLength}};
  const overlayAssetName='published-overlay.json.gz';const overlay={schema_version:'analysis-pr-overlay-v1',overlay_key:'overlay-seven',head_sha:sha,checked_at:new Date().toISOString(),pr_context:{number:7,title:'PR overlay test',head_repository:'fork/Agentic-Kibana',head_branch:'topic',base_repository:source,base_branch:'Testing',base_sha:'e'.repeat(40)},channel:{status:'COMPLETED_OPTIONAL'},advisories:[{stable_id:'advisory-1',severity:'MEDIUM',message:'Review fixture advisory'}]};
  const compressedOverlay=gzipSync(Buffer.from(JSON.stringify({'pr-overlay.json':overlay})));
  let activityReads=0;let launches=0;let published=false;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
   if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
   if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'flow-session',login:'developer'}});
  expect(route.request().headers().authorization).toBe('Bearer flow-session');
  if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
    if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:execution},can_launch:true,can_configure:false,projects:[
     {id:'1267340546',source_repository:'ARYDESTROYER/Kavach-AgenticSOC',source_repository_id:1267340546,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false},
     {id:'1278177697',source_repository:source,source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false},
     {id:'1360051890',source_repository:execution,source_repository_id:1360051890,relationship:'connected',preferred_branch:'main',native_feedback_enabled:true},
    ]}});
   if(url.pathname==='/api/public/manifest')return route.fulfill({headers,json:{schema_version:'analysis-current-v1',analysis_repository:execution,project_id:project,checked_at:new Date().toISOString(),preferred_branch:'Testing',current_overlay:{schema_version:'analysis-pr-overlay-v1',overlay_key:'overlay-seven',status:'complete',head_sha:sha,checked_at:overlay.checked_at,pr_context:overlay.pr_context,channel:overlay.channel,documents:{'pr-overlay.json':overlayAssetName},assets:{[overlayAssetName]:{sha256:createHash('sha256').update(compressedOverlay).digest('hex'),bytes:compressedOverlay.byteLength}}},targets:published?[{id:'published-target',label:'Testing',repository:source,source_repository:source,head_sha:sha,kind:'branch',branch:'Testing',checked_at:new Date().toISOString(),status:'partial',collected_run:43,documents:{'report.json':assetName,'findings.json':assetName},assets}]:[]}});
   if(url.pathname==='/api/public/asset')return route.fulfill({headers,body:url.searchParams.get('overlay')==='current'?compressedOverlay:compressedReport});
  if(url.pathname==='/api/project-targets')return route.fulfill({headers,json:{repository:source,branches:[{name:'Testing',sha}],prs:[]}});
   const channels=[{id:'semgrep',channel:'semgrep',mode:'portable',group:'semgrep',status:'configured',reason:'',default_selected:true,selectable:true}];
   if(url.pathname==='/api/project-readiness')return route.fulfill({headers,json:{tooling_sha:'e'.repeat(40),channels}});
   if(url.pathname==='/api/project-preview')return route.fulfill({headers,json:{preview_id:'preview-access',preview_token:'signed-preview',previewed_at:new Date().toISOString(),project_id:project,source_repository:source,source_repository_id:1278177697,selection:{kind:'branch',ref:'Testing'},target_sha:sha,pr_context:null,tooling_sha:'e'.repeat(40),profile_digest:'f'.repeat(64),channels,cached_channels:[]}});
   if(url.pathname==='/api/project-launch'){
    launches++;
     expect(route.request().postDataJSON()).toMatchObject({project_id:project,preview_token:'signed-preview',requested_channels:['semgrep'],run_again:false});
     expect(route.request().postDataJSON().idempotency_key).toMatch(/^[a-f0-9-]{36}$/);
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
   await expect(page.getByRole('heading',{name:'Choose a codebase'})).toBeVisible();
   await expect(page.locator('.target-card')).toHaveCount(3);
   await expect(page.getByText('OBSERVER · READ-ONLY SOURCE')).toHaveCount(2);
   await expect(page.getByText('CONNECTED · SELF-ANALYSIS')).toHaveCount(1);
   await page.locator('.target-card').filter({hasText:source}).getByRole('button',{name:'Open report'}).click();
   await expect(page.getByRole('heading',{name:'Separate PR review overlay · #7'})).toBeVisible();
   await expect(page.getByText('Review fixture advisory')).toBeVisible();
  await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toBeVisible();
  const selected=new URLSearchParams(new URL(page.url()).hash.slice(1));
  expect(selected.get('repository')).toBe(execution);
  expect(selected.get('project')).toBe(project);
  expect(new URL(page.url()).hash).not.toContain(source);
  expect(launches).toBe(0);
  await page.getByRole('button',{name:'Run analysis',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Choose revision and scanners'});
   await dialog.getByRole('radio',{name:'Branch'}).click();
    await dialog.getByRole('combobox',{name:'Revision'}).click();
   await dialog.getByRole('combobox',{name:'Revision'}).press('ArrowDown');
   await dialog.getByRole('combobox',{name:'Revision'}).press('Enter');
  await dialog.getByRole('button',{name:'Review exact revision'}).click();
  await page.getByRole('dialog',{name:'Review analysis request'}).getByRole('button',{name:'Confirm and queue analysis'}).click();
 await expect(page.getByText('Analysis is running against the selected revision.')).toBeVisible();
 await expect(page.getByText(`Resolved source commit: ${sha}`)).toBeVisible();
 await page.getByRole('button',{name:'Check status now'}).click();
 await expect(page.getByText('New report published for this request.')).toBeVisible();
 await expect(page.getByText(/Published report completeness: partial/)).toBeVisible();
 await expect(page.getByRole('link',{name:'Scanner workflow attempt 2'})).toHaveAttribute('href',`https://github.com/${execution}/actions/runs/43/attempts/2`);
 await page.getByRole('button',{name:'Open published report'}).click();
 await expect(page).toHaveURL(/target=published-target/);
 await expect(page.locator('.identity')).toContainText(sha);
  expect(activityReads).toBeGreaterThanOrEqual(2);expect(launches).toBe(1);
});
