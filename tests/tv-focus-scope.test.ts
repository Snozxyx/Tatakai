import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { installSpatialNavigation } from '../src/core/tv/spatialNavigation';

test('cached TV navigation respects portal dialogs, restored focus and enabled controls', async () => {
  const dom = new JSDOM('<main><a href="/first" data-x="0">First</a><a href="/second" data-x="240">Second</a><button disabled data-x="480">Later</button></main>');
  const injected = { document: dom.window.document, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window) };
  const previous = Object.fromEntries(Object.keys(injected).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () { const x = Number(this.dataset.x || 0); return { left: x, right: x + 200, top: 100, bottom: 150, width: 200, height: 50 } as DOMRect; };
  dom.window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()] as unknown as DOMRectList; };
  let cleanup = () => {};
  try {
    for (const [key, value] of Object.entries(injected)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    const root = dom.window.document.querySelector('main')!;
    root.querySelector('a')!.focus(); cleanup = installSpatialNavigation(root, () => { throw new Error('Dialog Back must belong to the dialog'); });
    const dialog = dom.window.document.createElement('aside');
    dialog.setAttribute('role', 'dialog'); dialog.innerHTML = '<button data-x="0">Confirm</button><button data-x="240">Cancel</button>';
    dom.window.document.body.append(dialog); await Promise.resolve();
    expect(dom.window.document.activeElement?.textContent).toBe('Confirm');
    dom.window.document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(dom.window.document.activeElement?.textContent).toBe('Cancel');
    const back = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    dom.window.document.activeElement!.dispatchEvent(back); expect(back.defaultPrevented).toBe(false);
    dialog.remove(); const second = root.querySelectorAll('a')[1]; second.focus(); await Promise.resolve();
    expect(dom.window.document.activeElement).toBe(second);
    const enabled = root.querySelector('button')!; enabled.disabled = false; await Promise.resolve();
    second.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(dom.window.document.activeElement).toBe(enabled);
  } finally {
    cleanup(); dom.window.close();
    for (const key of Object.keys(injected)) { if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else Reflect.deleteProperty(globalThis, key); }
  }
});
