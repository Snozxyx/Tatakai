import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import React, { act, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

// The fixture runs in a separate Bun process, so its UI/native mocks cannot leak.
mock.module('../../src/lib/uiI18n', () => ({ default: { t: (key: string) => key } }));
mock.module('../../src/hooks/ui/useUiTranslation', () => ({ useUiTranslation() {} }));
mock.module('../../src/hooks/ui/useIsNativeApp', () => ({ useIsNativeApp: () => true }));
mock.module('../../src/core/tv/device', () => ({ isTV: () => false }));
mock.module('sonner', () => ({ toast: { success() {}, error() {} } }));
mock.module('../../src/components/ui/button', () => ({
  Button: forwardRef<HTMLButtonElement, any>(({ variant, size, children, ...props }, ref) =>
    <button {...props} ref={ref}>{children}</button>),
}));
mock.module('../../src/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => open ? <>{children}</> : null,
  DialogContent: ({ children }: any) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));
mock.module('../../src/components/ui/tabs', () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, disabled }: any) => <button disabled={disabled}>{children}</button>,
  TabsContent: ({ value, children }: any) => value === 'package' ? <div>{children}</div> : null,
}));
mock.module('../../src/components/extensions/CompatibilityExtensionsPanel', () => ({ CompatibilityExtensionsPanel: () => null }));
mock.module('../../src/core/extensions/marketplace-client', () => ({ downloadExtensionKai: async () => { throw Error('Unexpected package download'); } }));
mock.module('../../src/core/extensions/sora/repository', () => ({ isSoraRepositoryMetadata: () => false }));
mock.module('../../src/core/extensions/mangayomi/repository', () => ({ isMangayomiRepositoryMetadata: () => false }));
mock.module('../../src/core/extensions/compatibility/repository-metadata', () => ({ isAniyomiRepositoryMetadata: () => false }));

const fetchCalls: string[] = [];
let fetchManifest: (url: string) => Promise<Record<string, any>> = async () => { throw Error('Unexpected manifest download'); };
mock.module('../../src/core/extensions/remote/transport', () => ({
  extensionFetch: async (url: string) => {
    fetchCalls.push(url);
    const manifest = await fetchManifest(url);
    return { ok: true, status: 200, text: async () => JSON.stringify(manifest) };
  },
}));
const configureCalls: any[] = [];
let configurationResult: (input: any) => Promise<any> = async () => null;
mock.module('../../src/core/extensions/remote/configuration', () => ({
  addonConfiguration: { start: async (input: any) => { configureCalls.push(input); return configurationResult(input); } },
}));
const installCalls: any[][] = [];
let installedRows: any[] = [];
mock.module('../../src/core/extensions/remote/installed', () => ({
  listRemoteExtensions: async () => installedRows,
  installRemoteExtension: async (...args: any[]) => {
    installCalls.push(args);
    return { id: args[2] || 'stremio-new', enabled: installedRows.find(row => row.id === args[2])?.enabled ?? true };
  },
}));
const { AddExtensionModal } = await import('../../src/components/extensions/SideloadExtensionModal');

