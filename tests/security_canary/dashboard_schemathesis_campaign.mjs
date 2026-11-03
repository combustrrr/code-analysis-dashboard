import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

import worker from '../../analysis-launcher/worker.mjs';

const HOST = '127.0.0.1';
const PORT = 8088;

const workerEnvironment = {
  APPLICATION_MODE: 'repositories',
  ANALYSIS_REPOSITORY: 'combustrrr/code-analysis-dashboard',
  ANALYSIS_REPOSITORY_ID: '1360051890',
  DASHBOARD_ORIGIN: 'https://combustrrr.github.io',
  DASHBOARD_BASE_PATH: '/code-analysis-dashboard/',
  GITHUB_CLIENT_ID: 'schemathesis-client',
  GITHUB_CLIENT_SECRET: 'non-production-placeholder',
  SESSION_KEY: Buffer.alloc(32, 7).toString('base64url'),
  REPORT_ACCESS: 'collaborators',
  DASHBOARD_ACCESS: 'collaborators',
};

export function openApiDocument(baseUrl) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Code Analysis Dashboard public configuration API',
      version: '1.0.0',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/api/public/config': {
        get: {
          operationId: 'getPublicConfiguration',
          responses: {
            200: {
              description: 'Public repository-service configuration',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: [
                      'mode',
                      'require_login',
                      'require_report_login',
                      'execution_repository',
                      'admission_paused',
                      'reset_notice',
                    ],
                    properties: {
                      mode: { type: 'string', enum: ['repositories'] },
                      require_login: { type: 'boolean' },
                      require_report_login: { type: 'boolean' },
                      execution_repository: {
                        type: 'object',
                        required: ['id', 'full_name'],
                        properties: {
                          id: { type: 'integer', enum: [1360051890] },
                          full_name: {
                            type: 'string',
                            enum: ['combustrrr/code-analysis-dashboard'],
                          },
                        },
                      },
                      admission_paused: { type: 'boolean' },
                      reset_notice: { nullable: true },
                    },
                    additionalProperties: true,
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export async function startServer(port = PORT) {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const baseUrl = `http://${HOST}:${actualPort}`;
      const url = new URL(incoming.url || '/', baseUrl);
      if (url.pathname === '/openapi.json') {
        outgoing.writeHead(200, { 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify(openApiDocument(baseUrl)));
        return;
      }
      const requestBody = ['GET', 'HEAD'].includes(incoming.method || 'GET')
        ? undefined
        : await body(incoming);
      const response = await worker.fetch(new Request(url, {
        method: incoming.method,
        headers: incoming.headers,
        body: requestBody,
      }), workerEnvironment, {});
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500, { 'Content-Type': 'application/json' });
      outgoing.end('{"error":"local_harness_failure"}');
    }
  });
  server.listen(port, HOST);
  await once(server, 'listening');
  return server;
}

async function campaign() {
  const server = await startServer();
  try {
    const scanner = spawn('schemathesis', [
      'run',
      `http://${HOST}:${PORT}/openapi.json`,
      '--experimental=openapi-3.1',
      '--base-url',
      `http://${HOST}:${PORT}`,
      '--checks',
      'all',
      '--max-response-time',
      '5000',
      '--hypothesis-max-examples',
      '50',
      '--junit-xml=fuzzing-results.xml',
    ], { stdio: 'inherit' });
    const [code] = await once(scanner, 'exit');
    process.exitCode = typeof code === 'number' ? code : 2;
  } finally {
    server.close();
    await once(server, 'close');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await campaign();
}
