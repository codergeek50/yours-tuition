import { loadServer } from '../../apps-script/fake-services.mjs';

/**
 * The real apps-script/Code.gs running against an in-memory fake of Google, reachable through a `fetch`
 * stand-in. Tests use it so the app's storage client is checked against the real protocol, not a guess.
 */
export function fakeAppsScript() {
  const { server, apps } = loadServer();
  server.setup();
  const key: string = apps.state.props.get('KEY');
  const endpoint: string = apps.state.deployedUrl;
  const requests: { url: string; init: RequestInit; body: any }[] = [];

  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    if (String(url) !== endpoint) throw new TypeError('Failed to fetch');
    const body = JSON.parse(String(init.body));
    requests.push({ url: String(url), init, body });
    const out = server.doPost({ postData: { contents: String(init.body) } });
    return new Response(out.getContent(), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;

  return { server, apps, key, endpoint, fetchImpl, requests };
}
