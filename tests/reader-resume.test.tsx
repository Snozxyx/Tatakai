import { expect, test } from 'bun:test';
import React, { act, useCallback, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useReaderResume } from '../src/pages/manga/hooks/useReaderResume';

test('holds the first page during loading, preserves saved-page resume, and releases on input', async () => {
  const dom = new JSDOM('<div id="app"></div>');
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    ResizeObserver: globalThis.ResizeObserver,
    MutationObserver: globalThis.MutationObserver,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  const resizes = new Set<() => void>();
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: class {
      constructor(private callback: () => void) {}
      observe() { resizes.add(this.callback); }
      disconnect() { resizes.delete(this.callback); }
    },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const heights = [320, 320, 320];
  let restoring: React.MutableRefObject<boolean>;
  let currentPage = 0;
  function Reader({ page = 0, identity = 'chapter-1' }) {
    const root = useRef<HTMLDivElement>(null);
    const [index, onPage] = useState(0);
    currentPage = index;
    const attach = useCallback((element: HTMLDivElement | null) => {
      root.current = element;
      if (!element) return;
      element.scrollTop = 400;
      element.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
      element.scrollTo = (options: ScrollToOptions) => { element.scrollTop = options.top ?? 0; };
      element.querySelectorAll<HTMLElement>('[data-page]').forEach((slot, i) => {
        slot.getBoundingClientRect = () => ({
          top: 124 + heights.slice(0, i).reduce((sum, height) => sum + height, 0) - element.scrollTop,
        } as DOMRect);
      });
    }, []);
    restoring = useReaderResume({ rootRef: root, identity, page, currentPage: index, total: 3, vertical: true, onPage });
    return <div ref={attach} id="reader"><div data-reader-entry>
      {heights.map((_, i) => <div key={i} data-page={i + 1} />)}
    </div></div>;
  }
  const app = createRoot(document.getElementById('app')!);
  const resize = async () => {
    await act(async () => {
      resizes.forEach(callback => callback());
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach(callback => callback(0));
    });
  };
  try {
    await act(async () => app.render(<Reader />));
    const root = document.getElementById('reader')!;
    expect(root.scrollTop).toBe(0);
    expect(currentPage).toBe(0);
    expect(restoring.current).toBe(true);
    heights[0] = 1200;
    root.scrollTop = 200;
    await resize();
    expect(root.scrollTop).toBe(0);
    await act(async () => root.dispatchEvent(new dom.window.WheelEvent('wheel')));
    expect(restoring.current).toBe(false);
    root.scrollTop = 180;
    await resize();
    expect(root.scrollTop).toBe(180);

    await act(async () => app.render(<Reader page={2} />));
    expect(root.scrollTop).toBe(1544);
    expect(currentPage).toBe(2);
    heights[1] = 1400;
    await resize();
    expect(root.scrollTop).toBe(2624);
    expect(currentPage).toBe(2);

    await act(async () => app.render(<Reader identity="chapter-2" />));
    expect(root.scrollTop).toBe(0);
    expect(currentPage).toBe(0);
    await act(async () => root.dispatchEvent(new dom.window.Event('touchstart')));
    expect(restoring.current).toBe(false);
    root.scrollTop = 300;
    await resize();
    expect(root.scrollTop).toBe(300);
  } finally {
    await act(async () => app.unmount());
    dom.window.close();
    Object.assign(globalThis, previous);
  }
});
