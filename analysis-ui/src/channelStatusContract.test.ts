import {describe,expect,it} from 'vitest';
import contract from '../../config/code-analysis/channel-status-contract.json';
import {channelStatus,channelStatusCategory,channelStatusLabel,isCompleteChannelStatus} from './channelStatusContract';

describe('channel status contract',()=>{
  it('uses the versioned contract for every terminal and incomplete state',()=>{
    expect(contract.schema_version).toBe('channel-status-contract-v1');
    for(const [status,row] of Object.entries(contract.statuses)){
      expect(isCompleteChannelStatus(status),status).toBe(row.complete);
      expect(channelStatusCategory(status),status).toBe(row.category);
      expect(channelStatusLabel(status),status).toBe(row.label);
    }
  });
  it('fails closed for an unknown provider status',()=>{
    expect(isCompleteChannelStatus('NEW_PROVIDER_STATE')).toBe(false);
    expect(channelStatus('NEW_PROVIDER_STATE')).toEqual(contract.unknown_status);
    expect(channelStatusCategory('NEW_PROVIDER_STATE')).toBe('unknown');
  });
  it('never treats not-run states as completed evidence',()=>{
    for(const status of ['NOT_APPLICABLE','DEFERRED','NOT_SELECTED']){
      expect(isCompleteChannelStatus(status),status).toBe(false);
      expect(channelStatusCategory(status),status).toBe('not_run');
    }
  });
});
