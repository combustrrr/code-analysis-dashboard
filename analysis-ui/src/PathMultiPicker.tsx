import {useEffect,useMemo,useRef,useState} from 'react';
import {Button,Input,Tag} from './ui';

export function MultiValuePicker({label,options,value,onChange,itemName='value',searchPlaceholder='Search options'}:{label:string;options:string[];value:string[];onChange:(values:string[])=>void;itemName?:string;searchPlaceholder?:string}){
 const [query,setQuery]=useState('');
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const close=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node)){const details=root.current.querySelector('details');if(details)details.open=false;}};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 const normalized=query.trim().toLowerCase();
 const choices=useMemo(()=>options.filter(path=>!value.includes(path)&&(!normalized||path.toLowerCase().includes(normalized))).slice(0,60),[options,value,normalized]);
 const add=(path:string)=>{if(path&&!value.includes(path))onChange([...value,path]);setQuery('');};
 const plural=itemName==='severity'?'severities':itemName==='category'?'categories':`${itemName}s`;
 const summary=value.length?`${value.length} ${value.length===1?itemName:plural} selected`:`Choose ${plural}`;
 return <div className="path-multi-picker" ref={root}>
  <details>
   <summary><span>{summary}</span><small>Select multiple</small></summary>
   <div className="path-picker-popover">
    <Input aria-label={`${label} search`} value={query} placeholder={searchPlaceholder} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&choices.length===1){event.preventDefault();add(choices[0]);}}}/>
    <div className="path-picker-options" role="listbox" aria-label={`${label} options`} aria-multiselectable="true">
     {choices.length?choices.map(option=><button type="button" role="option" aria-selected="false" key={option} title={option} onClick={()=>add(option)}>{option}</button>):<p>{normalized?'No additional options match.':'Every available option is selected.'}</p>}
    </div>
   </div>
  </details>
  {value.length>0&&<div className="path-picker-selected" aria-label={`${label} selected values`}>{value.map(option=><Tag key={option} closable onClose={()=>onChange(value.filter(item=>item!==option))}>{option}</Tag>)}<Button type="link" size="small" onClick={()=>onChange([])}>Clear {itemName}s</Button></div>}
 </div>;
}

export const PathMultiPicker=MultiValuePicker;
