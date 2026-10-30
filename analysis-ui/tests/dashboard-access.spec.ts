import {test,expect} from '@playwright/test';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
test('public welcome page explains the evidence workflow at desktop and mobile widths',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 await context.route('https://launcher.example/api/public/config',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.goto('/');
 const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
 expect(csp).toContain("script-src 'self'");expect(csp).toContain("script-src-attr 'none'");expect(csp).toContain('connect-src \'self\' https://launcher.example');
 expect(await page.evaluate(()=>getComputedStyle(document.body).margin)).toBe('0px');
 expect(await page.locator('.dossier-live').evaluate(element=>getComputedStyle(element).borderTopWidth)).toBe('0px');
 expect(await page.locator('.dossier-live i').evaluate(element=>getComputedStyle(element).boxShadow)).toBe('none');
 await expect.poll(()=>page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name).some(name=>name.includes('WorkspaceApp')))).toBe(false);
 await expect.poll(()=>page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name).some(name=>name.includes('ProjectsApp')))).toBe(false);
 await expect(page.getByRole('link',{name:'Trust Lab and Mphasis code analysis workspace'})).toBeVisible();
 await expect(page.locator('.landing-nav')).not.toContainText('Code Analysis');
 await expect(page.locator('.landing-nav')).not.toContainText('Evidence workspace');
 await expect(page.getByRole('heading',{name:'Trace every finding to the exact code analyzed.'})).toBeVisible();
 await expect(page.locator('.landing-copy > p').first()).toBeVisible();
 const rootLanding=await page.evaluate(()=>{const wrap=document.querySelector('.landing-wrap')!.getBoundingClientRect();const hero=getComputedStyle(document.querySelector('.landing-hero')!);return{left:Math.round(wrap.left),width:Math.round(wrap.width),columns:hero.gridTemplateColumns};});
 await page.goto('/#/projects/1267340546');
 await expect(page.getByRole('heading',{name:'Trace every finding to the exact code analyzed.'})).toBeVisible();
 const deepLinkLanding=await page.evaluate(()=>{const wrap=document.querySelector('.landing-wrap')!.getBoundingClientRect();const hero=getComputedStyle(document.querySelector('.landing-hero')!);return{left:Math.round(wrap.left),width:Math.round(wrap.width),columns:hero.gridTemplateColumns};});
 expect(deepLinkLanding).toEqual(rootLanding);
 await page.getByText('Light',{exact:true}).click();
 await expect(page.locator('.landing-copy > p').first()).toBeVisible();
 await expect(page.locator('.landing-proof')).toContainText('Independent');
 await expect(page.getByText(/Access is limited to approved GitHub collaborators/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Sign in with GitHub'})).toHaveCount(2);
 await expect(page.locator('.landing-actions').getByRole('button',{name:'Sign in with GitHub'})).toBeEnabled();
 await page.setViewportSize({width:1536,height:720});
 const compactDossier=await page.locator('.analysis-dossier').boundingBox();
 expect(compactDossier).not.toBeNull();
 expect(compactDossier!.y+compactDossier!.height).toBeLessThanOrEqual(720);
 await expect(page.locator('.dossier-row')).toHaveCount(3);
 const firstName=page.locator('.dossier-project strong').first();
 await firstName.evaluate(element=>{element.textContent='A very long configured repository name that deliberately exceeds sixty characters for clamping';});
 expect(await firstName.evaluate(element=>getComputedStyle(element).webkitLineClamp)).toBe('2');
 for(const evidence of await page.locator('.dossier-coverage').all()){
  expect(await evidence.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
 }
 await page.setViewportSize({width:1254,height:790});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1254);
 const dossierBox=await page.locator('.analysis-dossier').boundingBox();
 expect(dossierBox).not.toBeNull();expect(dossierBox!.x).toBeGreaterThanOrEqual(0);expect(dossierBox!.x+dossierBox!.width).toBeLessThanOrEqual(1254);
 expect(await page.locator('.landing-hero').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
 expect(dossierBox!.y+dossierBox!.height).toBeLessThanOrEqual(790);
 const navActionBox=await page.locator('.landing-nav-cta').boundingBox();
 expect(navActionBox).not.toBeNull();expect(navActionBox!.x+navActionBox!.width).toBeLessThanOrEqual(1254);
 await page.getByRole('link',{name:/how evidence is produced/i}).click();
 await expect(page).toHaveURL(/#method$/);
 await expect(page.getByRole('heading',{name:/A result is useful only when you can verify how it was produced/})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await expect(page.getByRole('link',{name:'Trust Lab and Mphasis code analysis workspace'})).toBeVisible();
});

test('public landing remains accessible and visually stable across target viewports',async({page})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 test.setTimeout(90_000);
 await page.emulateMedia({reducedMotion:'reduce'});
 const viewports=[
  {name:'desktop-dark',width:1920,height:1080,theme:'Dark'},
  {name:'desktop-light',width:1536,height:720,theme:'Light'},
  {name:'laptop-dark',width:1366,height:768,theme:'Dark'},
  {name:'tablet-dark',width:768,height:1024,theme:'Dark'},
  {name:'mobile-dark',width:390,height:844,theme:'Dark'},
 ];
 for(const viewport of viewports){
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  await page.goto('/');
  await page.evaluate(theme=>{localStorage.setItem('analysis-theme',theme.toLowerCase());location.reload();},viewport.theme);
  await page.waitForLoadState('networkidle');
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  await expect(page).toHaveScreenshot(`landing-${viewport.name}.png`,{fullPage:true,animations:'disabled',maxDiffPixelRatio:.002});
 }
 await page.setViewportSize({width:1536,height:720});
 await page.goto('/');
 await page.evaluate(()=>{localStorage.setItem('analysis-theme','dark');location.reload();});
 await page.waitForLoadState('networkidle');
 const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
 expect(accessibility.violations).toEqual([]);
});

test('public landing controls respond within the interaction budget',async({page})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 await page.goto('/');
 const themeDuration=await page.evaluate(()=>{
  const button=document.querySelector<HTMLButtonElement>('[data-theme-value="light"]')!;
  const started=performance.now();button.click();return performance.now()-started;
 });
 expect(themeDuration).toBeLessThanOrEqual(100);
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 const action=await page.evaluate(()=>{
  const button=document.querySelector<HTMLButtonElement>('.landing-actions [data-sign-in]')!;
  const started=performance.now();button.click();return{duration:performance.now()-started,disabled:button.disabled};
 });
 expect(action.duration).toBeLessThanOrEqual(100);
 expect(action.disabled).toBe(true);
});

test('GitHub sign-in presents one stable confirmation state',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type'};
 let sessionStarted=0,projectsStarted=0,projectsRequests=0;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
  if(url.pathname==='/api/auth/redeem'){
   await new Promise(resolve=>setTimeout(resolve,350));
   return route.fulfill({headers,json:{token:'staged-session',login:'developer'}});
  }
  if(url.pathname==='/api/session'){
   sessionStarted=Date.now();
   await new Promise(resolve=>setTimeout(resolve,800));
   return route.fulfill({headers,json:{login:'developer'}});
  }
  if(url.pathname==='/api/projects'){projectsStarted=Date.now();projectsRequests++;await new Promise(resolve=>setTimeout(resolve,800));return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[]}});}
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/#/projects');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await expect(page.locator('.auth-transition-panel')).toContainText('Confirming GitHub access');
 await expect(page.locator('.auth-transition-panel')).toContainText('opaque, short-lived application session');
 await expect(page.locator('.auth-transition-steps li')).toHaveCount(3);
 await expect(page.locator('.auth-transition-steps .is-active')).toContainText('Verify access');
 await expect(page.locator('.landing-hero')).toHaveCount(0);
 await expect(page.locator('.auth-transition-panel')).toBeVisible();
 const transitionBox=await page.locator('.auth-transition-panel').boundingBox();
 expect(transitionBox).not.toBeNull();expect(transitionBox!.height).toBeLessThan(400);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
 await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible();
 expect(Math.abs(sessionStarted-projectsStarted)).toBeLessThan(100);expect(projectsRequests).toBe(1);
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
  if(['/api/logout','/api/auth/logout'].includes(u.pathname))return route.fulfill({headers,json:{ok:true}});
    if(u.pathname==='/api/session')return route.fulfill({headers,status:allowed?200:403,json:allowed?{login:'combustrrr'}:{error:'Account not authorized',code:'viewer_not_authorized'}});
  if(u.pathname==='/api/projects')return route.fulfill({headers,status:allowed?200:403,json:allowed?registry:{error:'Account not authorized',code:'viewer_not_authorized'}});
  if(u.pathname==='/api/public/manifest'){reports++;return route.fulfill({headers,json:{schema_version:'analysis-current-v1',analysis_repository:execution,project_id:'1278177697',targets:[]}});}
  throw new Error(`Unexpected request ${u.pathname}`);
 });
  await page.goto('/#/projects');
 await expect(page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/})).toBeVisible();expect(reports).toBe(0);
 await expect(page.getByRole('link',{name:/Run analysis/})).toHaveCount(0);
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await expect(page.getByRole('link',{name:/Run analysis/})).toBeVisible();expect(reports).toBe(0);
  await expect.poll(()=>page.evaluate(()=>performance.getEntriesByType('resource').map(entry=>entry.name).some(name=>name.includes('WorkspaceApp')))).toBe(false);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('link',{name:/Run analysis/})).toHaveCount(0);
  allowed=false;await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();await expect(page.getByText(/needs collaborator access from the repository owner/)).toBeVisible();await expect(page.getByRole('link',{name:/Run analysis/})).toHaveCount(0);
 });

