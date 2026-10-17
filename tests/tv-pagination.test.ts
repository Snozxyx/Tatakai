import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { installTVPagination } from '../src/core/tv/pagination';

async function withPage(run: (dom: JSDOM, root: HTMLElement, button: HTMLButtonElement, move: (top: number) => void) => Promise<void>) {
  const dom = new JSDOM('<main class="tv-shell"><section><a class="tv-content-card" href="/old">Old card</a><div><button>Load more</button></div></section></main>');
  const injected = { document: dom.window.document, requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1; } };
  const previous = Object.fromEntries(Object.keys(injected).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(injected)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    dom.window.HTMLElement.prototype.scrollIntoView = () => {};
    const root = dom.window.document.querySelector('main')!, button = root.querySelector('button')!;
    let top = 3000;
    root.getBoundingClientRect = () => ({ top: 0, bottom: 720 } as DOMRect);
    Object.defineProperty(root, 'clientHeight', { value: 720 });
    button.getBoundingClientRect = () => ({ top, bottom: top + 50 } as DOMRect);
    await run(dom, root, button, value => { top = value; });
  } finally {
    dom.window.close();
    for (const key of Object.keys(injected)) { if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else Reflect.deleteProperty(globalThis, key); }
  }
}
test('TV scrolling prefetches without IntersectionObserver and deduplicates concurrent triggers', async () => {
  await withPage(async (dom, root, button, move) => {
    let requests = 0; let finish!: () => void;
    const loader = installTVPagination(button, { ready: () => true, load: () => { requests++; return new Promise<void>(resolve => { finish = resolve; }); } });
    expect(requests).toBe(0);
    move(900); root.dispatchEvent(new dom.window.Event('scroll'));
    root.dispatchEvent(new dom.window.Event('scroll'));
    expect(requests).toBe(1);
    finish(); await Promise.resolve(); await Promise.resolve(); loader.cleanup();
  });
});
test('remote focus advances into appended cards even when the final sentinel is removed', async () => {
  await withPage(async (dom, root, button) => {
    const loader = installTVPagination(button, { ready: () => true, load: async () => {
      const link = dom.window.document.createElement('a'); link.href = '/new'; link.textContent = 'New card'; link.className = 'tv-content-card';
      button.parentElement!.before(link); button.parentElement!.remove();
    } });
    button.focus(); await Promise.resolve(); await Promise.resolve();
    expect(dom.window.document.activeElement?.textContent).toBe('New card');
    expect(root.querySelectorAll('.tv-content-card').length).toBe(2);
    loader.cleanup();
  });
});
