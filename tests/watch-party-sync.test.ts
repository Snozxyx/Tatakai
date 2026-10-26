import { describe, expect, test } from 'bun:test';
import {
  ClockEstimator, PlaybackTimeline, ReadinessBarrier, getDriftCorrection, isPlaybackSnapshot,
  type PlaybackSnapshot,
} from '../src/core/watch-party/sync';

const snapshot = (overrides: Partial<PlaybackSnapshot> = {}): PlaybackSnapshot => ({
  version: 1, type: 'playback', hostEpoch: 2, sequence: 0, sourceRevision: 'episode-a',
  position: 10, rate: 1, isPlaying: true, effectiveAt: 1000, ...overrides,
});

describe('room clock', () => {
  test('estimates an offset without counting host processing as network delay', () => {
    const clock = new ClockEstimator();
    for (let i = 0; i < 3; i++) {
      expect(clock.addSample({ localSentAt: 1000 + i, hostReceivedAt: 1510 + i,
        hostSentAt: 1520 + i, localReceivedAt: 1030 + i })).toBe(true);
    }
    expect(clock.ready).toBe(true);
    expect(clock.roundTripMs).toBe(20);
    expect(clock.offsetMs).toBeCloseTo(500);
    expect(clock.toHostTime(5000)).toBeCloseTo(5500);
  });

  test('prefers low RTT measurements and resets after reconnection', () => {
    const clock = new ClockEstimator();
    for (let i = 0; i < 3; i++) clock.addSample({ localSentAt: 0, hostReceivedAt: 1010,
      hostSentAt: 1010, localReceivedAt: 20 });
    clock.addSample({ localSentAt: 0, hostReceivedAt: 1800, hostSentAt: 1800, localReceivedAt: 1000 });
    expect(clock.offsetMs).toBeCloseTo(1000);
    expect(clock.addSample({ localSentAt: 100, hostReceivedAt: 10, hostSentAt: 0, localReceivedAt: 110 })).toBe(false);
    expect(clock.addSample({ localSentAt: 0, hostReceivedAt: 0, hostSentAt: 0, localReceivedAt: Infinity })).toBe(false);
    expect(clock.addSample({ localSentAt: 0, hostReceivedAt: 3000, hostSentAt: 3000, localReceivedAt: 6000 })).toBe(false);
    clock.reset();
    expect(clock.ready).toBe(false);
    expect(clock.offsetMs).toBe(0);
  });
});

