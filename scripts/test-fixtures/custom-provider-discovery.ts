// Executed in a separate Bun process so these module mocks cannot affect other tests.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JSDOM } from 'jsdom';

let remote: any[], compatibility: any[], servers: any[], installed: any[], namespaces: any[];
let cachedNamespaces: any[] | undefined;
let remoteUnavailable = false, hostUnavailable = false;
let remoteReads = 0, compatibilityGate: Promise<void> | undefined;
const unused = () => { throw Error('Unexpected content request during discovery'); };
mock.module('../../src/core/extensions/remote/custom', () => ({
  listRemoteCustomSources: async () => {
    remoteReads++;
    if (remoteUnavailable) throw Error('IndexedDB unavailable');
    return remote;
  },
  remoteCustomRow: async () => null, remoteCustomHome: unused, remoteCustomCatalogPage: unused, remoteCustomSearch: unused,
  remoteCustomInfo: unused, remoteCustomWatch: unused, remoteCustomRead: unused,
}));
mock.module('../../src/core/extensions/compatibility/content', () => ({
  compatibilityCustomSources: async () => { await compatibilityGate; return compatibility; },
  compatibilityHome: unused, compatibilitySearch: unused, compatibilityInfo: unused,
  compatibilityWatch: unused, compatibilityRead: unused,
}));
mock.module('../../src/core/extensions/server/client', () => ({
  serverCustomSources: async () => servers,
  serverCustomHome: unused, serverCustomSearch: unused, serverCustomInfo: unused,
  serverCustomWatch: unused, serverCustomRead: unused,
}));
mock.module('../../src/core/extensions/compatibility/client', () => ({ isCompatibilityNamespace: () => false, compatibilityMutation: unused }));
mock.module('../../src/core/extensions/remote/media', () => ({ proxyCustomSources: unused }));
mock.module('../../src/hooks/media/useExtensionSourceStream', () => ({
  MOBILE_EXT_BASE: 'mobile://extensions',
  resolveExtensionApiBase: async (force = false) => {
    if (hostUnavailable) throw Error('Host not started');
    return { baseUrl: 'http://127.0.0.1:8099', namespaces: force ? namespaces : cachedNamespaces ?? namespaces };
  },
}));
mock.module('../../src/lib/platform/platform', () => ({ isCapacitor: () => false }));
const { listAllCustomSources, fetchCustomHome } = await import('../../src/core/content/custom-source-runtime');

const originalWindow = globalThis.window;
const source = { id: 'catalog', name: 'Installed provider', kind: 'watch' as const };
function reset() {
  remote = [];
  compatibility = [];
  servers = [];
  installed = [{ id: 'native-extension', apiServer: { namespace: 'native' }, customSources: [source] }];
  namespaces = [];
  cachedNamespaces = undefined;
  remoteUnavailable = false;
  hostUnavailable = false;
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {
    electron: { listInstalledExtensions: async () => installed },
  } });
}
function restoreWindow() {
  if (originalWindow) Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  else delete (globalThis as any).window;
}

