import contract from '../config/code-analysis/channel-status-contract.json' with {type:'json'};

if(contract.schema_version!=='channel-status-contract-v1')throw new Error('Unsupported channel status contract');

const fallback=Object.freeze({...contract.unknown_status});
const rows=Object.freeze(Object.fromEntries(Object.entries(contract.statuses).map(([name,row])=>[name,Object.freeze({...row})])));
export const CHANNEL_STATUS_CONTRACT=Object.freeze({...contract,statuses:rows,unknown_status:fallback});
export const channelStatus=value=>rows[String(value||'UNKNOWN').trim().toUpperCase()]||fallback;
export const isCompleteChannelStatus=value=>channelStatus(value).complete===true;
export const isReusableChannelStatus=value=>channelStatus(value).reusable===true;
export const isReplacementEligibleChannelStatus=value=>channelStatus(value).replacement_eligible===true;
export const isReportIncompleteChannelStatus=value=>channelStatus(value).report_incomplete===true;
export const isNotRunChannelStatus=value=>channelStatus(value).not_run===true;