test('cancellation and exchange failures stay on the public shell',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type, Idempotency-Key','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
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
  await page.goto('/#/projects');
  await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
  await expect(page.getByText(/needs collaborator access from the repository owner/)).toBeVisible();
  await expect(page.getByRole('heading',{name:'Projects'})).toHaveCount(0);
  await page.getByRole('button',{name:'Start sign-in again'}).click();
  await expect(page.getByText('GitHub sign-in was cancelled. Retry when you are ready.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Projects'})).toHaveCount(0);
  await page.getByRole('button',{name:'Start sign-in again'}).click();
 await expect(page.getByText('GitHub sign-in was interrupted. Start sign-in again.')).toBeVisible();
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
  if(['/api/logout','/api/auth/logout'].includes(url.pathname))return route.fulfill({headers,json:{ok:true}});
  if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
  if(url.pathname==='/api/projects')return route.fulfill({headers,status:revoked?403:200,json:revoked?{code:'viewer_not_authorized'}:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[]}});
    reportRequests++;
    return route.fulfill({headers,status:200,json:{targets:[],projects:[]}});
   });
   await page.goto('/#/projects');
  revoked=true;
   await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
   await expect(page.getByText(/needs collaborator access from the repository owner/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Start sign-in again'})).toBeVisible();
  expect(reportRequests).toBe(0);
 });

