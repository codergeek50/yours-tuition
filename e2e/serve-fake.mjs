// Starts the local fake data service on a fixed port for manual browser checks.
// Usage: node e2e/serve-fake.mjs [port]
// Prints the address and key. Also serves GET /__tab/<name> to look at a tab of the readable Sheet.
import { createServer } from 'node:http';
import { createFakeApps, loadServer, tabValues } from '../apps-script/fake-services.mjs';

const port = Number(process.argv[2] ?? 8787);
const apps = createFakeApps();
const { server } = loadServer(apps);
server.setup();
const key = apps.state.props.get('KEY');

createServer((req, res) => {
  const reply = (status, body, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*' });
    res.end(body);
  };
  if (req.url?.startsWith('/__tab/')) return reply(200, JSON.stringify(tabValues(apps, decodeURIComponent(req.url.slice(7))) ?? null));
  if (req.url === '/__files') return reply(200, JSON.stringify([...apps.state.files.values()].map((f) => f.name)));
  if (!req.url?.startsWith('/macros/s/LOCAL/exec')) return reply(404, 'not found', 'text/plain');
  if (req.method === 'GET') return reply(200, server.doGet({}).getContent());
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => reply(200, server.doPost({ postData: { contents: body } }).getContent()));
}).listen(port, '127.0.0.1', () => {
  console.log(`fake data service on http://127.0.0.1:${port}/macros/s/LOCAL/exec`);
  console.log(`key ${key}`);
});
