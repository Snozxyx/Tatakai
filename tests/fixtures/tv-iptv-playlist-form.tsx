import { expect } from 'bun:test';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import { TVIPTVPlaylistForm, type TVIPTVPlaylistValues } from '../../src/components/tv/TVIPTVPlaylistForm';
import { installSpatialNavigation } from '../../src/core/tv/spatialNavigation';

const dom = new JSDOM('<main><div role="dialog" id="form"></div></main>', { url: 'https://tatakai.test' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = await import('react-dom/client');
const revealed: string[] = [];
dom.window.HTMLElement.prototype.scrollIntoView = function () { revealed.push(this.closest('label')?.firstChild?.textContent || this.textContent || ''); };
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  const inputs = [...dom.window.document.querySelectorAll('input')];
  const inputIndex = inputs.indexOf(this as HTMLInputElement);
  const type = this.closest('.tv-iptv-playlist-type');
  const right = this.textContent === 'Xtream Codes' || this.textContent?.includes('Cancel');
  const top = inputIndex >= 0 ? 40 + (inputIndex + (inputIndex > 0 ? 1 : 0)) * 80
    : type ? 120 : this.closest('.tv-iptv-playlist-actions') ? 40 + (inputs.length + 1) * 80 : 0;
  const left = right ? 220 : 0, width = inputIndex >= 0 ? 400 : 180;
  return { left, right: left + width, top, bottom: top + 50, width, height: 50 } as DOMRect;
};
dom.window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()] as unknown as DOMRectList; };
let imports = 0, cancellations = 0;
let setBusy!: React.Dispatch<React.SetStateAction<boolean>>;
function Harness() {
  const [values, setValues] = useState<TVIPTVPlaylistValues>({ name: 'Fixture', sourceKind: 'm3u', url: 'https://fixture.test/list.m3u', username: 'viewer', password: 'password', epgURL: '' });
  const [busy, updateBusy] = useState(false); setBusy = updateBusy;
  return <TVIPTVPlaylistForm values={values} onChange={setValues} onImport={() => imports++} onCancel={() => cancellations++} busy={busy} message="Fixture status" />;
}
const root = createRoot(dom.window.document.getElementById('form')!);
let cleanup = () => {};
const key = (value: string) => {
  const event = new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
  dom.window.document.activeElement!.dispatchEvent(event);
  return event;
};
try {
  await act(async () => root.render(<Harness />));
  const first = dom.window.document.querySelector('input')!;
  first.focus(); cleanup = installSpatialNavigation(dom.window.document.querySelector('main')!, () => { throw Error('Dialog should own Back'); });
  key('ArrowDown'); expect(dom.window.document.activeElement?.textContent).toBe('M3U');
  key('ArrowRight'); expect(dom.window.document.activeElement?.textContent).toBe('Xtream Codes');
  await act(async () => (dom.window.document.activeElement as HTMLButtonElement).click());
  expect(dom.window.document.querySelectorAll('input').length).toBe(5);
  expect(dom.window.document.querySelector('[aria-pressed="true"]')?.textContent).toBe('Xtream Codes');
  key('ArrowDown'); expect(dom.window.document.activeElement?.closest('label')?.textContent).toBe('Server URL');
  expect(key('ArrowLeft').defaultPrevented).toBe(false);
  expect(key('Enter').defaultPrevented).toBe(false);
  for (const label of ['Username', 'Password', 'XMLTV guide URL (optional)']) {
    key('ArrowDown'); expect(dom.window.document.activeElement?.closest('label')?.textContent).toBe(label);
  }
  key('ArrowDown'); expect(dom.window.document.activeElement?.textContent).toBe('Import');
  expect(revealed).toContain('Password'); expect(revealed).toContain('Import');
  await act(async () => (dom.window.document.activeElement as HTMLButtonElement).click()); expect(imports).toBe(1);
  key('ArrowUp'); expect(dom.window.document.activeElement?.closest('label')?.textContent).toBe('XMLTV guide URL (optional)');
  await act(async () => setBusy(true));
  const enabled = dom.window.document.querySelectorAll('button:not([disabled])');
  expect(enabled.length).toBe(1); expect(enabled[0].textContent).toBe('Cancel import');
  expect(dom.window.document.querySelector('.tv-iptv-playlist-footer [role="status"]')?.textContent).toBe('Fixture status');
  await act(async () => (enabled[0] as HTMLButtonElement).click()); expect(cancellations).toBe(1);
  await act(async () => setBusy(false));
  const m3u = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === 'M3U')!;
  m3u.focus(); await act(async () => m3u.click());
  expect(dom.window.document.querySelectorAll('input').length).toBe(3);
  key('ArrowDown'); expect(dom.window.document.activeElement?.closest('label')?.textContent).toBe('Playlist URL');
  key('ArrowDown'); expect(dom.window.document.activeElement?.closest('label')?.textContent).toBe('XMLTV guide URL (optional)');
  key('ArrowDown'); expect(dom.window.document.activeElement?.textContent).toBe('Import');
  console.log('TV_IPTV_REMOTE_IMPORT_CANCEL_OK');
} finally { cleanup(); await act(async () => root.unmount()); dom.window.close(); }
