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
  const fetchMock=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>Response.json({targets:[],preferred_branch:'main'}));
  vi.stubGlobal('fetch',fetchMock);
  const reports=await import('./repositoryReports');
  reports.setReportSession('session-handle');

  const [first,second]=await Promise.all([
   reports.repositoryJson<any>('data/index.json'),
   reports.repositoryJson<any>('data/index.json'),
  ]);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toContain('/api/public/manifest?');
  expect(first.preferred_branch).toBe('main');
  expect(second.preferred_branch).toBe('main');
 });
});
