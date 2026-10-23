import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { installSpatialNavigation } from '../src/core/tv/spatialNavigation';

test('moving along a TV rail does not remeasure or restyle the entire catalogue', () => {
  const dom = new JSDOM(`<main>${Array.from({ length: 10 }, (_, row) => `<section class="tv-rail-items">${Array.from({ length: 30 }, (_, col) => `<a href="/${row}/${col}" data-row="${row}" data-col="${col}">Title</a>`).join('')}</section>`).join('')}</main>`);
  let styles = 0, geometry = 0, writes = 0;
  const injected = {
    document: dom.window.document, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: (element: Element) => { styles++; return dom.window.getComputedStyle(element); },
    matchMedia: () => ({ matches: false }),
  };
  const previous = Object.fromEntries(Object.keys(injected).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const tabIndex = Object.getOwnPropertyDescriptor(dom.window.HTMLElement.prototype, 'tabIndex')!;
  Object.defineProperty(dom.window.HTMLElement.prototype, 'tabIndex', { ...tabIndex, set(value) { writes++; tabIndex.set!.call(this, value); } });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    geometry++; const x = Number(this.dataset.col || 0) * 220, y = Number(this.dataset.row || 0) * 220;
    return { left: x, right: x + 200, top: y, bottom: y + 180, width: 200, height: 180 } as DOMRect;
  };
  dom.window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()] as unknown as DOMRectList; };
  let cleanup = () => {};
  try {
    for (const [key, value] of Object.entries(injected)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    const root = dom.window.document.querySelector('main')!;
    root.querySelector('a')!.focus();
    cleanup = installSpatialNavigation(root, () => {});
    styles = geometry = writes = 0;
    for (let i = 0; i < 8; i++) dom.window.document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    console.log(`TV rail: ${styles} style reads, ${geometry} geometry reads, ${writes} tabindex writes for 8 moves / 300 cards`);
    expect((dom.window.document.activeElement as HTMLElement).dataset.col).toBe('8');
    expect(styles).toBeLessThan(80);
    expect(geometry).toBeLessThan(80);
    expect(writes).toBeLessThanOrEqual(24);
  } finally {
    cleanup(); dom.window.close();
    for (const key of Object.keys(injected)) { if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else Reflect.deleteProperty(globalThis, key); }
  }
});
