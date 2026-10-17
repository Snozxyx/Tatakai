import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { installSpatialNavigation } from '../src/core/tv/spatialNavigation';

function withProfile(markup: string, run: (dom: JSDOM, root: HTMLElement) => void) {
  const dom = new JSDOM(`<main><section data-tv-profile>${markup}</section></main>`);
  const injected = {
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    matchMedia: () => ({ matches: true }),
  };
  const previous = Object.fromEntries(Object.keys(injected).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const root = dom.window.document.querySelector('main')!;
  let cleanup = () => {};
  try {
    for (const [key, value] of Object.entries(injected)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    dom.window.HTMLElement.prototype.scrollIntoView = () => {};
    dom.window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()] as unknown as DOMRectList; };
    root.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 } as DOMRect);
    Object.defineProperty(root, 'clientHeight', { value: 720 });
    Object.defineProperty(root, 'scrollHeight', { value: 2000 });
    root.scrollTo = (options: ScrollToOptions | number) => { if (typeof options === 'object') root.scrollTop = options.top || 0; };
    const controls = [...root.querySelectorAll<HTMLElement>('[data-position]')];
    for (const control of controls) {
      const [x, y] = control.dataset.position!.split(',').map(Number);
      control.getBoundingClientRect = () => ({ left: x, right: x + 100, top: y - root.scrollTop, bottom: y + 50 - root.scrollTop, width: 100, height: 50 } as DOMRect);
    }
    controls[0].focus();
    cleanup = installSpatialNavigation(root, () => {});
    run(dom, root);
  } finally {
    cleanup(); dom.window.close();
    for (const key of Object.keys(injected)) { if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else Reflect.deleteProperty(globalThis, key); }
  }
}
const press = (dom: JSDOM, key: string) => dom.window.document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

test('profile widget role buttons and vault links participate in D-Pad navigation without double activation', () => {
  withProfile('<div role="button" tabindex="0" data-position="0,100">See more</div><button disabled data-position="120,100">Unavailable</button><div role="link" tabindex="0" data-position="240,100">Saved comment</div>', (dom, root) => {
    let opened = 0;
    const button = root.querySelector('[role=button]')!;
    button.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Enter') opened++; });
    press(dom, 'Enter');
    expect(opened).toBe(1);
    press(dom, 'ArrowRight');
    expect(dom.window.document.activeElement?.getAttribute('role')).toBe('link');
    press(dom, 'ArrowLeft');
    expect(dom.window.document.activeElement).toBe(button);
  });
});

test('profile remote scrolls through analytics before focusing an offscreen action and can reach the page bottom', () => {
  withProfile('<button data-position="0,100">Overview</button><button data-position="0,1100">Calendar</button>', (dom, root) => {
    const [overview, calendar] = root.querySelectorAll('button');
    press(dom, 'ArrowDown');
    expect(root.scrollTop).toBe(468);
    expect(dom.window.document.activeElement).toBe(overview);
    press(dom, 'ArrowDown');
    expect(dom.window.document.activeElement).toBe(calendar);
    press(dom, 'ArrowDown');
    expect(root.scrollTop).toBe(936);
    press(dom, 'ArrowDown');
    expect(root.scrollTop).toBe(1280);
  });
});
