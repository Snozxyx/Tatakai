import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { observeTVVisibility } from '../src/core/tv/visibility';

test('large TV catalogues share visibility observation and release departed cards', () => {
  const dom = new JSDOM('<main></main>');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver');
  let created = 0, disconnected = 0;
  let deliver!: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;
  class Observer {
    constructor(callback: typeof deliver) { created++; deliver = callback; }
    observe() {} unobserve() {} disconnect() { disconnected++; }
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', { value: Observer, configurable: true });
  const elements = Array.from({ length: 250 }, () => dom.window.document.createElement('a'));
  const calls: number[] = [];
  const cleanups: Array<() => void> = [];
  try {
    for (let i = 0; i < elements.length; i++) cleanups.push(observeTVVisibility(elements[i], visible => { if (visible) calls.push(i); }));
    expect(created).toBe(1);
    deliver([{ target: elements[0], isIntersecting: true }, { target: elements[249], isIntersecting: true }]);
    expect(calls).toEqual([0, 249]);
    cleanups[0]();
    deliver([{ target: elements[0], isIntersecting: true }]);
    expect(calls).toEqual([0, 249]);
    for (const cleanup of cleanups.slice(1)) cleanup();
    expect(disconnected).toBe(1);
    const close = observeTVVisibility(elements[0], () => {});
    expect(created).toBe(2); close();
  } finally {
    for (const cleanup of cleanups) cleanup();
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'IntersectionObserver', previous); else Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  }
});