test('a protected report denial is confirmed before revoking a valid dashboard session',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let sessionChecks=0;
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true,require_report_login:true}});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
  if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'stable-session',login:'developer'}});
  if(url.pathname==='/api/session'){sessionChecks++;return route.fulfill({headers,json:{login:'developer'}});}
  if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false,current_report:{status:'complete',analyzed_sha:'a'.repeat(40),generated_at:'2026-10-26T00:00:00Z',scanner_summary:{completed:1,total:1,incomplete:0}}}]}});
  if(url.pathname==='/api/public/manifest')return route.fulfill({headers,status:403,json:{code:'viewer_not_authorized',error:'This report request could not confirm viewer access.'}});
  if(['/api/logout','/api/auth/logout'].includes(url.pathname))return route.fulfill({headers,json:{ok:true}});
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/#/projects');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await page.getByRole('button',{name:'Review evidence'}).click();
 await expect(page.getByText('Report needs attention')).toBeVisible();
 await expect(page.locator('.shell-user')).toContainText('developer');
 await expect(page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/})).toHaveCount(0);
 await expect.poll(()=>sessionChecks).toBeGreaterThanOrEqual(2);
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
  if(['/api/logout','/api/auth/logout'].includes(url.pathname))return route.fulfill({headers,json:{ok:true}});
  if(url.pathname==='/api/session')return route.fulfill({headers,json:{login:'developer'}});
  if(url.pathname==='/api/projects')return route.fulfill({headers,status:503,json:{code:'target_registry_invalid',error:'The configured target registry does not match the approved project identities.'}});
  writes++;
  throw new Error(`Unexpected write or endpoint ${url.pathname}`);
 });
 await page.goto('/#/projects');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await expect(page.getByRole('alert')).toContainText('configured target registry');
 await expect(page.getByText('No configured projects are available.')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Fast analysis/})).toHaveCount(0);
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
  if(['/api/logout','/api/auth/logout'].includes(url.pathname))return route.fulfill({headers,json:{ok:true}});
   if(url.pathname==='/api/session'){
    sessionChecks++;
    return route.fulfill({headers,status:sessionChecks===1?200:403,json:sessionChecks===1?{login:'developer'}:{code:'viewer_not_authorized'}});
   }
   if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false,current_report:{status:'partial'}}]}});
   if(url.pathname==='/api/public/manifest')return route.fulfill({headers,json:{schema_version:'analysis-current-v1',analysis_repository:'combustrrr/code-analysis-dashboard',project_id:'1278177697',preferred_branch:'Testing',targets:[]}});
  throw new Error(`Unexpected request ${url.pathname}`);
 });
  await page.goto('/#/projects');
   await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
    await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible();
   await page.getByRole('button',{name:'Review evidence'}).click();
   await expect(page.getByLabel('Selected analysis revision')).toBeVisible();
   await expect(page.getByText('No report available yet. Run analysis to publish the first report.')).toBeVisible();
   await expect(page.locator('.analysis-entry .ant-btn-disabled')).toHaveText('Run analysis');
   expect(sessionChecks).toBe(1);
  await page.clock.fastForward(5*60_000+1);
  await expect(page.getByText(/needs collaborator access from the repository owner/)).toBeVisible();
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
    if(url.pathname==='/api/projects')return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false,current_report:{status:'partial'}}]}});
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/#/projects');
 await expect(page.getByRole('heading',{name:'Trace every finding to the exact code analyzed.'})).toBeVisible();
 await expect(page.getByText(/Access is limited to approved GitHub collaborators/)).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByText('Light',{exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
   await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible();
   await expect(page.getByRole('button',{name:'Review evidence'})).toBeVisible();
 await expect(page.locator('.shell-user')).toContainText('developer');
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.locator('.shell-header').getByRole('link',{name:'Settings'}).click();
 await page.locator('.settings-control-card').getByText('Dark',{exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.setViewportSize({width:390,height:844});
 const mobileLayout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,overflowing:[...document.querySelectorAll('body *')].map(element=>({element:element.tagName+'.'+(element as HTMLElement).className?.toString().replaceAll(' ',' .'),right:Math.round(element.getBoundingClientRect().right)})).filter(item=>item.right>innerWidth+1).slice(0,8)}));
 expect(mobileLayout.scrollWidth,JSON.stringify(mobileLayout.overflowing)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('link',{name:'Trust Lab and Mphasis code analysis workspace'})).toBeVisible();
  const projectRegister=page.locator('.shell-header').getByRole('link',{name:'Project register'});
  await expect(projectRegister).toBeVisible();
  await expect(page.locator('.shell-header')).not.toContainText('Evidence workspace');
  await projectRegister.click();
  await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible();
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
  await page.goto('/#/projects');
  await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
  await sessionCheckStarted;
  await page.evaluate(()=>{location.hash='';});
  releaseSessionCheck();
   await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible({timeout:10000});
  await expect(page).toHaveURL(/#\/projects$/);
 });

