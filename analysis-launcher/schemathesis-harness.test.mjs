import test from 'node:test';
import assert from 'node:assert/strict';

import {
  openApiDocument,
  startServer,
} from '../tests/security_canary/dashboard_schemathesis_campaign.mjs';

test('Schemathesis harness exercises the real public Worker handler', async t => {
  const server = await startServer(0);
  t.after(() => server.close());
  const address = server.address();
  assert.equal(typeof address, 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const schema = await (await fetch(`${baseUrl}/openapi.json`)).json();
  const response = await fetch(`${baseUrl}/api/public/config`);
  const payload = await response.json();
  assert.deepEqual(schema, openApiDocument(baseUrl));
  assert.equal(response.status, 200);
  assert.equal(payload.mode, 'repositories');
  assert.equal(payload.execution_repository.full_name, 'combustrrr/code-analysis-dashboard');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  const configSchema = schema.paths['/api/public/config'].get.responses[200]
    .content['application/json'].schema;
  for (const key of ['require_report_login', 'admission_paused']) {
    assert.ok(configSchema.required.includes(key), `public config schema must require ${key}`);
  }
});
