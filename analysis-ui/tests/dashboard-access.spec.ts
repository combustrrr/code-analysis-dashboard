import {test,expect} from '@playwright/test';
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
  if(u.pathname==='/auth/login')return route.fulfill({contentType:'text/html',body:`<script>window.opener.postMessage({type:'analysis-auth',nonce:'${u.searchParams.get('nonce')}',token:'opaque-session',login:'combustrrr'},'http://127.0.0.1:4178');window.close();</script>`});
  expect(route.request().headers().authorization).toBe('Bearer opaque-session');
  if(u.pathname==='/api/session')return route.fulfill({headers,status:allowed?200:403,json:allowed?{login:'combustrrr'}:{error:'Account not authorized'}});
  reports++;return route.fulfill({headers,json:u.pathname.endsWith('projects')?{projects:[]}:{schema_version:'analysis-current-v1',analysis_repository:'owner/repo',project_id:'1',targets:[]}});
 });
 await page.goto('/#repository=owner%2Frepo&project=1');
 await expect(page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/})).toBeVisible();expect(reports).toBe(0);
 await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toHaveCount(0);
 await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();
 await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toBeVisible();await expect.poll(()=>reports).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toHaveCount(0);
 allowed=false;await page.locator('.landing-actions').getByRole('button',{name:/Sign in with GitHub/}).click();await expect(page.getByText('Error: Account not authorized')).toBeVisible();await expect(page.getByRole('button',{name:'Run analysis',exact:true})).toHaveCount(0);
});

test('repository deep links open the authenticated workspace with a shared theme',async({page,context})=>{
 test.skip(!process.env.TEST_DASHBOARD_ACCESS,'Requires access-test build');
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4178','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
 await context.route('https://launcher.example/**',async route=>{
  const url=new URL(route.request().url());
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/api/public/config')return route.fulfill({headers,json:{require_login:true,installation_url:null}});
  if(url.pathname==='/auth/login')return route.fulfill({contentType:'text/html',body:`<script>window.opener.postMessage({type:'analysis-auth',nonce:'${url.searchParams.get('nonce')}',token:'workspace-session',login:'developer'},'http://127.0.0.1:4178');window.close();</script>`});
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
 await expect(page.getByRole('heading',{name:'Connect a repository'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Load repositories'})).toBeVisible();
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
 await expect(page.getByRole('heading',{name:'Connect a repository'})).toBeVisible();
});
