import type { PlaybackBackend, PlaybackSource } from './player-core';

export type ProgressSink = (position: number, duration?: number, completed?: boolean, flush?: boolean) => void;
export type PlaybackLease = { generation: number; signal: AbortSignal; startTime: number };

/** A single owner for resolution and continuity, shared by HTML/native/external backends. */
export class PlaybackCoordinator {
  private generation = 0;
  private controller = new AbortController();
  private source: PlaybackSource | null = null;
  private position = 0;
  private duration = 0;
  private lastWrite = 0;
  private completed = false;
  backend: PlaybackBackend = 'html';
  sink?: ProgressSink;

  begin(source: PlaybackSource, initialPosition = 0, backend: PlaybackBackend = 'html'): PlaybackLease {
    this.flush();
    const sameEpisode = !!source.episodeId && source.episodeId === this.source?.episodeId
      && source.mediaId === this.source?.mediaId;
    this.controller.abort();
    this.controller = new AbortController();
    this.source = source;
    this.backend = backend;
    this.position = sameEpisode ? this.position : Number.isFinite(initialPosition) ? Math.max(0, initialPosition) : 0;
    if (!sameEpisode) { this.duration = 0; this.completed = false; }
    this.lastWrite = 0;
    return { generation: ++this.generation, signal: this.controller.signal, startTime: this.position };
  }

  isCurrent(lease: PlaybackLease): boolean {
    return lease.generation === this.generation && !lease.signal.aborted;
  }

  report(position: number, duration?: number, completed = false, flush = false, generation = this.generation): void {
    if (generation !== this.generation || this.controller.signal.aborted || !Number.isFinite(position)) return;
    this.position = Math.max(0, position);
    if (Number.isFinite(duration) && Number(duration) > 0) this.duration = Number(duration);
    if (this.completed) return;
    if (completed || flush || Date.now() - this.lastWrite >= 5000) {
      this.lastWrite = Date.now();
      this.completed = completed;
      if (this.position > 0 || completed) this.sink?.(this.position, this.duration || undefined, completed, flush);
    }
  }

  reportNative(event: { positionMs?: number; durationMs?: number; completed?: boolean }, generation = this.generation, flush = false): void {
    if (event.positionMs == null) return;
    this.report(event.positionMs / 1000, event.durationMs == null ? undefined : event.durationMs / 1000, !!event.completed, flush, generation);
  }

  flush(): void { this.report(this.position, this.duration, false, true); }
  dispose(): void { this.flush(); this.controller.abort(); ++this.generation; }
}
