import {describe,expect,test} from 'vitest';
import {parseAppRoute,routeHash} from './appRoutes';

describe('project evidence routes',()=>{
 test('round-trips developer issue filters without repository names',()=>{
  const hash=routeHash({kind:'project',projectId:'1278177697',target:'branch:Testing',view:'issues',issue:'finding-1',filters:{severity:'HIGH',category:'security',directory:'src/api',group:'rule'}});
  expect(hash).not.toContain('combustrrr');
  expect(parseAppRoute(hash)).toEqual({kind:'project',projectId:'1278177697',target:'branch:Testing',view:'issues',issue:'finding-1',filters:{query:undefined,severity:'HIGH',category:'security',scanner:undefined,rule:undefined,file:undefined,directory:'src/api',location:undefined,overlap:undefined,group:'rule'}});
 });
});
