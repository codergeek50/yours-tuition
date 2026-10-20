// A local web server that speaks the Apps Script web app protocol by running the real apps-script/Code.gs
// against the in-memory fake of Google. Lets the end-to-end tests exercise real HTTP without a Google account.
import { createServer } from 'node:http';
import { createFakeApps, loadServer } from '../apps-script/fake-services.mjs';

/** Starts the server on a free port. Returns { endpoint, key, apps, close }. */
export async function startFakeServer({ latencyMs = 0 } = {}) {
  const apps = createFakeApps();
  const { server } = loadServer(apps);
  server.setup();
  const key = apps.state.props.get('KEY');

  const http = createServer((req, res) => {
    const reply = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*' });
      res.end(body);
    };
    if (!req.url?.startsWith('/macros/s/LOCAL/exec')) return reply(404, 'not found', 'text/plain');
    if (req.method === 'GET') return reply(200, server.doGet({}).getContent());
    if (req.method !== 'POST') return reply(405, 'method not allowed', 'text/plain');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
      reply(200, server.doPost({ postData: { contents: body } }).getContent());
    });
  });

  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address();
  return {
    endpoint: `http://127.0.0.1:${port}/macros/s/LOCAL/exec`,
    key,
    apps,
    server,
    close: () => new Promise((resolve) => http.close(resolve)),
  };
}
