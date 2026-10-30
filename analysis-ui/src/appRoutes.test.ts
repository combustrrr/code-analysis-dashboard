import {describe,expect,test} from 'vitest';
import {parseAppRoute,routeHash} from './appRoutes';

describe('project evidence routes',()=>{
 test('round-trips developer issue filters without repository names',()=>{
  const hash=routeHash({kind:'project',projectId:'1278177697',target:'branch:Testing',view:'issues',issue:'finding-1',filters:{severity:['HIGH','MEDIUM'],category:'security',scanner:['Bandit','Semgrep'],files:['src/a.ts','src/b.ts'],directory:['src/api','src/web'],group:'rule'}});
  expect(hash).not.toContain('combustrrr');
  expect(parseAppRoute(hash)).toEqual({kind:'project',projectId:'1278177697',target:'branch:Testing',view:'issues',issue:'finding-1',filters:{query:undefined,severity:['HIGH','MEDIUM'],category:'security',scanner:['Bandit','Semgrep'],rule:undefined,files:['src/a.ts','src/b.ts'],directory:['src/api','src/web'],location:undefined,overlap:undefined,group:'rule'}});
 });
 test('keeps coverage as a distinct project section',()=>{
  expect(parseAppRoute('#/projects/1278177697/coverage?target=branch%3ATesting')).toEqual({kind:'project',projectId:'1278177697',view:'coverage',target:'branch:Testing',issue:undefined,filters:undefined});
 });
 test('normalizes legacy settings sections into canonical paths',()=>{
  expect(parseAppRoute('#/settings?section=connections&project=1278177697')).toEqual({kind:'settings',section:'integrations',projectId:'1278177697'});
  expect(routeHash({kind:'settings',section:'provenance',projectId:'1278177697'})).toBe('#/settings/provenance?project=1278177697');
  expect(parseAppRoute('#/settings/integrations?project=not-trusted')).toEqual({kind:'settings',section:'integrations',projectId:undefined});
 });
});
