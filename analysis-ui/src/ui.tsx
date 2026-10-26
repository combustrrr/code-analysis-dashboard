/* This compatibility layer intentionally accepts Ant-style dynamic prop bags. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React,{useEffect,useState,type CSSProperties,type ReactNode} from 'react';
import './ui.css';

type Loose={className?:string;style?:CSSProperties;children?:ReactNode;[key:string]:any};
const cx=(...values:any[])=>values.filter(Boolean).join(' ');

export function ConfigProvider({children}:Loose){return <>{children}</>}

export function Button({children,type,icon,loading,block,danger,href,target,rel,className,disabled,onClick,size,...rest}:Loose){
 const classes=cx('ant-btn',type==='primary'?'ant-btn-primary':type==='link'?'ant-btn-link':'ant-btn-default',size&&`ant-btn-${size}`,block&&'ant-btn-block',danger&&'ant-btn-dangerous',loading&&'ant-btn-loading',disabled&&'ant-btn-disabled',className);
 const content=<>{loading?<span className="ui-spinner" aria-hidden="true"/>:icon as ReactNode}<span>{children}</span></>;
 if(href)return <a {...rest as React.AnchorHTMLAttributes<HTMLAnchorElement>} className={classes} href={href as string} target={target as string} rel={rel as string} aria-disabled={disabled as boolean||undefined} onClick={disabled?(event)=>event.preventDefault():onClick as React.MouseEventHandler<HTMLAnchorElement>}>{content}</a>;
 return <button {...rest as React.ButtonHTMLAttributes<HTMLButtonElement>} className={classes} type="button" disabled={Boolean(disabled||loading)} onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}>{content}</button>;
}

export function Alert({type='info',title,message:legacyTitle,description,showIcon,closable,onClose,className,...rest}:Loose){
 const [visible,setVisible]=useState(true);if(!visible)return null;const heading=title??legacyTitle;
 return <div {...rest as React.HTMLAttributes<HTMLDivElement>} className={cx('ant-alert',`ant-alert-${type}`,className)} role={type==='error'?'alert':'status'}>{showIcon&&<span className="ant-alert-icon" aria-hidden="true">{type==='success'?'✓':type==='warning'?'!':type==='error'?'×':'i'}</span>}<div className="ant-alert-content">{heading&&<div className="ant-alert-message ant-alert-title">{heading as ReactNode}</div>}{description&&<div className="ant-alert-description">{description as ReactNode}</div>}</div>{closable&&<button className="ant-alert-close-icon" type="button" aria-label="Close" onClick={()=>{setVisible(false);(onClose as (()=>void)|undefined)?.()}}>×</button>}</div>;
}

type Option={value?:string|number;label:ReactNode;disabled?:boolean;options?:Option[]};
export type SelectProps={options?:Option[];value?:string|number;onChange?:(value:any)=>void;placeholder?:string;className?:string;style?:CSSProperties;[key:string]:unknown};
export function Select({options=[],value,onChange,placeholder,className,style,showSearch,...rest}:SelectProps){
 const listId=React.useId();
 const flat=options.flatMap(option=>option.options||[option]);
 const selected=flat.find(option=>String(option.value)===String(value??''));
 const [text,setText]=useState(()=>selected?String(selected.label):'');
 useEffect(()=>setText(selected?String(selected.label):''),[value,selected?.label]);
 if(showSearch){return <span className={cx('ant-select','ant-select-searchable',className)} style={style}><input {...rest as React.InputHTMLAttributes<HTMLInputElement>} className="ant-select-selector" role="combobox" aria-autocomplete="list" list={listId} placeholder={placeholder} value={text} onChange={event=>{const next=event.target.value;setText(next);const match=flat.find(option=>!option.disabled&&String(option.label)===next);if(match)onChange?.(match.value);}}/><datalist id={listId}>{flat.filter(option=>!option.disabled).map(option=><option key={String(option.value)} value={String(option.label)}/>)}</datalist></span>}
 return <span className={cx('ant-select',className)} style={style}><select {...rest as React.SelectHTMLAttributes<HTMLSelectElement>} className="ant-select-selector" value={value??''} onChange={event=>onChange?.(event.target.value)}>{placeholder&&value==null?<option value="" disabled>{placeholder}</option>:null}{options.map((option,index)=>option.options?<optgroup key={String(option.label??index)} label={String(option.label)}>{option.options.map(child=><option key={String(child.value)} value={child.value} disabled={child.disabled}>{child.label}</option>)}</optgroup>:<option key={String(option.value)} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></span>;
}

type InputProps=Omit<React.InputHTMLAttributes<HTMLInputElement>,'prefix'>&{allowClear?:boolean;prefix?:ReactNode};
export function Input({allowClear,prefix,...props}:InputProps){return <span className="ant-input-affix-wrapper">{prefix}<input {...props} className={cx('ant-input',props.className)}/>{allowClear&&props.value?<button type="button" aria-label="Clear" onClick={()=>props.onChange?.({target:{value:''}} as React.ChangeEvent<HTMLInputElement>)}>×</button>:null}</span>}

export function Checkbox({children,checked,onChange,...rest}:React.InputHTMLAttributes<HTMLInputElement>&{children?:ReactNode}){return <label className="ant-checkbox-wrapper"><input {...rest} type="checkbox" checked={checked} onChange={onChange}/><span>{children}</span></label>}

function RadioGroup({options=[],value,onChange,...rest}:{options?:Option[];value?:string|number;onChange?:(event:{target:{value:any}})=>void;[key:string]:any}){return <div {...rest as React.HTMLAttributes<HTMLDivElement>} role="radiogroup" className="ant-radio-group">{options.map(option=><label key={String(option.value)}><input type="radio" checked={value===option.value} onChange={()=>onChange?.({target:{value:option.value}})}/><span>{option.label}</span></label>)}</div>}
export const Radio={Group:RadioGroup};

export function Space({children,direction='horizontal',align,wrap,className,...rest}:Loose){return <div {...rest as React.HTMLAttributes<HTMLDivElement>} className={cx('ant-space',direction==='vertical'&&'ant-space-vertical',wrap&&'ant-space-wrap',className)} style={{alignItems:align as CSSProperties['alignItems'],...(rest.style as CSSProperties||{})}}>{React.Children.map(children,child=><div className="ant-space-item">{child}</div>)}</div>}

export function Tag({children,color,className,closable,onClose,...rest}:Loose){return <span {...rest as React.HTMLAttributes<HTMLSpanElement>} className={cx('ant-tag',color&&`ant-tag-${color}`,className)}>{children}{closable&&<button type="button" aria-label="Remove" onClick={onClose as React.MouseEventHandler<HTMLButtonElement>}>×</button>}</span>}

export function Tooltip({children,title}:Loose){return <span className="ant-tooltip-host" title={typeof title==='string'?title:undefined}>{children}</span>}

type CollapseItem={key:React.Key;label:ReactNode;children:ReactNode};
export function Collapse({items=[],className}:Loose){return <div className={cx('ant-collapse',className)}>{(items as CollapseItem[]).map(item=><details className="ant-collapse-item" key={item.key}><summary className="ant-collapse-header"><span className="ant-collapse-header-text">{item.label}</span></summary><div className="ant-collapse-content"><div className="ant-collapse-content-box">{item.children}</div></div></details>)}</div>}

export function Drawer({open,onClose,title,children,className,placement='right'}:Loose){
 useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>event.key==='Escape'&&(onClose as (()=>void)|undefined)?.();window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[open,onClose]);
 if(!open)return null;return <div className={cx('ant-drawer-root',className)}><button className="ant-drawer-mask" aria-label="Close navigation" onClick={onClose as React.MouseEventHandler<HTMLButtonElement>}/><aside className={cx('ant-drawer',`ant-drawer-${placement}`)} role="dialog" aria-modal="true"><header>{title as ReactNode}<button type="button" aria-label="Close" onClick={onClose as React.MouseEventHandler<HTMLButtonElement>}>×</button></header><div className="ant-drawer-body">{children}</div></aside></div>;
}

export function Modal({open,onCancel,onOk,title,children,footer,confirmLoading,okText='OK',cancelText='Cancel',className,width}:Loose){
 useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>event.key==='Escape'&&(onCancel as (()=>void)|undefined)?.();window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[open,onCancel]);
 if(!open)return null;return <div className={cx('ant-modal-root',className)}><button className="ant-modal-mask" aria-label="Close dialog" onClick={onCancel as React.MouseEventHandler<HTMLButtonElement>}/><div className="ant-modal" role="dialog" aria-modal="true" aria-label={typeof title==='string'?title:undefined} style={{width:width as CSSProperties['width']}}><div className="ant-modal-content"><button className="ant-modal-close" aria-label="Close" onClick={onCancel as React.MouseEventHandler<HTMLButtonElement>}>×</button>{title&&<div className="ant-modal-header"><div className="ant-modal-title">{title as ReactNode}</div></div>}<div className="ant-modal-body">{children}</div>{footer!==null&&<div className="ant-modal-footer">{footer as ReactNode||<><Button onClick={onCancel}> {cancelText}</Button><Button type="primary" loading={confirmLoading} onClick={onOk}>{okText}</Button></>}</div>}</div></div></div>;
}

export function Empty({description='No data',className}:Loose){return <div className={cx('ant-empty',className)}><span aria-hidden="true">◇</span><p>{description as ReactNode}</p></div>}
Empty.PRESENTED_IMAGE_SIMPLE='simple';

export function Skeleton({active,paragraph,title,className}:Loose){const rows=Number((paragraph as {rows?:number})?.rows||2);return <div className={cx('ant-skeleton',active&&'ant-skeleton-active',className)} aria-busy="true"><i className="ant-skeleton-title" style={{width:(title as {width?:string})?.width}}/>{Array.from({length:rows},(_,index)=><i className="ant-skeleton-paragraph" key={index}/>)}</div>}

export function Progress({percent=0,status,showInfo=true,className}:Loose){const value=Math.max(0,Math.min(100,Number(percent)));return <div className={cx('ant-progress',status&&`ant-progress-status-${status}`,className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div className="ant-progress-outer"><div className="ant-progress-inner"><i style={{width:`${value}%`}}/></div></div>{showInfo&&<span>{value}%</span>}</div>}

type Column<T>={title?:ReactNode;key?:React.Key;dataIndex?:keyof T;render?:(value:any,row:T,index:number)=>ReactNode;[key:string]:any};
export function Table<T extends Record<string,any>>({dataSource=[],columns=[],rowKey='key',rowClassName,locale,pagination,className,scroll}: {dataSource?:T[];columns?:Column<T>[];rowKey?:keyof T|((row:T)=>React.Key);rowClassName?:(row:T)=>string;locale?:{emptyText?:ReactNode};pagination?:false|{current?:number;pageSize?:number;onChange?:(page:number)=>void;showTotal?:(total:number)=>ReactNode;[key:string]:any};className?:string;scroll?:unknown;size?:string}){
 const pageSize=pagination&&pagination.pageSize||dataSource.length||1,current=pagination&&pagination.current||1;const rows=pagination?dataSource.slice((current-1)*pageSize,current*pageSize):dataSource;
 return <div className={cx('ant-table-wrapper',className)}><div className="ant-table-container" style={scroll?{overflowX:'auto'}:undefined}><table className="ant-table"><thead className="ant-table-thead"><tr>{columns.map((column,index)=><th className="ant-table-cell" key={String(column.key??column.dataIndex??index)}>{column.title}</th>)}</tr></thead><tbody className="ant-table-tbody">{rows.length?rows.map((row,index)=><tr key={String(typeof rowKey==='function'?rowKey(row):row[rowKey])} className={cx('ant-table-row',rowClassName?.(row))}>{columns.map((column,columnIndex)=><td className="ant-table-cell" key={String(column.key??column.dataIndex??columnIndex)}>{column.render?column.render(column.dataIndex?row[column.dataIndex]:undefined,row,index):column.dataIndex?row[column.dataIndex] as ReactNode:null}</td>)}</tr>):<tr><td className="ant-table-cell ant-table-placeholder" colSpan={columns.length}>{locale?.emptyText||'No data'}</td></tr>}</tbody></table></div>{pagination&&dataSource.length>pageSize&&<Pagination current={current} pageSize={pageSize} total={dataSource.length} onChange={pagination.onChange} showTotal={pagination.showTotal}/>}</div>;
}

export function Pagination({current=1,pageSize=10,total=0,onChange,showTotal,className}:{current?:number;pageSize?:number;total?:number;onChange?:(page:number)=>void;showTotal?:(total:number)=>ReactNode;className?:string;[key:string]:any}){const pages=Math.max(1,Math.ceil(total/pageSize));return <nav className={cx('ant-pagination',className)} aria-label="Pagination"><span>{showTotal?.(total)}</span><Button disabled={current<=1} onClick={()=>onChange?.(current-1)}>Previous</Button><span>{current} / {pages}</span><Button disabled={current>=pages} onClick={()=>onChange?.(current+1)}>Next</Button></nav>}

export function Descriptions({items=[],column=1,bordered,className}:Loose){return <dl className={cx('ant-descriptions',bordered&&'ant-descriptions-bordered',className)} style={{gridTemplateColumns:`repeat(${Number(column)||1},minmax(0,1fr))`}}>{(items as {key:React.Key;label:ReactNode;children:ReactNode}[]).map(item=><div className="ant-descriptions-row" key={item.key}><dt className="ant-descriptions-item-label">{item.label}</dt><dd className="ant-descriptions-item-content">{item.children}</dd></div>)}</dl>}

type TabItem={key:string;label:ReactNode;children?:ReactNode;disabled?:boolean};
export function Tabs({items=[],activeKey,onChange,className}:{items?:TabItem[];activeKey?:string;onChange?:(key:string)=>void;className?:string;[key:string]:any}){const selected=activeKey??items[0]?.key;return <div className={cx('ant-tabs',className)}><div className="ant-tabs-nav" role="tablist"><div className="ant-tabs-nav-list">{items.map(tab=><button type="button" role="tab" disabled={tab.disabled} aria-selected={tab.key===selected} className={cx('ant-tabs-tab',tab.key===selected&&'ant-tabs-tab-active')} key={tab.key} onClick={()=>onChange?.(tab.key)}>{tab.label}</button>)}</div></div><div className="ant-tabs-content">{items.find(tab=>tab.key===selected)?.children}</div></div>}

export function Steps({items=[],current=0,className}:Loose){return <div className={cx('ant-steps',className)}>{(items as {title:ReactNode;description?:ReactNode}[]).map((item,index)=><div className={cx('ant-steps-item',index<Number(current)&&'ant-steps-item-finish',index===Number(current)&&'ant-steps-item-process')} key={index}><span>{index<Number(current)?'✓':index+1}</span><div><strong className="ant-steps-item-title">{item.title}</strong>{item.description&&<p className="ant-steps-item-description">{item.description}</p>}</div></div>)}</div>}

export function Statistic({title,value,suffix,className}:Loose){return <div className={cx('ant-statistic',className)}><div className="ant-statistic-title">{title as ReactNode}</div><div className="ant-statistic-content">{value as ReactNode}{suffix as ReactNode}</div></div>}

export function Card({title,children,className,...rest}:Loose){return <article {...rest as React.HTMLAttributes<HTMLElement>} className={cx('ant-card',className)}>{title&&<header className="ant-card-head"><div className="ant-card-head-title">{title as ReactNode}</div></header>}<div className="ant-card-body">{children}</div></article>}
export function Row({children,gutter,className,...rest}:Loose){return <div {...rest as React.HTMLAttributes<HTMLDivElement>} className={cx('ant-row',className)} style={{gap:Array.isArray(gutter)?gutter[0]:gutter as number,...(rest.style as CSSProperties||{})}}>{children}</div>}
export function Col({children,span,className,...rest}:Loose){return <div {...rest as React.HTMLAttributes<HTMLDivElement>} className={cx('ant-col',className)} style={{flexBasis:span?`${Number(span)/24*100}%`:undefined,...(rest.style as CSSProperties||{})}}>{children}</div>}

function ListItem({children,className}:Loose){return <li className={cx('ant-list-item',className)}>{children}</li>}
export function List<T>({dataSource=[],renderItem,className}: {dataSource?:T[];renderItem?:(item:T,index:number)=>ReactNode;split?:boolean;className?:string}){return <ul className={cx('ant-list',className)}>{dataSource.map((item,index)=><React.Fragment key={index}>{renderItem?.(item,index)}</React.Fragment>)}</ul>}
List.Item=ListItem;

const Title=({level=1,children,className,...rest}:Loose)=>(React.createElement(`h${level}`,{...rest,className:cx('ant-typography',className)},children));
const Text=({children,copyable,code,className,...rest}:Loose)=>{const content=code?<code>{children}</code>:children;return <span {...rest as React.HTMLAttributes<HTMLSpanElement>} className={cx('ant-typography',className)}>{content}{copyable&&<button type="button" aria-label="Copy" onClick={()=>navigator.clipboard?.writeText(String(children))}>Copy</button>}</span>};
const Paragraph=({children,className,...rest}:Loose)=><p {...rest as React.HTMLAttributes<HTMLParagraphElement>} className={cx('ant-typography',className)}>{children}</p>;
export const Typography={Title,Text,Paragraph};

function useBreakpoint(){const read=()=>({xs:innerWidth<576,sm:innerWidth>=576,md:innerWidth>=768,lg:innerWidth>=992,xl:innerWidth>=1200,xxl:innerWidth>=1600});const [value,setValue]=useState(read);useEffect(()=>{const update=()=>setValue(read());addEventListener('resize',update);return()=>removeEventListener('resize',update)},[]);return value}
export const Grid={useBreakpoint};

let toastTimer:number|undefined;
function toast(content:unknown,kind:string,duration=2){let host=document.getElementById('ui-message');if(!host){host=document.createElement('div');host.id='ui-message';host.setAttribute('role','status');document.body.append(host)}host.className=`ui-message ui-message-${kind}`;host.textContent=typeof content==='string'?content:String((content as {content?:unknown})?.content||'');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>host?.remove(),Number((content as {duration?:number})?.duration||duration)*1000)}
export const message={success:(content:unknown)=>toast(content,'success'),loading:(content:unknown)=>toast(content,'loading',1.2),error:(content:unknown)=>toast(content,'error')};
