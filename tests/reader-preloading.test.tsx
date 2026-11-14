import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { ReaderPagedImages } from '../src/components/reader/ReaderPagedImages';
import { DEFAULT_SETTINGS } from '../src/lib/reader/settings';
import { releaseInactiveReaderImages } from '../src/lib/reader/imageResources';
import { prepareReaderImages } from '../src/lib/reader/prepareImages';

async function withReader(run: (root: ReturnType<typeof createRoot>) => Promise<void>) {
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://reader.test/' });
  const originals = {
    window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage,
    IntersectionObserver: globalThis.IntersectionObserver, CustomEvent: globalThis.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT, fetch: globalThis.fetch,
  };
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true,
    // No visibility callbacks: preloading must work before scrolling.
    IntersectionObserver: class { observe() {} disconnect() {} },
  });
  const root = createRoot(document.getElementById('app')!);
  try { await run(root); }
  finally {
    await act(async () => root.unmount());
    releaseInactiveReaderImages();
    dom.window.close();
    Object.assign(globalThis, originals);
  }
}
const pages = (chapter: string, count = 24) => Array.from({ length: count }, (_, index) => ({
  pageNumber: index + 1, imageUrl: `https://cdn.example/${chapter}/${index + 1}.png`, width: 800, height: 1200,
}));
const full = { ...DEFAULT_SETTINGS, readingMode: 'paged' as const, preloading: 'full' as const };

test('Full assigns every image before scrolling, keeps loaded images on page turns, and works in the next chapter', () => withReader(async root => {
  const chapter = pages('one');
  await act(async () => root.render(<ReaderPagedImages pages={chapter} chapterScope="one" pageIndex={0}
    settings={full} style={{ width: '70%' }} touchOrNative={false} />));
  const images = [...document.querySelectorAll<HTMLImageElement>('img')];
  expect(images).toHaveLength(24);
  expect(images.every(image => image.getAttribute('loading') === 'eager')).toBe(true);
  expect(images[23].getAttribute('src')).toBe(chapter[23].imageUrl);
  expect(images[0].closest('[aria-hidden]')).toBeNull();
  expect(images[23].closest<HTMLElement>('[aria-hidden]')?.style.display).toBe('none');
  await act(async () => { images.forEach(image => image.dispatchEvent(new window.Event('load'))); });
  await act(async () => root.render(<ReaderPagedImages pages={chapter} chapterScope="one" pageIndex={23}
    settings={full} style={{ width: '70%' }} touchOrNative={false} />));
  expect(document.querySelectorAll('img')[23]).toBe(images[23]);
  expect(images[23].closest('[aria-hidden]')).toBeNull();
  expect(images[23].closest('[data-page]')?.querySelector('[aria-hidden]')).toBeNull();
  await act(async () => root.render(<ReaderPagedImages pages={pages('two')} chapterScope="two" pageIndex={0}
    settings={full} style={{ width: '70%' }} touchOrNative={false} />));
  expect(document.querySelectorAll('img')).toHaveLength(24);
  expect(document.querySelectorAll('img')[23].getAttribute('src')).toContain('/two/24.png');
}));

test('partial paged preloading loads the upcoming window and preserves double-page display', () => withReader(async root => {
  const settings = { ...full, preloading: 'partial' as const, doublePage: true };
  await act(async () => root.render(<ReaderPagedImages pages={pages('one')} chapterScope="one" pageIndex={10}
    settings={settings} style={{ width: '70%' }} touchOrNative={false} />));
  expect(document.querySelectorAll('img')).toHaveLength(7);
  expect(document.querySelectorAll('[data-page]')[0].getAttribute('data-page')).toBe('8');
  expect([...document.querySelectorAll('[data-page]')].filter(slot => !slot.closest('[aria-hidden]'))
    .map(slot => slot.getAttribute('data-page'))).toEqual(['11', '12']);
}));