try {
    reset();
    // A failed remote store must preserve all other installed ecosystems.
    remoteUnavailable = true;
    compatibility = [{ ...source, namespace: 'compat-sora' }];
    servers = [{ ...source, namespace: 'server-connected' }];
    const result = await listAllCustomSources(true);
    assert.deepEqual(result.map(row => row.namespace), ['compat-sora', 'server-connected', 'native']);
    assert.equal(result.find(row => row.namespace === 'native')?.extensionId, 'native-extension');

    reset();
    // Native IPC must cover an HTTP-host startup failure.
    hostUnavailable = true;
    assert.deepEqual(await listAllCustomSources(), [{ ...source, namespace: 'native', extensionId: 'native-extension' }]);

    reset();
    // Duplicate host and IPC advertisements must still yield one provider.
    namespaces = [{ namespace: 'native', extensionId: 'native-extension', customSources: [source] }];
    assert.equal((await listAllCustomSources()).length, 1);

    reset();
    // Stream-only extensions do not advertise custom browsing routes.
    installed = [{ id: 'streams', apiServer: { namespace: 'streams' }, capabilities: ['stream'] }];
    namespaces = [{ namespace: 'streams', routes: ['sources', 'stream'] }];
    assert.deepEqual(await listAllCustomSources(), []);

    reset();
    // The host can gain a namespace after an earlier successful empty lookup.
    installed = [];
    cachedNamespaces = [];
    namespaces = [{ namespace: 'native', extensionId: 'native-extension', customSources: [source] }];
    assert.deepEqual(await listAllCustomSources(), [{ ...source, namespace: 'native', extensionId: 'native-extension' }], 'discovery reused stale host namespaces');

    reset();
    // API metadata is optional for bundles called directly through desktop IPC.
    hostUnavailable = true;
    installed = [{ id: 'native-extension', customSources: [source] }];
    assert.deepEqual(await listAllCustomSources(), [{ ...source, namespace: 'native-extension', extensionId: 'native-extension' }], 'a custom source without HTTP API metadata disappeared');
    (globalThis.window as any).electron.invokeExtension = async (extensionId: string, method: string, args: unknown[]) => {
      assert.equal(extensionId, 'native-extension');
      assert.equal(method, 'customHome');
      assert.deepEqual(args, ['catalog']);
      return { success: true, result: { sections: [{ title: 'Native catalog', items: [] }] } };
    };
    assert.equal((await fetchCustomHome('native-extension', 'catalog')).sections[0].title, 'Native catalog');

    reset();
    hostUnavailable = true;
    installed[0].enabled = false;
    assert.deepEqual(await listAllCustomSources(), [], 'disabled native sources remained browsable');
    assert.deepEqual(await listAllCustomSources(true), [{ ...source, namespace: 'native', extensionId: 'native-extension', enabled: false }]);
    console.log('Custom provider discovery: 7 scenarios passed');
} finally {
  restoreWindow();
}

// Exercise the real directory and its install listener, with other page UI stubbed.
const children = ({ children }: any) => React.createElement('div', null, children);
const empty = () => null;
let showAdultEverywhere = false;
const openedSettings: unknown[][] = [];
for (const name of ['Header', 'Sidebar', 'MobileNav', 'Background']) {
  mock.module(`../../src/components/layout/${name}`, () => ({ [name]: empty }));
}
mock.module('../../src/components/ui/button', () => ({ Button: ({ asChild, variant, size, ...props }: any) => React.createElement(asChild ? 'div' : 'button', props) }));
mock.module('../../src/components/ui/alert', () => ({ Alert: children, AlertDescription: children }));
mock.module('../../src/components/extensions/ExtensionLogo', () => ({ ExtensionLogo: empty }));
mock.module('../../src/hooks/ui/useIsNativeApp', () => ({ useIsDesktopApp: () => true }));
mock.module('../../src/hooks/user/useContentSafetySettings', () => ({ useContentSafetySettings: () => ({ settings: { showAdultEverywhere } }) }));
mock.module('../../src/contexts/SettingsModalContext', () => ({ useSettingsModal: () => ({ openSettings: (...args: unknown[]) => openedSettings.push(args) }) }));
mock.module('../../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
mock.module('../../src/core/db/tatakai-db', () => ({ db: {} }));
mock.module('../../src/core/extensions/compatibility/library', () => ({ libraryKey: unused }));
mock.module('../../src/core/content/custom-catalog', () => ({ catalogKind: (source: any) => source.kind === 'watch' ? 'anime' : 'manga' }));
mock.module('../../src/lib/utils', () => ({ cn: (...values: any[]) => values.filter(value => typeof value === 'string').join(' ') }));
mock.module('react-router-dom', () => ({
  Link: children,
  useNavigate: () => () => {},
  useSearchParams: () => [new URLSearchParams(), () => {}],
}));
const jsx = (type: any, props: any, key?: string) => React.createElement(type, { ...props, key });
mock.module('../../src/lib/media-jsx/jsx-runtime', () => ({ jsx, jsxs: jsx, Fragment: React.Fragment }));
const { default: CustomProvidersPage } = await import('../../src/pages/custom/CustomProvidersPage');
const { useCustomSources } = await import('../../src/hooks/api/useCustomSource');
function CustomSourcesConsumer() {
  const result = useCustomSources();
  return React.createElement('div', null, result.data?.map(row => row.name).join(', '));
}

async function installRefreshCheck(initialLookupPending: boolean, useHook: boolean, event: string) {
  reset();
  installed = [];
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  const originalDocument = globalThis.document;
  const originalAct = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const queryKey = [useHook ? 'custom-sources' : 'custom-provider-inventory'];
  if (!initialLookupPending) client.setQueryData(queryKey, []);
  let release: (() => void) | undefined;
  if (initialLookupPending) compatibilityGate = new Promise<void>(resolve => release = resolve);
  remoteReads = 0;
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async () => {
      root.render(React.createElement(QueryClientProvider, { client }, React.createElement(useHook ? CustomSourcesConsumer : CustomProvidersPage)));
    });
    if (initialLookupPending) assert.equal(remoteReads, 1, 'initial lookup did not capture the pre-install inventory');
    const newlyInstalled = { ...source, namespace: 'stremio-new', extensionId: 'stremio-new' };
    remote = [newlyInstalled];
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.CustomEvent(event));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await act(async () => {
      release?.();
      await new Promise(resolve => setTimeout(resolve, 25));
    });
    assert.deepEqual(client.getQueryData(queryKey), [newlyInstalled], `${queryKey[0]}: ${event} ${initialLookupPending
      ? 'cached the pre-install inventory during the first lookup'
      : 'did not refresh the cached empty inventory'}`);
    assert.ok(dom.window.document.body.textContent?.includes(source.name), 'the installed provider was not displayed');
  } finally {
    release?.();
    compatibilityGate = undefined;
    await act(async () => root.unmount());
    client.clear();
    Object.assign(globalThis, { document: originalDocument, IS_REACT_ACT_ENVIRONMENT: originalAct });
    restoreWindow();
    dom.window.close();
  }
}
for (const event of ['tatakai:extension-installed', 'tatakai-extensions-changed']) {
  for (const useHook of [false, true]) {
    await installRefreshCheck(false, useHook, event);
    await installRefreshCheck(true, useHook, event);
  }
}
console.log('Custom provider directory and hooks: cached and pending desktop/mobile install refresh passed');

