import {afterEach,describe,expect,it,vi} from 'vitest';

afterEach(()=>{
 vi.unstubAllEnvs();
 vi.unstubAllGlobals();
 vi.resetModules();
});

describe('repository report loading',()=>{
 it('coalesces concurrent manifest reads for one project',async()=>{
  vi.stubEnv('VITE_LAUNCH_ENDPOINT','https://launcher.example');
  vi.stubGlobal('location',new URL('https://dashboard.example/#/projects/1267340546?target=current%3A1267340546'));
  const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{void input;void init;return Response.json({targets:[],preferred_branch:'main'});});
  vi.stubGlobal('fetch',fetchMock);
  const reports=await import('./repositoryReports');
  reports.setReportSession('session-handle');

  const [first,second]=await Promise.all([
   reports.repositoryJson<{preferred_branch:string}>('data/index.json'),
   reports.repositoryJson<{preferred_branch:string}>('data/index.json'),
  ]);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toContain('/api/public/manifest?');
  expect(first.preferred_branch).toBe('main');
  expect(second.preferred_branch).toBe('main');
 });

 it('does not turn an unrelated report failure into a global sign-out',async()=>{
  vi.stubEnv('VITE_LAUNCH_ENDPOINT','https://launcher.example');
  vi.stubGlobal('location',new URL('https://dashboard.example/#/projects/1267340546'));
  const browserEvents=new EventTarget();
  const denied=vi.fn();browserEvents.addEventListener('analysis-access-denied',denied);
  vi.stubGlobal('window',browserEvents);
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({code:'report_access_forbidden',error:'Report unavailable'},{status:403})));
  const reports=await import('./repositoryReports');reports.setReportSession('session-handle');
  await reports.reportFetch('https://launcher.example/api/public/manifest');
  expect(denied).not.toHaveBeenCalled();
 });

 it('emits sign-out only for an explicit session denial',async()=>{
  vi.stubEnv('VITE_LAUNCH_ENDPOINT','https://launcher.example');
  vi.stubGlobal('location',new URL('https://dashboard.example/#/projects/1267340546'));
  const browserEvents=new EventTarget();
  const denied=vi.fn();browserEvents.addEventListener('analysis-access-denied',denied);
  vi.stubGlobal('window',browserEvents);
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({code:'session_invalid'},{status:401})));
  const reports=await import('./repositoryReports');reports.setReportSession('session-handle');
  await reports.reportFetch('https://launcher.example/api/public/manifest');
  expect(denied).toHaveBeenCalledTimes(1);
 });
});
