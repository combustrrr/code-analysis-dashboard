import {describe,expect,test} from 'vitest';
import {buildFindingIndex,filterFindingIndex} from './findingIndex';

describe('report-scoped finding index',()=>{
 test('unions within a family and intersects between families',()=>{
  const rows=[
   {id:'a',severity:'HIGH',category:'security',scanners:['Semgrep'],rules:['R1'],file:'src/a.ts',line:2,message:'alpha'},
   {id:'b',severity:'MEDIUM',category:'quality',scanners:['Ruff'],rules:['R2'],file:'src/b.ts',line:0,message:'beta'},
   {id:'c',severity:'LOW',category:'security',scanners:['Semgrep','CodeQL'],rules:['R3'],file:'lib/c.ts',line:4,message:'gamma'},
  ];
  const index=buildFindingIndex(rows);
  expect(filterFindingIndex(index,{severity:['HIGH','LOW'],category:['security']})).toEqual([rows[0],rows[2]]);
  expect(filterFindingIndex(index,{overlap:['multiple']},{query:'gamma'})).toEqual([rows[2]]);
  expect(index.byId.get('b')).toBe(1);
 });
 test('filters workflow annotations and correlated scanner support',()=>{
  const rows=[
   {id:'native',severity:'HIGH',category:'security',scanners:['Semgrep'],rules:['R1'],file:'src/a.ts',line:2,message:'native',annotation:{source:'check-run',workflow:'ci.yml',job:'scan',level:'warning',correlation:{status:'supporting',scanner:'Semgrep'}}},
   {id:'workflow',severity:'INFO',category:'workflow',scanners:['Workflow annotations'],rules:['summary'],file:'',line:0,message:'summary',annotation:{source:'job-summary',workflow:'ci.yml',job:'build',level:'notice',correlation:{status:'unmatched'}}},
  ];
  const index=buildFindingIndex(rows);
  expect(filterFindingIndex(index,{annotationSource:['check-run'],job:['scan'],annotationLevel:['warning'],correlatedScanner:['Semgrep']})).toEqual([rows[0]]);
  expect(filterFindingIndex(index,{annotationSource:['job-summary']})).toEqual([rows[1]]);
 });
 test('indexes ten thousand findings without changing row identity',()=>{
  const rows=Array.from({length:10_000},(_,i)=>({id:`issue-${i}`,severity:i%2?'HIGH':'LOW',category:'security',scanners:['Semgrep'],rules:[`R${i%10}`],file:`src/${i%100}/a.ts`,line:i+1,message:`finding ${i}`}));
  const index=buildFindingIndex(rows),started=performance.now();
  const result=filterFindingIndex(index,{severity:['HIGH'],rule:['R1']},{query:'finding'});
  expect(performance.now()-started).toBeLessThan(50);
  expect(result.length).toBe(1000);
  expect(result[0]).toBe(rows[1]);
 });
});
