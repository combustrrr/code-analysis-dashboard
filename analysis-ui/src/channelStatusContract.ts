import contract from '../../config/code-analysis/channel-status-contract.json';

type StatusSemantics = {
  category: string;
  label: string;
  complete: boolean;
  reusable: boolean;
  replacement_eligible: boolean;
  report_incomplete: boolean;
  not_run: boolean;
};

const statuses = contract.statuses as Record<string, StatusSemantics>;
const fallback = contract.unknown_status as StatusSemantics;

export function channelStatus(status?: string): StatusSemantics {
  return statuses[String(status || 'UNKNOWN').trim().toUpperCase()] || fallback;
}

export function isCompleteChannelStatus(status?: string) {
  return channelStatus(status).complete;
}

export function channelStatusLabel(status?: string) {
  return channelStatus(status).label;
}

export function channelStatusCategory(status?: string) {
  return channelStatus(status).category;
}
