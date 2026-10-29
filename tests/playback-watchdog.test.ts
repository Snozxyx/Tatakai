import { expect, test } from 'bun:test';
import { createPlaybackWatchdog } from '../src/core/player/playback-watchdog';
import { DEFAULT_MOBILE_CONFIG, loadMobileConfig } from '../src/hooks/ui/useMobileConfig';

function fixture() {
  let time = 0;
  let recoveries = 0;
  let progress = 0;
  const state = { currentTime: 0, paused: true, seeking: false, ended: false, readyState: 0 };
  const watchdog = createPlaybackWatchdog({
    video: state as HTMLVideoElement, now: () => time,
    recover: () => recoveries++, onProgress: () => progress++,
  });
  return { state, watchdog, get recoveries() { return recoveries; }, get progress() { return progress; },
    tick(ms: number) { time += ms; watchdog.tick(); } };
}

test('startup retries repeat even when no waiting event fires and video stays paused', () => {
  const f = fixture();
  f.tick(15_000);
  expect(f.recoveries).toBe(1);
  f.tick(15_000);
  expect(f.recoveries).toBe(2);
});

test('frozen playback and an unfinished seek recover without more media events', () => {
  const f = fixture();
  Object.assign(f.state, { paused: false, readyState: 3, currentTime: 1 });
  f.tick(1000);
  expect(f.progress).toBe(1);
  f.tick(6000);
  expect(f.recoveries).toBe(1);
  Object.assign(f.state, { seeking: true, currentTime: 300 });
  f.tick(6000);
  expect(f.recoveries).toBe(2);
  expect(f.progress).toBe(1);
});

test('ready paused videos, ended videos and ongoing playback do not recover', () => {
  const f = fixture();
  f.state.readyState = 3;
  f.tick(60_000);
  f.state.paused = false;
  for (let i = 0; i < 30; i++) { f.state.currentTime++; f.tick(1000); }
  f.state.ended = true;
  f.tick(60_000);
  expect(f.recoveries).toBe(0);
});

test('remounting resets the startup deadline', () => {
  const f = fixture();
  f.tick(14_000);
  f.watchdog.reset();
  f.tick(1000);
  expect(f.recoveries).toBe(0);
  f.tick(14_000);
  expect(f.recoveries).toBe(1);
});

test('mobile cloud proxy defaults on and preserves an explicit opt-out', () => {
  const previous = globalThis.window;
  let stored: string | null = null;
  Object.assign(globalThis, { window: { localStorage: { getItem: () => stored } } });
  try {
    expect(DEFAULT_MOBILE_CONFIG.cloudProxyByDefault).toBe(true);
    expect(loadMobileConfig().cloudProxyByDefault).toBe(true);
    stored = JSON.stringify({ hapticFeedback: false });
    expect(loadMobileConfig().cloudProxyByDefault).toBe(true);
    stored = JSON.stringify({ cloudProxyByDefault: false });
    expect(loadMobileConfig().cloudProxyByDefault).toBe(false);
  } finally {
    Object.assign(globalThis, { window: previous });
  }
});
