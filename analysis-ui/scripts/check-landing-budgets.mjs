import {readFileSync,readdirSync} from 'node:fs';
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
const workspace=manifest['src/WorkspaceApp.tsx'];
const expectedTabs=['OverviewTab','IssuesTab','CoverageTab','ReportsTab','ProgressTab'];
for(const tab of expectedTabs){const key=`src/workspace-tabs/${tab}.tsx`;if(!manifest[key]?.isDynamicEntry||!workspace?.dynamicImports?.includes(key))throw new Error(`${tab} is not an independent lazy workspace chunk.`);}
const workerFiles=readdirSync(new URL('../dist/assets/',import.meta.url)).filter(file=>/^ThreatReportPdf\.worker-.*\.js$/.test(file));
if(workerFiles.length!==1)throw new Error(`Expected one request-lazy PDF Web Worker chunk; found ${workerFiles.length}.`);
if(jsFiles.some(file=>workerFiles.some(worker=>file.endsWith(worker))))throw new Error('The PDF worker must not be part of the anonymous landing dependency graph.');
console.log(JSON.stringify({entry:entry.file,jsFiles,cssFiles,fontFiles,workspaceTabs:expectedTabs,pdfWorker:workerFiles[0],...actual},null,2));
