import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { installSpatialNavigation } from '../src/core/tv/spatialNavigation';
test('remote Select toggles a native checkbox and leaves text input Enter to the keyboard', () => {
  const dom = new JSDOM('<main><input type="checkbox"><input type="text"></main>');
  const injected = { document: dom.window.document, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window) };
  const previous = Object.fromEntries(Object.keys(injected).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let cleanup = () => {};
  try {
    for (const [key, value] of Object.entries(injected)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    const root = dom.window.document.querySelector('main')!;
    const checkbox = root.querySelector('input[type=checkbox]') as HTMLInputElement;
    const text = root.querySelector('input[type=text]') as HTMLInputElement;
    checkbox.focus(); cleanup = installSpatialNavigation(root, () => {});
    checkbox.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(checkbox.checked).toBe(true);
    text.focus();
    const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    text.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(dom.window.document.activeElement).toBe(text);
  } finally {
    cleanup(); dom.window.close();
    for (const key of Object.keys(injected)) { if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else Reflect.deleteProperty(globalThis, key); }
  }
});
