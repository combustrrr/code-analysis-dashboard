import {describe,expect,it,vi} from 'vitest';
import {cachedProjectRegistry,getProjectRegistry,refreshProjectRegistry} from './projectRegistry';

describe('project registry cache',()=>{
 it('shares one request across consumers using the same session token',async()=>{
  refreshProjectRegistry();
  const registry={projects:[{id:'1'}]};
  const api=vi.fn(async()=>registry);
  const auth={session:{token:'shared-token'},api};
  const [first,second]=await Promise.all([getProjectRegistry(auth),getProjectRegistry(auth)]);
  expect(first).toBe(registry);
  expect(second).toBe(registry);
  expect(api).toHaveBeenCalledTimes(1);
  expect(cachedProjectRegistry(auth)).toBe(registry);
 });

 it('invalidates cached project state after publication',async()=>{
  refreshProjectRegistry();
  const api=vi.fn().mockResolvedValueOnce({version:1}).mockResolvedValueOnce({version:2});
  const auth={session:{token:'publication-token'},api};
  expect(await getProjectRegistry<{version:number}>(auth)).toEqual({version:1});
  refreshProjectRegistry();
  expect(await getProjectRegistry<{version:number}>(auth)).toEqual({version:2});
  expect(api).toHaveBeenCalledTimes(2);
 });
});
