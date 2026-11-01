import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { captureReaderAnchor, restoreReaderAnchor } from './useReaderLayoutAnchor';

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
