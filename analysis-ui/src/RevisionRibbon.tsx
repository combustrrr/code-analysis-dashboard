import {Select,Tag} from 'antd';
import {BranchesOutlined,ClockCircleOutlined,SafetyCertificateOutlined} from '@ant-design/icons';

type Target={id:string;label:string;kind:string;head_sha:string;status:string;lifecycle_status?:string};
export function RevisionRibbon({repository,target,targets,fresh,statusLabel,onTarget}:{repository:string;target?:Target;targets:Target[];fresh:boolean;statusLabel:string;onTarget:(id:string)=>void}){
 return <section className="revision-ribbon" aria-label="Selected analysis revision">
  <div className="revision-repository"><span>Project</span><strong>{repository}</strong></div>
  <div className="revision-target"><BranchesOutlined/><Select aria-label="Target revision" showSearch optionFilterProp="label" value={target?.id} placeholder="Choose revision" onChange={onTarget} options={['branch','pr','commit'].map(kind=>({label:kind==='branch'?'Branches':kind==='pr'?'Pull requests':'Commits',options:targets.filter(item=>item.kind===kind).map(item=>({value:item.id,label:item.label}))}))}/></div>
  <div className="revision-fact"><SafetyCertificateOutlined/><span>Revision<strong title={target?.head_sha}>{target?.head_sha?.slice(0,12)||'Unavailable'}</strong></span></div>
  <div className="revision-fact"><ClockCircleOutlined/><span>Report<Tag>{fresh?'Current':'Older revision'}</Tag></span></div>
  <div className="revision-fact"><span className={`state-dot state-${target?.lifecycle_status||target?.status}`}/><span>State<strong>{statusLabel}</strong></span></div>
 </section>;
}
