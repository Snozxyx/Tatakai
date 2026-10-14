import { it, expect } from 'bun:test';
import { proxyRouter } from '../TatakaiAPI/src/routes/proxy';

it('does not truncate a decoded extension manifest to the compressed upstream length', async () => {
  const originalFetch = globalThis.fetch;
  const body = JSON.stringify({ id: 'mangabuddy', name: 'MangaBuddy', description: 'x'.repeat(500), version: '2.4.2' });
  try {
    for (const encoding of ['gzip', 'br', null]) {
      globalThis.fetch = (async () => new Response(body, { headers: {
        'content-type': 'application/json', 'content-length': encoding ? '269' : String(body.length),
        ...(encoding ? { 'content-encoding': encoding } : {}),
      } })) as typeof fetch;
      const response = await proxyRouter.request('/extension?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffixture%2Fmanifest.json');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-length')).toBe(encoding ? null : String(body.length));
      expect(response.headers.get('content-encoding')).toBeNull();
      expect((await response.json()).name).toBe('MangaBuddy');
    }
  } finally { globalThis.fetch = originalFetch; }
});
