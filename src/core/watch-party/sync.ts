/** Pure room-clock and playback rules. All timestamps use monotonic milliseconds. */
export const SYNC_INTERVAL_MS = 250;
export const MIN_BUFFER_SECONDS = 5;
export const COMMAND_LEAD_MS = 1000;
export const READINESS_TIMEOUT_MS = 15000;

export interface PlaybackSnapshot {
  version: 1;
  type: 'playback';
  hostEpoch: number;
  sequence: number;
  sourceRevision: string;
  position: number;
  rate: number;
  isPlaying: boolean;
  effectiveAt: number;
}

export interface ClockSample {
  localSentAt: number;
  localReceivedAt: number;
  hostReceivedAt: number;
  hostSentAt: number;
}

/** NTP-style clock estimation; slow network samples do not dominate the estimate. */
export class ClockEstimator {
  private samples: Array<{ offset: number; rtt: number }> = [];

  addSample(sample: ClockSample): boolean {
    const { localSentAt: t0, hostReceivedAt: t1, hostSentAt: t2, localReceivedAt: t3 } = sample;
    if (![t0, t1, t2, t3].every(Number.isFinite) || t3 < t0 || t2 < t1) return false;
    const rtt = (t3 - t0) - (t2 - t1);
    if (rtt < 0 || rtt > 5000) return false;
    this.samples.push({ offset: ((t1 - t0) + (t2 - t3)) / 2, rtt });
    if (this.samples.length > 20) this.samples.shift();
    return true;
  }

  get sampleCount(): number { return this.samples.length; }
  get ready(): boolean { return this.sampleCount >= 3; }
  get roundTripMs(): number {
    return this.samples.length ? Math.min(...this.samples.map(sample => sample.rtt)) : Infinity;
  }
  get offsetMs(): number {
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
    const weight = best.reduce((sum, sample) => sum + 1 / (sample.rtt + 1), 0);
    return weight ? best.reduce((sum, sample) => sum + sample.offset / (sample.rtt + 1), 0) / weight : 0;
  }
  toHostTime(localNow: number): number { return localNow + this.offsetMs; }
  reset(): void { this.samples = []; }
}

export function isPlaybackSnapshot(value: unknown): value is PlaybackSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as PlaybackSnapshot;
  return snapshot.version === 1 && snapshot.type === 'playback'
    && Number.isSafeInteger(snapshot.hostEpoch) && snapshot.hostEpoch >= 0
    && Number.isSafeInteger(snapshot.sequence) && snapshot.sequence >= 0
    && typeof snapshot.sourceRevision === 'string' && snapshot.sourceRevision.length > 0
    && snapshot.sourceRevision.length <= 256
    && Number.isFinite(snapshot.position) && snapshot.position >= 0
    && Number.isFinite(snapshot.rate) && snapshot.rate >= 0.25 && snapshot.rate <= 4
    && typeof snapshot.isPlaying === 'boolean'
    && Number.isFinite(snapshot.effectiveAt) && snapshot.effectiveAt >= 0;
}

/** Context may only be changed from authenticated room state, never an incoming peer message. */
export class PlaybackTimeline {
  private hostEpoch: number;
  private sourceRevision: string;
  private lastSequence = -1;
  private active: PlaybackSnapshot | null = null;
  private pending: PlaybackSnapshot[] = [];

  constructor(hostEpoch = 0, sourceRevision = '') {
    this.hostEpoch = hostEpoch;
    this.sourceRevision = sourceRevision;
  }

  setContext(hostEpoch: number, sourceRevision: string): void {
    if (hostEpoch === this.hostEpoch && sourceRevision === this.sourceRevision) return;
    this.hostEpoch = hostEpoch;
    this.sourceRevision = sourceRevision;
    this.lastSequence = -1;
    this.active = null;
    this.pending = [];
  }

  accept(value: unknown): boolean {
    if (!isPlaybackSnapshot(value) || value.hostEpoch !== this.hostEpoch
      || value.sourceRevision !== this.sourceRevision || value.sequence <= this.lastSequence) return false;
    this.lastSequence = value.sequence;
    // A newer command scheduled before an older one supersedes that old future action.
    this.pending = this.pending.filter(snapshot => snapshot.effectiveAt < value.effectiveAt);
    this.pending.push({ ...value });
    this.pending.sort((a, b) => a.effectiveAt - b.effectiveAt);
    return true;
  }

  stateAt(hostNow: number): PlaybackSnapshot | null {
    if (!Number.isFinite(hostNow)) return null;
    while (this.pending.length && this.pending[0].effectiveAt <= hostNow) {
      this.active = this.pending.shift()!;
    }
    if (!this.active) return null;
    const elapsed = this.active.isPlaying ? Math.max(0, hostNow - this.active.effectiveAt) / 1000 : 0;
    return { ...this.active, position: this.active.position + elapsed * this.active.rate, effectiveAt: hostNow };
  }

  /** Preserve the original anchor when sending an authoritative reconnect snapshot. */
  latest(): PlaybackSnapshot | null {
    const latest = this.pending[this.pending.length - 1] || this.active;
    return latest ? { ...latest } : null;
  }
}

export type DriftCorrection = {
  kind: 'none' | 'rate' | 'seek';
  playbackRate: number;
  position?: number;
};

export function getDriftCorrection(target: number, actual: number, baseRate = 1): DriftCorrection {
  if (![target, actual, baseRate].every(Number.isFinite) || target < 0 || actual < 0
    || baseRate < 0.25 || baseRate > 4) return { kind: 'none', playbackRate: 1 };
  const drift = target - actual;
  if (Math.abs(drift) <= 0.05) return { kind: 'none', playbackRate: baseRate };
  if (Math.abs(drift) > 0.5) return { kind: 'seek', playbackRate: baseRate, position: target };
  const factor = Math.max(0.97, Math.min(1.03, 1 + drift / 4));
  return { kind: 'rate', playbackRate: Math.max(0.25, Math.min(4, baseRate * factor)) };
}

interface ReadinessState { bufferedSeconds: number; ready: boolean; }
interface PeerReadiness extends ReadinessState { waitingSince: number | null; }

/** A stalled peer cannot hold a room indefinitely, and can rejoin once actually ready. */
export class ReadinessBarrier {
  private peers = new Map<string, PeerReadiness>();

  update(peerId: string, state: ReadinessState, now: number): void {
    if (!peerId || !Number.isFinite(now) || now < 0) return;
    const previous = this.peers.get(peerId);
    const ready = state.ready && Number.isFinite(state.bufferedSeconds)
      && state.bufferedSeconds >= MIN_BUFFER_SECONDS;
    this.peers.set(peerId, {
      ready,
      bufferedSeconds: Number.isFinite(state.bufferedSeconds) ? Math.max(0, state.bufferedSeconds) : 0,
      waitingSince: ready ? null : previous?.waitingSince ?? now,
    });
  }

  remove(peerId: string): void { this.peers.delete(peerId); }
  clear(): void { this.peers.clear(); }
  inspect(now: number): { ready: boolean; waiting: string[]; excluded: string[] } {
    const waiting: string[] = [];
    const excluded: string[] = [];
    for (const [peerId, state] of this.peers) {
      if (state.ready) continue;
      if (state.waitingSince !== null && now - state.waitingSince >= READINESS_TIMEOUT_MS) excluded.push(peerId);
      else waiting.push(peerId);
    }
    return { ready: waiting.length === 0, waiting, excluded };
  }
}
