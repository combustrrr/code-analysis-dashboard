// Per-endpoint request body limits. Every limit fails closed: a declared
// Content-Length above the cap rejects before any bytes are buffered, and
// streamed bodies are counted and cancelled at the cap.
export const DEFAULT_LIMITS = Object.freeze({
  launch: 2048,
  applicationJson: 65536,
  stateWrite: 25 * 1024 * 1024,
  reportManifestJson: 16 * 1024 * 1024,
  reportAsset: 100 * 1024 * 1024,
  webhook: 1000000,
});
export class BodyLimitError extends Error {
  constructor(limit) {
    super(`Request body exceeds the ${limit}-byte limit for this endpoint.`);
    this.name = 'BodyLimitError';
    this.status = 413;
    this.code = 'request_too_large';
    this.limit = limit;
  }
}
export function resolveLimit(configured, fallback) {
  const parsed = parseInt(String(configured ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
export async function readBody(request, maxBytes) {
  const declared = request.headers.get('Content-Length');
  if (declared && /^\d+$/.test(declared) && parseInt(declared, 10) > maxBytes) throw new BodyLimitError(maxBytes);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new BodyLimitError(maxBytes);
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return joined;
}
