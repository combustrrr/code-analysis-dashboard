import {refreshProjectRegistry} from './projectRegistry';
import {refreshRepositoryReports} from './repositoryReports';

export const EVIDENCE_REFRESH_EVENT='analysis-evidence-refresh';

export function invalidateEvidenceCaches(){
  refreshProjectRegistry();
  refreshRepositoryReports();
  window.dispatchEvent(new Event(EVIDENCE_REFRESH_EVENT));
}
