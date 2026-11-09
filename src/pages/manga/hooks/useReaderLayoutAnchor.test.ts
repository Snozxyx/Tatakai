import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { captureReaderAnchor, restoreReaderAnchor } from './useReaderLayoutAnchor';

test('stays at the chapter start while short placeholders expand into full pages', () => {
  const dom = new JSDOM('<div id="root"><div data-page="1"></div><div data-page="2"></div></div>');
  const root = dom.window.document.getElementById('root')!;
  const pages = [...root.children] as HTMLElement[];
  let height = 320;
  Object.defineProperty(root, 'clientHeight', { value: 1000 });
  root.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
  pages.forEach((page, index) => {
    page.getBoundingClientRect = () => ({
      top: 100 + index * height - root.scrollTop,
      bottom: 100 + (index + 1) * height - root.scrollTop,
      height,
    } as DOMRect);
  });
  try {
    const anchor = captureReaderAnchor(root);
    height = 1400;
    restoreReaderAnchor(root, anchor);
    expect(root.scrollTop).toBe(0);
    const settledAnchor = captureReaderAnchor(root);
    height = 1800;
    restoreReaderAnchor(root, settledAnchor);
    expect(root.scrollTop).toBe(0);
  } finally {
    dom.window.close();
  }
});

test('keeps the same point inside a long page through zoom and fullscreen resize', () => {
  const dom = new JSDOM('<div id="root"><img data-page="4" /></div>');
  const root = dom.window.document.getElementById('root')!;
  const page = root.firstElementChild as HTMLElement;
  let height = 5000, viewport = 1000;
  Object.defineProperty(root, 'clientHeight', { get: () => viewport });
  root.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
  page.getBoundingClientRect = () => ({ top: 100 - root.scrollTop, bottom: 100 - root.scrollTop + height, height } as DOMRect);
  root.scrollTop = 2000;
  const anchor = captureReaderAnchor(root);
  height = 7000;
  restoreReaderAnchor(root, anchor);
  expect(root.scrollTop).toBeCloseTo(2960);
  viewport = 800;
  restoreReaderAnchor(root, anchor);
  expect(root.scrollTop).toBeCloseTo(3040);
  page.remove(); restoreReaderAnchor(root, anchor);
  expect(root.scrollTop).toBeCloseTo(3040);
  dom.window.close();
});