test('Full blob preloading prioritizes the saved page, stays bounded, and does not refetch on page turns', () => withReader(async root => {
  const requests: string[] = [];
  let active = 0, peak = 0;
  globalThis.fetch = (async input => {
    requests.push(String(input));
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    active--;
    return new Response(new Blob(['image bytes'], { type: 'image/png' }));
  }) as typeof fetch;
  const chapter = pages('one');
  const settings = { ...full, loadingMethod: 'blob' as const };
  await act(async () => root.render(<ReaderPagedImages pages={chapter} chapterScope="one" pageIndex={15}
    settings={settings} style={{ width: '70%' }} touchOrNative={false} />));
  expect(requests).toHaveLength(24);
  expect(requests[0]).toBe(chapter[15].imageUrl);
  expect(peak).toBeLessThanOrEqual(3);
  const futureImage = document.querySelector('[data-page="24"] img');
  expect(futureImage?.getAttribute('src')).toStartWith('blob:');
  await act(async () => root.render(<ReaderPagedImages pages={chapter} chapterScope="one" pageIndex={23}
    settings={settings} style={{ width: '70%' }} touchOrNative={false} />));
  expect(requests).toHaveLength(24);
  expect(document.querySelector('[data-page="24"] img')).toBe(futureImage);
}));

test('changing chapters cancels queued old pages so the new chapter starts immediately', () => withReader(async root => {
  const requests: string[] = [];
  globalThis.fetch = ((input, init) => {
    const url = String(input);
    requests.push(url);
    if (url.includes('/two/')) return Promise.resolve(new Response(new Blob(['image bytes'], { type: 'image/png' })));
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
    });
  }) as typeof fetch;
  const settings = { ...full, loadingMethod: 'blob' as const };
  await act(async () => root.render(<ReaderPagedImages pages={pages('one')} chapterScope="one" pageIndex={0}
    settings={settings} style={{ width: '70%' }} touchOrNative={false} />));
  expect(requests).toHaveLength(3);
  await act(async () => root.render(<ReaderPagedImages pages={pages('two', 2)} chapterScope="two" pageIndex={0}
    settings={settings} style={{ width: '70%' }} touchOrNative={false} />));
  expect(requests.filter(url => url.includes('/one/'))).toHaveLength(3);
  expect(requests.filter(url => url.includes('/two/'))).toHaveLength(2);
  expect(document.querySelectorAll('img')).toHaveLength(2);
}));

test('next-chapter preparation fetches every image and navigation adopts its blobs', () => withReader(async root => {
  const requests: string[] = [];
  globalThis.fetch = (async input => {
    requests.push(String(input));
    return new Response(new Blob(['prepared'], { type: 'image/png' }));
  }) as typeof fetch;
  // JSDOM does not load images; emulate successful browser image readiness.
  const prototype = window.HTMLImageElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'src')!;
  Object.defineProperty(prototype, 'src', { configurable: true, get: descriptor.get,
    set(value) { descriptor.set!.call(this, value); queueMicrotask(() => this.dispatchEvent(new window.Event('load'))); } });
  const next = pages('prepared-next');
  const controller = new AbortController();
  const release = prepareReaderImages(next, { scope: 'next', mode: 'blob', signal: controller.signal });
  for (let attempt = 0; requests.length < next.length && attempt < 50; attempt++) await new Promise(resolve => setTimeout(resolve, 0));
  expect(requests).toHaveLength(24);
  await act(async () => root.render(<ReaderPagedImages pages={next} chapterScope="next" resourceScope="next" pageIndex={0}
    settings={{ ...full, loadingMethod: 'blob' }} style={{ width: '70%' }} touchOrNative={false} />));
  controller.abort(); release();
  expect(requests).toHaveLength(24);
  expect([...document.querySelectorAll('img')].every(image => image.src.startsWith('blob:'))).toBe(true);
  Object.defineProperty(prototype, 'src', descriptor);
}));
