import test from 'node:test';
import assert from 'node:assert/strict';
import {readBody, BodyLimitError, resolveLimit, DEFAULT_LIMITS} from './request-limits.mjs';
test('readBody returns the exact bytes of bounded requests', async () => {
  const body = await readBody(new Request('https://worker.example/api/launch', { method: 'POST', body: '{"ok":true}' }), 1024);
  assert.equal(new TextDecoder().decode(body), '{"ok":true}');
});
test('readBody rejects a declared Content-Length before buffering', async () => {
  await assert.rejects(
    readBody(new Request('https://worker.example/api/launch', { method: 'POST', body: 'x'.repeat(4096) }), 2048),
    error => error instanceof BodyLimitError && error.status === 413 && error.code === 'request_too_large' && error.limit === 2048
  );
});
test('readBody counts streamed chunks and cancels oversized bodies', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1024)); controller.enqueue(new Uint8Array(2048)); controller.close(); } });
  await assert.rejects(
    readBody(new Request('https://worker.example/api/launch', { method: 'POST', body: stream, duplex: 'half' }), 2048),
    error => error instanceof BodyLimitError && error.limit === 2048
  );
});
test('readBody tolerates empty bodies and absent streams', async () => {
  assert.equal((await readBody(new Request('https://worker.example/api/launch', { method: 'POST' }), 1024)).byteLength, 0);
});
test('resolveLimit prefers valid configured values and fails closed to defaults', () => {
  assert.equal(resolveLimit('4096', 16), 4096);
  assert.equal(resolveLimit('garbage', 16), 16);
  assert.equal(resolveLimit(undefined, 16), 16);
  assert.equal(resolveLimit('-5', 16), 16);
  assert.equal(resolveLimit('0', 16), 16);
  assert.equal(DEFAULT_LIMITS.launch, 2048);
  assert.equal(DEFAULT_LIMITS.stateWrite, 25 * 1024 * 1024);
});
