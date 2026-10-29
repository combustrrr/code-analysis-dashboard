import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';

const manifest=JSON.parse(readFileSync(new URL('../dist/.vite/manifest.json',import.meta.url),'utf8'));
const entry=manifest['index.html'];
if(!entry)throw new Error('Landing entry is missing from the production manifest.');

const visited=new Set();
const initial=[];
function collect(key){
 if(visited.has(key))return;visited.add(key);
 const chunk=manifest[key];if(!chunk)return;
 initial.push(chunk);
 for(const dependency of chunk.imports||[])collect(dependency);
}
collect('index.html');

const root=new URL('../dist/',import.meta.url);
const jsFiles=[...new Set(initial.map(chunk=>chunk.file).filter(file=>file.endsWith('.js')))];
const cssFiles=[...new Set(initial.flatMap(chunk=>chunk.css||[]))];
const bytes=file=>readFileSync(new URL(file,root));
const jsGzip=jsFiles.reduce((total,file)=>total+gzipSync(bytes(file)).length,0);
const cssRaw=cssFiles.reduce((total,file)=>total+bytes(file).length,0);
const cssGzip=cssFiles.reduce((total,file)=>total+gzipSync(bytes(file)).length,0);
const fontFiles=[...new Set(initial.flatMap(chunk=>chunk.assets||[]).filter(file=>file.endsWith('.woff2')))];
const fontBytes=fontFiles.reduce((total,file)=>total+bytes(file).length,0);

const budgets={jsGzip:50*1024,cssRaw:25*1024,cssGzip:7*1024,fontBytes:70*1024};
const actual={jsGzip,cssRaw,cssGzip,fontBytes};
for(const [name,limit] of Object.entries(budgets))if(actual[name]>limit)throw new Error(`${name} is ${actual[name]} bytes; budget is ${limit} bytes.`);
console.log(JSON.stringify({entry:entry.file,jsFiles,cssFiles,fontFiles,...actual},null,2));
