import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useIsMobile, useIsPhone } from '../src/hooks/ui/use-mobile';

test('mobile consumers start on the correct layout and share a live, cleaned-up subscription', async () => {
  const dom = new JSDOM('<div id="app"></div>');
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: (globalThis as any).IS_REACT_ACT_ENVIRONMENT };
  let mobile = true;
  let mediaQueries = 0;
  const listeners = new Set<() => void>();
  const media = {
    get matches() { return mobile; },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  dom.window.matchMedia = ((query: string) => {
    expect(query).toBe('(max-width: 767px)');
    mediaQueries++;
    return media;
  }) as typeof window.matchMedia;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const app = createRoot(document.getElementById('app')!);
  const firstRenders: boolean[] = [];
  function Consumer() {
    const value = useIsMobile();
    const phone = useIsPhone();
    const first = React.useRef(true);
    if (first.current) { firstRenders.push(value); first.current = false; }
    return <span>{value && phone ? 'phone' : 'desktop'}</span>;
  }
  try {
    await act(async () => app.render(<>{Array.from({ length: 100 }, (_, i) => <Consumer key={i} />)}</>));
    expect(firstRenders).toEqual(Array(100).fill(true));
    expect(mediaQueries).toBe(1);
    expect(listeners.size).toBe(1);
    await act(async () => { mobile = false; listeners.forEach(listener => listener()); });
    expect([...document.querySelectorAll('span')].every(el => el.textContent === 'desktop')).toBe(true);
    await act(async () => app.render(null));
    expect(listeners.size).toBe(0);
    await act(async () => app.render(<Consumer />));
    expect(document.querySelector('span')?.textContent).toBe('desktop');
    expect(listeners.size).toBe(1);
  } finally {
    await act(async () => app.unmount());
    expect(listeners.size).toBe(0);
    dom.window.close();
    Object.assign(globalThis, previous);
  }
});
