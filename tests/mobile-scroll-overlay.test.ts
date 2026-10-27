import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { installPullRefreshListeners } from '../src/components/mobile/pull-refresh-listeners';
import { dismissMobileOverlay } from '../src/components/mobile/dismiss-mobile-overlay';
import { reviewPromptDelay } from '../src/lib/mobile/review-prompt';

test('ordinary scrolling stays passive; only eligible pulls cancel moves and refresh once', () => {
  const dom = new JSDOM('<div id="scroller"><div id="card"></div></div>');
  const host = dom.window as unknown as Window;
  const card = host.document.getElementById('card')!;
  const scroller = host.document.getElementById('scroller')!;
  const blocking = new Set<EventListenerOrEventListenerObject>();
  const add = host.addEventListener.bind(host);
  const remove = host.removeEventListener.bind(host);
  host.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) => {
    if (type === 'touchmove' && options?.passive === false) blocking.add(listener);
    add(type, listener, options);
  }) as typeof host.addEventListener;
  host.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions) => {
    if (type === 'touchmove') blocking.delete(listener);
    remove(type, listener, options);
  }) as typeof host.removeEventListener;
  let refreshes = 0;
  const display: number[] = [];
  const cleanup = installPullRefreshListeners(host, () => false, value => display.push(value), () => refreshes++);
  const touch = (type: string, x = 10, y = 10, count = 1) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: Array.from({ length: count }, () => ({ clientX: x, clientY: y })) });
    card.dispatchEvent(event);
    return event;
  };
  try {
    expect(blocking.size).toBe(0);
    Object.defineProperty(host, 'scrollY', { value: 500, configurable: true });
    touch('touchstart');
    expect(touch('touchmove', 10, 150).defaultPrevented).toBe(false);
    expect(blocking.size).toBe(0);
    Object.defineProperty(host, 'scrollY', { value: 0 });
    scroller.scrollTop = 100;
    touch('touchstart');
    expect(blocking.size).toBe(0);
    scroller.scrollTop = 0;
    touch('touchstart');
    expect(blocking.size).toBe(1);
    expect(touch('touchmove', 10, 12).defaultPrevented).toBe(true);
    touch('touchmove', 10, 150);
    touch('touchend'); touch('touchend');
    expect(refreshes).toBe(1);
    expect(blocking.size).toBe(0);
    expect(display.at(-1)).toBe(0);
    for (const [x, y, count] of [[100, 12, 1], [10, -20, 1], [10, 150, 2]]) {
      touch('touchstart'); touch('touchmove', x, y, count); touch('touchend');
      expect(refreshes).toBe(1);
      expect(blocking.size).toBe(0);
    }
    touch('touchstart'); touch('touchcancel');
    expect(blocking.size).toBe(0);
    touch('touchstart'); cleanup();
    expect(blocking.size).toBe(0);
    touch('touchstart');
    expect(blocking.size).toBe(0);
  } finally { cleanup(); dom.window.close(); }
});

test('native Back reaches document Escape listeners and does not swallow ordinary navigation', () => {
  const dom = new JSDOM('<div role="dialog" data-state="open"><button id="close">Close</button></div>');
  const doc = dom.window.document;
  let closes = 0;
  doc.getElementById('close')!.focus();
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closes++; doc.querySelector('[role="dialog"]')!.remove(); }
  });
  expect(dismissMobileOverlay(doc)).toBe(true);
  expect(closes).toBe(1);
  expect(dismissMobileOverlay(doc)).toBe(false);
  dom.window.close();
});

test('review deadline survives route remounts, respects dismissal, and tolerates unavailable storage', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  expect(reviewPromptDelay(storage, 1000)).toBe(180000);
  expect(reviewPromptDelay(storage, 61000)).toBe(120000);
  expect(reviewPromptDelay(storage, 181000)).toBe(0);
  values.set('tatakai_review_shown', 'true');
  expect(reviewPromptDelay(storage, 200000)).toBeNull();
  const unavailable = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
  expect(reviewPromptDelay(unavailable, 1000)).toBe(180000);
  expect(reviewPromptDelay(unavailable, 61000)).toBe(120000);
});
