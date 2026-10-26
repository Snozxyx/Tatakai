import { expect, test } from 'bun:test';
import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useReaderPinchZoom } from '../src/pages/manga/hooks/useReaderPinchZoom';

test('pinch anchors the page, blocks native scrolling and taps, and leaves single-touch scroll alone', async () => {
  const dom = new JSDOM('<div id="app"></div>');
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let currentZoom = 100;
  let clicks = 0;
  function Reader() {
    const root = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(100);
    currentZoom = zoom;
    useReaderPinchZoom(root, zoom, setZoom);
    return <div ref={root} id="reader" onClick={() => clicks++}><img data-page="1" /></div>;
  }
  const app = createRoot(document.getElementById('app')!);
  try {
    await act(async () => app.render(<Reader />));
    const reader = document.getElementById('reader')!;
    const page = reader.querySelector('img')!;
    page.getBoundingClientRect = () => ({ left: -reader.scrollLeft, top: -reader.scrollTop,
      width: 400 * currentZoom / 100, height: 1000 * currentZoom / 100,
      bottom: 1000 * currentZoom / 100 - reader.scrollTop } as DOMRect);
    reader.scrollTop = 300;
    const wheel = async (deltaY: number, ctrlKey: boolean) => {
      const event = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey, deltaY, clientX: 200, clientY: 200 });
      await act(async () => { reader.dispatchEvent(event); });
      return event;
    };
    expect((await wheel(-100, false)).defaultPrevented).toBe(false);
    expect(currentZoom).toBe(100);
    expect((await wheel(-100, true)).defaultPrevented).toBe(true);
    expect(currentZoom).toBe(108);
    expect(reader.scrollTop).toBeCloseTo(340);
    await wheel(100, true);
    expect(currentZoom).toBe(100);
    expect(reader.scrollTop).toBeCloseTo(300);
    const touch = async (type: string, points: Array<[number, number]>) => {
      const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
      await act(async () => { reader.dispatchEvent(event); });
      return event;
    };
    expect((await touch('touchstart', [[150, 200]])).defaultPrevented).toBe(false);
    expect((await touch('touchmove', [[150, 210]])).defaultPrevented).toBe(false);
    expect((await touch('touchstart', [[150, 200], [250, 200]])).defaultPrevented).toBe(true);
    expect((await touch('touchmove', [[100, 200], [300, 200]])).defaultPrevented).toBe(true);
    expect(currentZoom).toBe(200);
    expect(reader.scrollTop).toBe(800);
    expect(reader.scrollLeft).toBe(200);
    await touch('touchend', [[100, 200]]);
    expect((await touch('touchmove', [[100, 250]])).defaultPrevented).toBe(true);
    await touch('touchend', []);
    await act(async () => reader.click());
    expect(clicks).toBe(0);
  } finally {
    await act(async () => app.unmount());
    dom.window.close();
    Object.assign(globalThis, previous);
  }
});