describe('authoritative playback timeline', () => {
  test('executes play/pause/seek at the scheduled time without moving earlier', () => {
    const timeline = new PlaybackTimeline(2, 'episode-a');
    timeline.accept(snapshot({ isPlaying: false, effectiveAt: 0 }));
    timeline.accept(snapshot({ sequence: 1, effectiveAt: 1000 }));
    expect(timeline.stateAt(999)?.isPlaying).toBe(false);
    expect(timeline.stateAt(1000)?.position).toBe(10);
    expect(timeline.stateAt(1500)?.position).toBe(10.5);
    timeline.accept(snapshot({ sequence: 2, position: 11, isPlaying: false, effectiveAt: 2000 }));
    expect(timeline.stateAt(1999)?.isPlaying).toBe(true);
    expect(timeline.stateAt(5000)?.position).toBe(11);
    timeline.accept(snapshot({ sequence: 3, position: 90, isPlaying: false, effectiveAt: 6000 }));
    expect(timeline.stateAt(5999)?.position).toBe(11);
    expect(timeline.stateAt(6000)?.position).toBe(90);
  });

  test('rejects stale sequence, source, authority and malformed messages', () => {
    const timeline = new PlaybackTimeline(2, 'episode-a');
    expect(timeline.accept(snapshot())).toBe(true);
    for (const bad of [snapshot(), snapshot({ hostEpoch: 1, sequence: 1 }),
      snapshot({ sourceRevision: 'episode-b', sequence: 2 }), snapshot({ sequence: 3, position: NaN }),
      snapshot({ sequence: 4, rate: 0 }), snapshot({ sequence: 5, effectiveAt: -1 }),
      { ...snapshot(), isPlaying: 'yes' }, null]) expect(timeline.accept(bad)).toBe(false);
    expect(timeline.accept(snapshot({ sequence: 1 }))).toBe(true);
    expect(isPlaybackSnapshot(snapshot({ sourceRevision: '' }))).toBe(false);
  });

  test('a new immediate snapshot supersedes old queued commands', () => {
    const timeline = new PlaybackTimeline(2, 'episode-a');
    timeline.accept(snapshot({ sequence: 0, effectiveAt: 0, isPlaying: false }));
    timeline.accept(snapshot({ sequence: 1, effectiveAt: 10000, position: 90 }));
    timeline.accept(snapshot({ sequence: 2, effectiveAt: 5000, position: 20, isPlaying: false }));
    expect(timeline.stateAt(11000)?.position).toBe(20);
    expect(timeline.latest()?.sequence).toBe(2);
  });

  test('context changes discard pending state and restart ordering', () => {
    const timeline = new PlaybackTimeline(2, 'episode-a');
    timeline.accept(snapshot({ sequence: 999, rate: 2 }));
    expect(timeline.stateAt(2000)?.position).toBe(12);
    expect(timeline.latest()?.effectiveAt).toBe(1000);
    timeline.setContext(3, 'episode-b');
    expect(timeline.stateAt(3000)).toBeNull();
    expect(timeline.accept(snapshot({ hostEpoch: 3, sourceRevision: 'episode-b' }))).toBe(true);
    timeline.setContext(3, 'episode-b');
    expect(timeline.stateAt(3000)?.position).toBe(12);
  });
});

describe('drift correction', () => {
  test('uses deadband, bounded speed correction, and large-drift seeks', () => {
    expect(getDriftCorrection(10, 10.02)).toEqual({ kind: 'none', playbackRate: 1 });
    expect(getDriftCorrection(10.4, 10)).toEqual({ kind: 'rate', playbackRate: 1.03 });
    expect(getDriftCorrection(10, 10.4)).toEqual({ kind: 'rate', playbackRate: 0.97 });
    expect(getDriftCorrection(11, 10)).toEqual({ kind: 'seek', playbackRate: 1, position: 11 });
    expect(getDriftCorrection(10, 10.01, 2)).toEqual({ kind: 'none', playbackRate: 2 });
    expect(getDriftCorrection(NaN, 10)).toEqual({ kind: 'none', playbackRate: 1 });
  });
});

describe('readiness barrier', () => {
  test('requires five buffered seconds and excludes a stalled peer after 15 seconds', () => {
    const barrier = new ReadinessBarrier();
    barrier.update('ready', { ready: true, bufferedSeconds: 5 }, 100);
    barrier.update('stalled', { ready: true, bufferedSeconds: 4.9 }, 100);
    expect(barrier.inspect(100).waiting).toEqual(['stalled']);
    // Repeated reports must not restart the wait deadline.
    barrier.update('stalled', { ready: false, bufferedSeconds: 3 }, 10000);
    expect(barrier.inspect(15099).ready).toBe(false);
    expect(barrier.inspect(15100)).toEqual({ ready: true, waiting: [], excluded: ['stalled'] });
    barrier.update('stalled', { ready: true, bufferedSeconds: 6 }, 16000);
    expect(barrier.inspect(16000)).toEqual({ ready: true, waiting: [], excluded: [] });
    barrier.update('stalled', { ready: false, bufferedSeconds: 0 }, 17000);
    expect(barrier.inspect(17000).waiting).toEqual(['stalled']);
    barrier.remove('stalled');
    expect(barrier.inspect(17000).ready).toBe(true);
    barrier.clear();
    expect(barrier.inspect(20000)).toEqual({ ready: true, waiting: [], excluded: [] });
  });
});
