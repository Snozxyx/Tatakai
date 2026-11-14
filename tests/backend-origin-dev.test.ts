import { expect, test } from 'bun:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

let version = 0;
async function withRenderer(dev: boolean, href: string, native: boolean, run: (api: any) => void) {
  const previousWindow = (globalThis as any).window;
  const previousNative = (globalThis as any).__backendOriginNative;
  (globalThis as any).window = { location: new URL(href), electron: {} };
  (globalThis as any).__backendOriginNative = native;
  try {
    const result = await build({
      entryPoints: [resolve('src/lib/api/backendOrigin.ts')], bundle: true, write: false, format: 'esm',
      define: { 'import.meta.env': JSON.stringify({ DEV: dev, VITE_BACKEND_ORIGIN: 'https://api.fixture.test' }) },
      plugins: [{ name: 'platform-fixture', setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/platform\/platform$/ }, () => ({ path: 'platform', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
          export const isCapacitor = () => globalThis.__backendOriginNative;
          export const isElectron = () => Boolean(globalThis.window?.electron);
        ` }));
      } }],
    });
    const source = `// fixture ${version++}\n${result.outputFiles[0].text}`;
    const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    run(api);
  } finally {
    if (previousWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = previousWindow;
    if (previousNative === undefined) delete (globalThis as any).__backendOriginNative;
    else (globalThis as any).__backendOriginNative = previousNative;
  }
}

test('Electron localhost development sends GraphQL through Vite instead of cross-origin', () =>
  withRenderer(true, 'http://localhost:8090/watch/210482', false, api => {
    expect(api.usesDevelopmentApiProxy()).toBe(true);
    expect(api.resolveApiV3Base()).toBe('http://localhost:8090/api/v3');
    expect(api.ANILIST_GRAPHQL_ENDPOINT).toBe('http://localhost:8090/api/v3/anilist/graphql');
  }));

test('packaged desktop windows retain their configured backend origin', () =>
  withRenderer(false, 'app://tatakai.me/index.html', false, api => {
    expect(api.usesDevelopmentApiProxy()).toBe(false);
    expect(api.ANILIST_GRAPHQL_ENDPOINT).toBe('https://api.fixture.test/api/v3/anilist/graphql');
  }));

test('Capacitor HTTPS asset origins use the remote backend even in development', () =>
  withRenderer(true, 'https://localhost/index.html', true, api => {
    expect(api.usesDevelopmentApiProxy()).toBe(false);
    expect(api.ANILIST_GRAPHQL_ENDPOINT).toBe('https://api.fixture.test/api/v3/anilist/graphql');
  }));