const originalURL = 'https://addon.test/manifest.json';
const configuredURL = 'https://addon.test/YWJj==/%2Ftoken/manifest.json?token=a+b%2Fc';
const addon = {
  id: 'fixture.addon', name: 'Original addon', version: '1.0', description: 'Original configuration',
  types: ['series'], resources: ['stream'], behaviorHints: { configurable: true, configurationRequired: true },
};
const configuredAddon = {
  ...addon, name: 'Configured addon', description: 'Chosen configuration',
  behaviorHints: { configurable: true, configurationRequired: false },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function scenario(run: (fixture: {
  render(props: Record<string, any>): Promise<void>;
  click(key: string): Promise<void>;
  button(key: string): HTMLButtonElement;
  document: Document;
  closed(): number;
}) => Promise<void>) {
  fetchCalls.length = configureCalls.length = installCalls.length = 0;
  installedRows = [];
  fetchManifest = async () => { throw Error('Unexpected manifest download'); };
  configurationResult = async () => null;
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
  const globals = {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement, CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const root = createRoot(dom.window.document.getElementById('root')!);
  let closes = 0;
  const onClose = () => { closes += 1; };
  const button = (key: string) => {
    const result = dom.window.document.querySelector<HTMLButtonElement>(`[data-tv-key="extension-${key}"]`);
    assert.ok(result, `Missing ${key} control`);
    return result;
  };
  try {
    await run({
      render: async props => { await act(async () => root.render(<AddExtensionModal isOpen onClose={onClose} {...props} />)); },
      click: async key => { await act(async () => button(key).click()); },
      button, document: dom.window.document, closed: () => closes,
    });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

await scenario(async ({ render, document, button }) => {
  const oldRead = deferred<Record<string, any>>();
  fetchManifest = () => oldRead.promise;
  await render({ initialUrl: originalURL, expectedAddonId: addon.id });
  assert.deepEqual(fetchCalls, [originalURL]);
  await render({ initialUrl: configuredURL, initialManifest: configuredAddon, expectedAddonId: addon.id });
  assert.equal(document.querySelector<HTMLInputElement>('[data-tv-key="extension-manifest-url"]')!.value, configuredURL);
  assert.ok(document.body.textContent!.includes('Configured addon'));
  assert.equal(button('install').disabled, false);
  await act(async () => oldRead.resolve(addon));
  assert.ok(document.body.textContent!.includes('Configured addon'));
  assert.ok(!document.body.textContent!.includes('Original addon'));
  assert.equal(document.querySelector<HTMLInputElement>('[data-tv-key="extension-manifest-url"]')!.value, configuredURL);
  assert.equal(button('install').disabled, false);
  assert.deepEqual(fetchCalls, [originalURL], 'Validated restored previews should not be downloaded again');
});

await scenario(async ({ render, document, button }) => {
  await render({ initialUrl: configuredURL, initialManifest: { ...configuredAddon, id: 'different.addon' }, expectedAddonId: addon.id });
  assert.equal(document.querySelector('[role="alert"]')!.textContent, 'extensionSetup.wrongAddon');
  assert.equal(button('install').disabled, true);
  assert.equal(document.querySelector('[data-tv-key="extension-configure"]'), null);
  assert.equal(installCalls.length, 0);
});

await scenario(async ({ render, click, document, button }) => {
  const configured = deferred<any>();
  configurationResult = () => configured.promise;
  await render({ initialUrl: originalURL, initialManifest: addon, expectedAddonId: addon.id });
  await click('configure');
  assert.equal(button('configure').disabled, true);
  await act(async () => configured.resolve(null));
  assert.ok(document.body.textContent!.includes('Original addon'));
  assert.equal(document.querySelector<HTMLInputElement>('[data-tv-key="extension-manifest-url"]')!.value, originalURL);
  assert.equal(button('configure').disabled, false);
  assert.equal(button('install').disabled, true, 'A cancelled required configuration must remain uninstalled');
  assert.equal(document.querySelector('[role="alert"]'), null);
  assert.equal(installCalls.length, 0);
  assert.deepEqual(configureCalls, [{ manifestUrl: originalURL, expectedAddonId: addon.id, existingId: undefined }]);
});

await scenario(async ({ render, click, document, button, closed }) => {
  configurationResult = async input => ({ ...input, requestId: 'configured', manifestUrl: configuredURL, manifest: configuredAddon });
  await render({ initialUrl: originalURL, initialManifest: addon, expectedAddonId: addon.id });
  await click('configure');
  assert.ok(document.body.textContent!.includes('Configured addon'));
  assert.equal(button('install').disabled, false);
  assert.equal(button('install').textContent, 'app.install_fd6c3ebf');
  assert.equal(installCalls.length, 0, 'Finishing native configuration must only preview the result');
  await click('install');
  assert.equal(installCalls.length, 1);
  assert.equal(installCalls[0][0].id, addon.id);
  assert.equal(installCalls[0][1], configuredURL);
  assert.equal(installCalls[0][2], undefined);
  assert.equal(closed(), 1);
});

await scenario(async ({ render, click, button, closed, document }) => {
  const existingId = 'stremio-existing';
  const preferences = { language: 'id' };
  installedRows = [{ id: existingId, manifest: addon, preferences, enabled: false }];
  configurationResult = async input => ({ ...input, requestId: 'reconfigured', manifestUrl: configuredURL, manifest: configuredAddon });
  await render({ initialUrl: originalURL, initialManifest: addon, existingId, expectedAddonId: addon.id });
  await click('configure');
  assert.equal(button('install').textContent, 'extensionSetup.saveConfiguration');
  assert.equal(button('install').disabled, false);
  assert.equal(installCalls.length, 0);
  await click('install');
  assert.equal(installCalls.length, 1);
  assert.deepEqual(installCalls[0], [configuredAddon, configuredURL, existingId, preferences]);
  assert.equal(JSON.parse(document.defaultView!.localStorage.getItem('tatakai_extension_manifests')!)[0].enabled, false);
  assert.equal(configureCalls[0].existingId, existingId);
  assert.equal(closed(), 1);
});

console.log('ADD_EXTENSION_PREVIEW_CONFIGURATION_OK');