test('authorization restores a validated configured-project route',async({page,context})=>{
  test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
  const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  const requestOrder:string[]=[];
  await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
  if(url.pathname==='/api/auth/redeem')return route.fulfill({headers,json:{token:'route-session',login:'developer'}});
   if(url.pathname==='/api/session'){requestOrder.push('session');return route.fulfill({headers,json:{login:'developer'}});}
    if(url.pathname==='/api/projects'){
     requestOrder.push('projects');
     return route.fulfill({headers,json:{execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]}});
    }
    if(url.pathname==='/api/public/manifest'){
     requestOrder.push('manifest');
     return route.fulfill({headers,json:{schema_version:'analysis-current-v1',analysis_repository:'combustrrr/code-analysis-dashboard',project_id:'1278177697',checked_at:new Date().toISOString(),preferred_branch:'Testing',targets:[]}});
    }
  throw new Error(`Unexpected request ${url.pathname}`);
 });
 await page.goto('/#/projects/1278177697');
  await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
  await expect(page).toHaveURL(/#\/projects\/1278177697$/);
  expect(requestOrder).toContain('session');
  expect(requestOrder).toContain('projects');
  expect(requestOrder).not.toContain('manifest');
 await page.evaluate(()=>{location.hash='';});
 await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible();
 await expect(page).toHaveURL(/#\/projects$/);
 });

