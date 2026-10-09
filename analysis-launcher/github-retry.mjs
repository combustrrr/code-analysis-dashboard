export const MAX_GITHUB_READ_RETRIES = 2;
export const MAX_GITHUB_RETRY_DELAY_MS = 10000;
export const sleep = ms => ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
export function retryAfterMs(response) {
  const value = response.headers.get('Retry-After');
  if (!value) return 0;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Math.min(MAX_GITHUB_RETRY_DELAY_MS, Number(value) * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.min(MAX_GITHUB_RETRY_DELAY_MS, Math.max(0, at - Date.now())) : 0;
}
export async function secondaryRateLimit(response) {
  if (response.status !== 403) return false;
  if (response.headers.get('Retry-After') || response.headers.get('X-RateLimit-Remaining') === '0') return true;
  return /secondary rate limit|abuse detection|temporarily blocked/i.test(await response.clone().text());
}
export function transientReadStatus(status) { return status === 429 || status === 502 || status === 503 || status === 504; }
