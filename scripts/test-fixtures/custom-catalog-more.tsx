import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import React, { act, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.me/' });
Object.defineProperties(globalThis, { window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true }, navigator: { value: dom.window.navigator, configurable: true }, IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true } });
const calls: Array<[string, number]> = [];
let release: (value: any) => void, failed = false, lastSignal: AbortSignal;
mock.module('../../src/core/content/custom-source-runtime', () => ({ fetchCustomCatalogPage: async (_ns: string, _type: string, id: string, skip: number, signal: AbortSignal) => {
  calls.push([id, skip]); lastSignal = signal;
  if (id === 'B') return { items: [], nextSkip: null };
  if (skip === 23) { if (!failed) { failed = true; throw Error('Temporary catalog failure'); } return { items: [{ id: 'a1', title: 'Existing' }], nextSkip: 24 }; }
  return new Promise(resolve => { release = resolve; });
} }));
mock.module('../../src/hooks/user/useContentSafetySettings', () => ({ useContentSafetySettings: () => ({ settings: { showAdultEverywhere: false } }) }));
mock.module('../../src/lib/contentSafety', () => ({ isExplicitExtensionContent: (item: any) => !!item.nsfw }));
mock.module('../../src/core/tv/device', () => ({ isTV: () => true }));
mock.module('../../src/lib/uiI18n', () => ({ default: { t: (key: string, params: any) => params?.name || key } }));
mock.module('../../src/components/ui/button', () => ({ Button: forwardRef<HTMLButtonElement, any>((props, ref) => <button {...props} ref={ref} />) }));
const { CustomCatalogMore } = await import('../../src/components/extensions/CustomCatalogMore');
const root = createRoot(dom.window.document.getElementById('root')!);
function renderSection(id: string) {
  return <CustomCatalogMore namespace="stremio-local" sourceId="movie" section={{ title: id, items: [{ id: id === 'A' ? 'a1' : 'b1', title: 'Existing' }], pagination: { catalogId: id, nextSkip: id === 'A' ? 20 : 3 } }}>
    {items => <>{items.map(item => <a key={item.id} href={`/x/stremio-local/movie/info/${item.id}`} data-card={item.id}>{item.title}</a>)}</>}
  </CustomCatalogMore>;
}
await act(async () => root.render(<>{renderSection('A')}{renderSection('B')}</>));
const buttonA = dom.window.document.querySelector<HTMLButtonElement>('[data-tv-key$="-A"]')!;
const buttonB = dom.window.document.querySelector<HTMLButtonElement>('[data-tv-key$="-B"]')!;
buttonA.focus();
await act(async () => buttonA.click());
assert.equal(buttonA.disabled, false);
assert.equal(buttonA.getAttribute('aria-busy'), 'true');
assert.equal(dom.window.document.activeElement, buttonA);
await act(async () => release({ items: [{ id: 'a1', title: 'Duplicate' }, { id: 'a2', title: 'New' }, { id: 'adult', title: 'Hidden', nsfw: true }], nextSkip: 23 }));
assert.equal(dom.window.document.activeElement?.getAttribute('data-card'), 'a2');
assert.equal(dom.window.document.querySelector('[data-card="adult"]'), null);
buttonB.focus();
await act(async () => buttonB.click());
assert.equal(dom.window.document.activeElement?.getAttribute('data-card'), 'b1');
assert.equal(dom.window.document.querySelector('[data-tv-key$="-B"]'), null);
buttonA.focus();
await act(async () => buttonA.click());
assert.equal(dom.window.document.querySelector('[role="alert"]')?.textContent, 'Temporary catalog failure');
assert.equal(dom.window.document.activeElement, buttonA);
await act(async () => buttonA.click());
assert.equal(dom.window.document.querySelector('[data-tv-key$="-A"]'), null);
assert.deepEqual(calls, [['A', 20], ['B', 3], ['A', 23], ['A', 23]]);
await act(async () => root.render(<React.Fragment key="new">{renderSection('A')}</React.Fragment>));
await act(async () => dom.window.document.querySelector<HTMLButtonElement>('button')!.click());
await act(async () => root.unmount());
assert.equal(lastSignal.aborted, true);
dom.window.close();
console.log('Custom catalog controls: independent cursors, retry, adult filtering, focus and cancellation passed');