test('a stale project URL falls back to the current project register after sign-in',async({page,context})=>{
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
 await page.goto('/#/projects/1278177697/issues');
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'ARYDESTROYER/Kavach-AgenticSOC'})).toBeVisible();
 expect(new URL(page.url()).hash).toBe('#/projects');
 expect(reportRequests).toBe(0);
});

test('reload restores a tab session while a fresh tab requires GitHub sign-in',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 let sessionChecks=0,bootstrapChecks=0;const handle='m'.repeat(43),registry={execution_repository:{id:1360051890,full_name:'combustrrr/code-analysis-dashboard'},can_launch:false,can_configure:false,projects:[{id:'1278177697',source_repository:'combustrrr/Agentic-Kibana',source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false}]};
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true,require_report_login:true}});
  if(url.pathname==='/auth/login')return route.fulfill({status:302,headers:{Location:`http://127.0.0.1:4178/#analysis_auth=${'e'.repeat(43)}`}});
  if(url.pathname==='/api/auth/redeem'){
   const body=route.request().postDataJSON();expect(body.code).toBe('e'.repeat(43));expect(body.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
   return route.fulfill({headers,json:{token:handle,login:'developer'}});
  }
  expect(route.request().headers().authorization).toBe(`Bearer ${handle}`);
  if(url.pathname==='/api/bootstrap'){bootstrapChecks++;return route.fulfill({headers,json:{schema_version:'auth-bootstrap-v1',session:{handle,login:'developer',user_id:73,role:'read',capabilities:{read:true,write:false,admin:false},verified_at:new Date().toISOString()},registry}});}
  if(url.pathname==='/api/session'){sessionChecks++;return route.fulfill({headers,json:{login:'developer'}});}
   if(url.pathname==='/api/projects')return route.fulfill({headers,json:registry});
  throw new Error(`Unexpected request ${url.pathname}`);
 });
  await page.goto('/#/projects');
  await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
   await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible();
 await expect(page).toHaveURL(/#\/projects$/);
 expect(page.url()).not.toContain('analysis_auth');
 expect(await page.evaluate(()=>sessionStorage.getItem('analysis-auth-session'))).toBe(handle);
 expect(await page.evaluate(()=>sessionStorage.getItem('analysis-auth-pending'))).toBeNull();
 await page.reload();
 await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible();
 expect(sessionChecks).toBe(1);expect(bootstrapChecks).toBe(1);
 const anotherTab=await context.newPage();
 await anotherTab.goto('/#/projects');
 await expect(anotherTab.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/})).toBeVisible();
 expect(sessionChecks).toBe(1);expect(bootstrapChecks).toBe(1);
});