// Mature providers are installed but filtered; the empty page must explain why.
reset();
installed = [];
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
const originalDocument = globalThis.document;
const originalAct = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const matureProviders = [
  { ...source, namespace: 'hentaidb', name: 'HentaiDB', nsfw: true },
  { ...source, id: 'comics', namespace: 'hentaidb', name: 'HentaiDB Comics', kind: 'read', nsfw: true },
];
client.setQueryData(['custom-provider-inventory'], matureProviders);
const root = createRoot(dom.window.document.getElementById('root')!);
const render = () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(CustomProvidersPage)));
try {
  await act(async () => render());
  assert.equal(dom.window.document.querySelectorAll('article').length, 0, 'mature providers leaked into safe discovery');
  assert.ok(dom.window.document.body.textContent?.includes('Providers hidden by content settings'), 'hidden installed sources were reported as uninstalled');
  const visibilityButton = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent?.includes('Content visibility settings'));
  assert.ok(visibilityButton, 'missing a way to review the setting hiding installed providers');
  await act(async () => visibilityButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  assert.deepEqual(openedSettings.at(-1), ['privacy', 'mature-content-controls']);
  showAdultEverywhere = true;
  await act(async () => render());
  assert.equal(dom.window.document.querySelectorAll('article').length, 2, 'enabling mature discovery did not reveal installed providers');
  assert.ok(!dom.window.document.body.textContent?.includes('Providers hidden by content settings'), 'visibility notice remained after providers became visible');
  console.log('Custom provider visibility: hidden-state explanation, settings link, and reveal passed');
} finally {
  showAdultEverywhere = false;
  await act(async () => root.unmount());
  client.clear();
  Object.assign(globalThis, { document: originalDocument, IS_REACT_ACT_ENVIRONMENT: originalAct });
  restoreWindow();
  dom.window.close();
}
