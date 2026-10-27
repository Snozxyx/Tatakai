import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useMotionPreference } from '../src/hooks/ui/useMotionPreference';

test('many effects share one observer and retain live OS/app preferences and cleanup', async () => {
  const dom = new JSDOM('<div id="app"></div>');
  const previous = { window: globalThis.window, document: globalThis.document, MutationObserver: globalThis.MutationObserver };
  let observers = 0;
  let disconnected = 0;
  let osReduced = false;
  const changes = new Set<() => void>();
  const media = {
    get matches() { return osReduced; },
    addEventListener: (_: string, listener: () => void) => changes.add(listener),
    removeEventListener: (_: string, listener: () => void) => changes.delete(listener),
  };
  dom.window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
  class Observer extends dom.window.MutationObserver {
    constructor(callback: MutationCallback) { super(callback); observers++; }
    disconnect() { disconnected++; super.disconnect(); }
  }
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, MutationObserver: Observer, IS_REACT_ACT_ENVIRONMENT: true });
  const app = createRoot(document.getElementById('app')!);
  function Effect() { return <span>{String(useMotionPreference())}</span>; }
  try {
    await act(async () => app.render(<>{Array.from({ length: 100 }, (_, i) => <Effect key={i} />)}</>));
    expect(observers).toBe(1);
    expect(changes.size).toBe(1);
    expect(document.querySelectorAll('span').length).toBe(100);
    const all = (value: string) => expect([...document.querySelectorAll('span')].every(el => el.textContent === value)).toBe(true);
    all('false');
    await act(async () => { osReduced = true; changes.forEach(listener => listener()); });
    all('true');
    await act(async () => { osReduced = false; changes.forEach(listener => listener()); });
    all('false');
    await act(async () => { document.body.classList.add('reduce-motion'); });
    all('true');
    await act(async () => { document.body.classList.remove('reduce-motion'); });
    all('false');
    await act(async () => app.render(null));
    expect(disconnected).toBe(1);
    expect(changes.size).toBe(0);
    document.documentElement.dataset.reducedMotion = 'true';
    await act(async () => app.render(<Effect />));
    all('true');
    expect(observers).toBe(2);
  } finally {
    await act(async () => app.unmount());
    dom.window.close();
    Object.assign(globalThis, previous);
  }
});
