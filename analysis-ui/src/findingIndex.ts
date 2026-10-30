export type IndexableFinding={id:string;severity:string;category?:string;scanners:string[];rules:string[];file:string;line:number;message:string};
type Family='severity'|'category'|'scanner'|'rule'|'file'|'directory'|'location'|'overlap';
export type FindingIndex<T extends IndexableFinding>={rows:T[];byId:Map<string,number>;families:Record<Family,Map<string,Set<number>>>;search:string[]};

const directory=(file:string)=>file.includes('/')?file.slice(0,file.lastIndexOf('/')):'(root)';
const add=(map:Map<string,Set<number>>,key:string,index:number)=>{const values=map.get(key)||new Set<number>();values.add(index);map.set(key,values)};

export function buildFindingIndex<T extends IndexableFinding>(rows:T[]):FindingIndex<T>{
 const families={} as Record<Family,Map<string,Set<number>>>;
 (['severity','category','scanner','rule','file','directory','location','overlap'] as Family[]).forEach(key=>families[key]=new Map());
 const byId=new Map<string,number>(),search:string[]=[];
 rows.forEach((row,index)=>{
  byId.set(row.id,index);add(families.severity,row.severity,index);add(families.category,row.category||'Uncategorized',index);
  row.scanners.forEach(value=>add(families.scanner,value,index));row.rules.forEach(value=>add(families.rule,value,index));
  if(row.file)add(families.file,row.file,index);add(families.directory,directory(row.file),index);
  const located=Boolean(row.file&&row.line>0);add(families.location,located?'located':'unlocated',index);
  if(located)add(families.location,`${row.file}#L${row.line}`,index);
  add(families.overlap,new Set(row.scanners).size>1?'multiple':'single',index);
  search[index]=`${row.message} ${row.file} ${row.category||''} ${row.rules.join(' ')} ${row.scanners.join(' ')}`.toLowerCase();
 });
 return{rows,byId,families,search};
}

const union=(sets:Set<number>[])=>{const result=new Set<number>();sets.forEach(set=>set.forEach(value=>result.add(value)));return result};
export function filterFindingIndex<T extends IndexableFinding>(index:FindingIndex<T>,filters:Partial<Record<Family,string[]>>,{query=''}={}){
 let candidates:Set<number>|undefined;
 for(const [family,values] of Object.entries(filters) as [Family,string[]][]){
  if(!values?.length)continue;
  const selected=union(values.map(value=>index.families[family].get(value)||new Set()));
  candidates=candidates===undefined?selected:new Set([...candidates].filter(value=>selected.has(value)));
 }
 const normalized=query.trim().toLowerCase();
 return [...(candidates||index.rows.keys())].filter(position=>!normalized||index.search[position].includes(normalized)).map(position=>index.rows[position]);
}
