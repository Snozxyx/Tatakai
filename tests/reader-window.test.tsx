import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { ReaderChapterWindow } from '../src/components/reader/ReaderChapterWindow';
import { ReaderVisiblePages } from '../src/pages/manga/hooks/useReaderVisiblePages';

test('twenty chapters keep only adjacent images mounted and restore earlier pages on backwards reading', async () => {
  const dom = new JSDOM('<div id="app"></div>');
  const original = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () { return { width: 800, height: 14000, top: 0, bottom: 14000, left: 0, right: 800, x: 0, y: 0, toJSON() {} }; };
  const root = createRoot(document.getElementById('app')!);
  const view = (count: number, active: number, width = '70%') => <>{Array.from({ length: count }, (_, chapter) =>
    <section key={chapter} data-ch={chapter}><ReaderChapterWindow active={Math.abs(chapter - active) <= 1} geometry={width} pageStyle={{ width }}>
      {Array.from({ length: 3 }, (_, page) => <div data-page={page + 1} key={page} style={{ width }}><img alt={`Chapter ${chapter} page ${page}`} /></div>)}
    </ReaderChapterWindow></section>)}</>;
  try {
    for (let chapter = 0; chapter < 20; chapter++) {
      await act(async () => root.render(view(chapter + 1, chapter)));
      expect(document.querySelectorAll('img').length).toBeLessThanOrEqual(9);
      expect(document.querySelectorAll('[data-page]')).toHaveLength((chapter + 1) * 3);
    }
    expect(document.querySelectorAll('[data-reader-page-placeholder]')).toHaveLength(54);
    await act(async () => root.render(view(20, 0, '90%')));
    expect(document.querySelector('[data-ch="0"] img')).not.toBeNull();
    expect(document.querySelector('[data-ch="19"] img')).toBeNull();
    expect(document.querySelector('[data-ch="19"] [data-page]')?.getAttribute('style')).toContain('90%');
  } finally { await act(async () => root.unmount()); dom.window.close(); Object.assign(globalThis, original); }
});

test('page visibility retains unchanged entries and tracks a point within a tall strip', () => {
  const dom = new JSDOM('<main><div id="one"></div><div id="two"></div></main>');
  const root = dom.window.document.querySelector('main')!;
  Object.defineProperty(root, 'clientHeight', { value: 600 });
  root.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  const one = dom.window.document.getElementById('one')!, two = dom.window.document.getElementById('two')!;
  one.getBoundingClientRect = () => ({ top: -5000, bottom: 200 }) as DOMRect;
  two.getBoundingClientRect = () => ({ top: 200, bottom: 14000 }) as DOMRect;
  const visible = new ReaderVisiblePages();
  visible.update([{ target: one, isIntersecting: true }] as unknown as IntersectionObserverEntry[]);
  visible.update([{ target: two, isIntersecting: true }] as unknown as IntersectionObserverEntry[]);
  expect(visible.elements.size).toBe(2);
  expect(visible.at(root)).toBe(two);
  visible.update([{ target: one, isIntersecting: false }] as unknown as IntersectionObserverEntry[]);
  expect(visible.at(root)).toBe(two);
  dom.window.close();
});