test('GitHub rate-limit and permission ambiguity retain the tab session for retry',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const handle='r'.repeat(43),headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 await context.addInitScript(value=>sessionStorage.setItem('analysis-auth-session',value),handle);
 await context.route('https://launcher.example/**',async route=>{const url=new URL(route.request().url());if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true}});if(url.pathname==='/api/bootstrap')return route.fulfill({status:429,headers:{...headers,'Retry-After':'60'},json:{error:{code:'github_rate_limited',message:'GitHub is temporarily limiting collaborator verification.',recoverable:true,action:'RETRY',retry_after_seconds:60},code:'github_rate_limited'} });throw new Error(`Unexpected request ${url.pathname}`);});
 await page.goto('/#/projects');
 await expect(page.getByText('GitHub is temporarily limiting access checks. Retry shortly.')).toBeVisible();
 expect(await page.evaluate(()=>sessionStorage.getItem('analysis-auth-session'))).toBe(handle);
 await expect(page.getByRole('button',{name:'Retry access check'})).toBeVisible();
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
      {id:'1267340546',source_repository:'ARYDESTROYER/Kavach-AgenticSOC',source_repository_id:1267340546,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false,lifecycle:'Needs attention',readiness_summary:{profile_mode:'agentic-soc',configured_channels:26,selectable_channels:24,vendor_channels:3,deferred_channels:9,unavailable_channels:2},current_report:{status:'partial'}},
     {id:'1278177697',source_repository:source,source_repository_id:1278177697,relationship:'observer',preferred_branch:'Testing',native_feedback_enabled:false,lifecycle:'Preparing',current_report:{status:'partial'}},
     {id:'1360051890',source_repository:execution,source_repository_id:1360051890,relationship:'connected',preferred_branch:'main',native_feedback_enabled:false,lifecycle:'Needs attention',attention_reason:'The current report contains no scanner results. Run analysis to publish scanner evidence.',readiness_summary:{profile_mode:'portable',configured_channels:24,selectable_channels:24,vendor_channels:2,deferred_channels:0,unavailable_channels:0},current_report:{status:'complete',generated_at:'2026-10-10T00:00:00Z',scanner_summary:{completed:0,total:0,incomplete:0}}},
    ]}});
   if(url.pathname==='/api/public/manifest')return route.fulfill({headers,json:{schema_version:'analysis-current-v1',analysis_repository:execution,project_id:project,checked_at:new Date().toISOString(),preferred_branch:'Testing',current_overlay:{schema_version:'analysis-pr-overlay-v1',overlay_key:'overlay-seven',status:'complete',head_sha:sha,checked_at:overlay.checked_at,pr_context:overlay.pr_context,channel:overlay.channel,documents:{'pr-overlay.json':overlayAssetName},assets:{[overlayAssetName]:{sha256:createHash('sha256').update(compressedOverlay).digest('hex'),bytes:compressedOverlay.byteLength}}},targets:published?[{id:'published-target',label:'Testing',repository:source,source_repository:source,head_sha:sha,kind:'branch',branch:'Testing',checked_at:new Date().toISOString(),status:'partial',collected_run:43,documents:{'report.json':assetName,'findings.json':assetName},assets}]:[]}});
   if(url.pathname==='/api/public/asset')return route.fulfill({headers,body:url.searchParams.get('overlay')==='current'?compressedOverlay:compressedReport});
  if(url.pathname==='/api/project-targets')return route.fulfill({headers,json:{repository:source,branches:[{name:'Testing',sha}],prs:[]}});
   const channels=[{id:'semgrep',channel:'semgrep',mode:'configured',group:'semgrep',status:'profile_declared',reason:'',default_selected:true,selectable:true,last_observed:{status:'completed',complete:true,reason:null,findings:3,checked_at:new Date().toISOString()}},{id:'snyk',channel:'snyk',mode:'vendor',group:'snyk',status:'profile_declared',reason:'May use vendor quota.',default_selected:false,selectable:true,last_observed:{status:'configured_complete',complete:true,reason:null,findings:0,checked_at:new Date().toISOString()}}];
   if(url.pathname==='/api/project-readiness')return route.fulfill({headers,json:{profile_mode:'agentic-soc',tooling_sha:'e'.repeat(40),summary:{selectable:2,vendor:1,deferred:0,unavailable:0,completed:2,needs_attention:0},channels,checked_at:new Date().toISOString()}});
   if(url.pathname==='/api/project-preview')return route.fulfill({headers,json:{preview_id:'preview-access',preview_token:'signed-preview',previewed_at:new Date().toISOString(),project_id:project,source_repository:source,source_repository_id:1278177697,selection:{kind:'branch',ref:'Testing'},target_sha:sha,pr_context:null,tooling_sha:'e'.repeat(40),profile_digest:'f'.repeat(64),channels,cached_channels:[]}});
    if(url.pathname==='/api/project-launch-fast'){
    launches++;
      expect(route.request().postDataJSON()).toEqual({projectId:project,strategy:'LAST_USED_OR_PREFERRED'});
      expect(route.request().headers()['idempotency-key']).toMatch(/^[a-f0-9-]{36}$/);
    return route.fulfill({headers,status:202,json:{status:'preparing',lifecycle:'Preparing',request_id:'flow-request',run_id:42,source_repository:source,target_sha:sha,preferred_branch:'Testing',selection:{kind:'branch',ref:'Testing'},selection_source:'preferred_branch',requested_channels:['semgrep']}});
  }
  if(url.pathname==='/api/project-activity'){
   activityReads++;const isPublished=activityReads>1;published=isPublished;
   return route.fulfill({headers,json:{phase:isPublished?'published':'scanning',queue_position:isPublished?null:2,target_id:isPublished?'published-target':undefined,source_sha:sha,analyzed_sha:isPublished?sha:undefined,completeness:isPublished?'partial':undefined,producer:{url:`https://github.com/${execution}/actions/runs/43/attempts/2`,attempt:2,status:isPublished?'completed':'in_progress'}}});
  }
  throw new Error(`Unexpected request ${url.pathname}`);
  });
   const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
   await page.goto('/');
   await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
   await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible();
    await expect(page.locator('.project-record')).toHaveCount(3);
    const cardGeometry=await page.locator('.project-record').evaluateAll(cards=>cards.map(card=>{const title=card.querySelector('h2')!.getBoundingClientRect(),state=card.querySelector('.project-state')!.getBoundingClientRect();return{height:card.getBoundingClientRect().height,overlap:!(title.right<=state.left||title.left>=state.right||title.bottom<=state.top||title.top>=state.bottom),overflow:card.scrollWidth>card.clientWidth};}));
    expect(cardGeometry.every(card=>!card.overlap&&!card.overflow&&card.height<680)).toBe(true);
    await expect(page.locator('.project-record').filter({hasText:'ARYDESTROYER/Kavach-AgenticSOC'})).toContainText('Not available');
    await expect(page.getByText('Read-only source')).toHaveCount(2);
    await expect(page.getByText('Connected project')).toHaveCount(1);
    const connected=page.locator('.project-record').filter({hasText:execution});
    await expect(connected).toContainText('Needs attention');
    await expect(connected).toContainText('Not reported');
    await expect(connected).toContainText('Evidence unavailable');
    await expect(connected).not.toContainText('All reported channels are complete');
    await page.getByRole('link',{name:'Settings'}).click();
    await page.locator('.settings-rail a[href*="section=projects"]').click();
    await expect(page.locator('.settings-project-row').filter({hasText:'ARYDESTROYER/Kavach-AgenticSOC'})).toContainText('24 available');
    await expect(page.locator('.settings-project-list')).not.toContainText('0 of 0');
    await page.locator('.settings-rail a[href*="section=provenance"]').click();
    await expect(page.locator('.provenance-boundary')).toContainText('Needs attention');
    await expect(page.locator('.provenance-boundary')).not.toContainText('partial');
    await page.locator('.shell-header').getByRole('link',{name:'Project register'}).click();
    await page.locator('.project-record').filter({hasText:source}).getByRole('button',{name:'Review evidence'}).click();
     await expect(page).toHaveURL(new RegExp(`#/projects/${project}`));
    await expect(page.getByRole('heading',{name:'Separate PR review overlay · #7'})).toBeVisible();
   await expect(page.getByText('Review fixture advisory')).toBeVisible();
  await expect(page.getByRole('link',{name:'Run analysis'})).toBeVisible();
  await page.getByRole('link',{name:'Run analysis'}).click();
  await page.getByRole('button',{name:/Configure analysis/}).click();
  await page.getByLabel('Full commit SHA').fill(sha);
  await page.getByRole('button',{name:'Choose scanner channels'}).click();
  await page.getByRole('button',{name:'Select all available scanners'}).click();
  await expect(page.getByText('External scanners included')).toBeVisible();
  await expect(page.getByRole('button',{name:'Review exact revision'})).toBeDisabled();
  await page.getByText(/Include snyk/).click();
  await expect(page.getByRole('button',{name:'Review exact revision'})).toBeEnabled();
  await page.keyboard.press('Escape');
   expect(new URL(page.url()).hash).toContain(`#/projects/${project}`);
  expect(new URL(page.url()).hash).not.toContain(source);
  expect(launches).toBe(0);
  await page.getByRole('link',{name:'Run analysis'}).click();
  await page.getByRole('button',{name:/Fast analysis/}).click();
  await page.getByRole('button',{name:'Analyze with all scanners'}).click();
 await expect(page.locator('.ant-alert-title').getByText('Analyzing',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Building the first reviewable report'})).toBeVisible();
 await expect(page.getByText('This project has no reviewable report yet.')).toBeVisible();
 await expect(page.locator('.analysis-entry')).toHaveCount(0);
 await expect(page.locator('.revision-ribbon')).toHaveCount(0);
 await expect(page.locator('.project-navigation')).toHaveCount(0);
 await expect(page.getByText('No report available yet. Run analysis to publish the first report.')).toHaveCount(0);
 await page.locator('.project-run-tracker').getByText('Technical details').click();
 await expect(page.locator('.project-run-tracker')).toContainText(sha.slice(0,12));
 await expect(page.locator('.project-run-tracker').getByRole('link',{name:'Open GitHub Actions'})).toHaveAttribute('href',`https://github.com/${execution}/actions/runs/43/attempts/2`);
 await page.locator('.project-run-tracker').getByRole('button',{name:'Refresh'}).click();
 await expect(page.locator('.project-run-tracker').locator('.ant-alert-title')).toHaveText('Ready');
 await expect(page.locator('.project-run-tracker')).toContainText('Results are ready');
 await expect(page).toHaveURL(/\/report\?target=published-target/);
 await expect(page.getByLabel('Selected analysis revision')).toContainText(sha.slice(0,12));
 await page.getByRole('tab',{name:'Overview'}).click();
 const [gridBox,priorityBox]=await Promise.all([page.locator('.insights-grid').boundingBox(),page.locator('.priority-panel').boundingBox()]);
 expect(gridBox).not.toBeNull();expect(priorityBox).not.toBeNull();expect(priorityBox!.width).toBeGreaterThan(gridBox!.width*.9);
   expect(activityReads).toBeGreaterThanOrEqual(2);expect(launches).toBe(1);expect(pageErrors).toEqual([]);
});
