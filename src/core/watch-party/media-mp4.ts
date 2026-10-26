import type { WatchPartyMediaTransport } from './media';

const READ_SIZE = 512 * 1024;
const MAX_QUEUE = 16 * 1024 * 1024;

/** Incremental MP4 parsing skips mdat to find a tail moov, then reads only the playback window. */
export class WatchPartyMp4Playback {
  private controller = new AbortController();
  private readController: AbortController | null = null;
  private objectUrl = '';
  private file: any;
  private mediaSource: MediaSource | null = null;
  private queues = new Map<number, { buffer: SourceBuffer; items: { data: ArrayBuffer; sample?: number }[] }>();
  private queuedBytes = 0;
  private duration = 0;
  private ready = false;
  private offset = 0;
  private total = Infinity;
  private revision = 0;
  private pumping = false;
  private startPosition = 0;

  constructor(private transport: WatchPartyMediaTransport, private video: HTMLVideoElement, private onError: (error: Error) => void) {}

  async load(startTime = 0): Promise<void> {
    if (typeof MediaSource === 'undefined') throw new Error('Incremental MP4 playback is unavailable on this device');
    const { createFile } = await import('mp4box');
    if (this.controller.signal.aborted) return;
    this.file = createFile();
    this.startPosition = Math.max(0, startTime);
    this.mediaSource = new MediaSource();
    this.objectUrl = URL.createObjectURL(this.mediaSource); this.video.src = this.objectUrl;
    this.file.onError = (_module: string, message: string) => this.fail(new Error(`MP4 parsing failed: ${message}`));
    this.file.onReady = (info: any) => this.initialize(info);
    this.file.onSegment = (id: number, _user: unknown, data: ArrayBuffer, nextSample: number) => {
      const queue = this.queues.get(id);
      if (!queue || this.controller.signal.aborted) return;
      if (this.queuedBytes + data.byteLength > MAX_QUEUE) { this.fail(new Error('MP4 buffering limit reached')); return; }
      queue.items.push({ data, sample: nextSample }); this.queuedBytes += data.byteLength; this.flush(id);
    };
    this.mediaSource.addEventListener('sourceopen', () => { void this.pump(); }, { once: true });
    this.video.addEventListener('seeking', this.onSeeking);
    this.video.addEventListener('timeupdate', this.onTimeUpdate);
  }

  private initialize(info: any): void {
    if (!this.mediaSource || this.mediaSource.readyState !== 'open') return;
    const tracks = [info.videoTracks?.[0], info.audioTracks?.[0]].filter(Boolean);
    if (!tracks.length) throw new Error('MP4 contains no playable audio/video tracks');
    this.duration = info.duration / info.timescale;
    if (!Number.isFinite(this.duration) || this.duration <= 0) throw new Error('Live or invalid MP4 is unsupported');
    this.mediaSource.duration = this.duration;
    for (const track of tracks) {
      const mime = `${track.video ? 'video' : 'audio'}/mp4; codecs="${track.codec}"`;
      if (!MediaSource.isTypeSupported(mime)) throw new Error(`This device cannot decode MP4 codec ${track.codec}`);
      const buffer = this.mediaSource.addSourceBuffer(mime);
      this.queues.set(track.id, { buffer, items: [] });
      buffer.addEventListener('updateend', () => { this.flush(track.id); void this.pump(); });
      buffer.addEventListener('error', () => this.fail(new Error('This device could not decode shared MP4 media')));
      // MP4Box requires matching segment sample counts across selected tracks.
      this.file.setSegmentOptions(track.id, null, { nbSamples: 60, rapAlignement: true });
    }
    const initializations = this.file.initializeSegmentation('per-track');
    for (const initial of initializations) {
      this.queues.get(initial.id)!.items.push({ data: initial.buffer });
      this.queuedBytes += initial.buffer.byteLength; this.flush(initial.id);
    }
    this.ready = true;
    this.offset = this.file.seek(this.startPosition, true).offset;
    this.file.start();
    if (this.startPosition > 0) this.video.currentTime = this.startPosition;
  }

  private flush(id: number): void {
    const queue = this.queues.get(id);
    if (!queue || queue.buffer.updating || this.controller.signal.aborted || this.mediaSource?.readyState === 'closed') return;
    // Keep a short back buffer instead of letting an episode accumulate in MSE.
    if (queue.buffer.buffered.length && queue.buffer.buffered.start(0) < this.video.currentTime - 25) {
      queue.buffer.remove(queue.buffer.buffered.start(0), this.video.currentTime - 20); return;
    }
    const next = queue.items.shift(); if (!next) return;
    try {
      queue.buffer.appendBuffer(next.data); this.queuedBytes -= next.data.byteLength;
      if (next.sample !== undefined) this.file.releaseUsedSamples(id, next.sample);
    } catch (error) {
      queue.items.unshift(next);
      this.fail(error instanceof Error ? error : new Error('MP4 buffer append failed'));
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.controller.signal.aborted) return;
    if (this.offset >= this.total) { this.finish(); return; }
    this.pumping = true;
    try {
      let metadataBytes = 0;
      while (!this.controller.signal.aborted && this.offset < this.total) {
        if (this.ready && (this.queuedBytes > MAX_QUEUE / 2 || this.bufferAhead() > 10)) return;
        const revision = this.revision;
        this.readController = new AbortController();
        const start = this.offset;
        const response = await this.transport.fetch(this.transport.rootUrl, {
          signal: this.readController.signal, range: { start, end: Math.min(start + READ_SIZE - 1, this.total - 1) },
        });
        if (revision !== this.revision || this.controller.signal.aborted) continue;
        const range = response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        if (!range || Number(range[1]) !== start) throw new Error('Shared MP4 source must support valid HTTP byte ranges');
        this.total = Number(range[3]);
        const data = await response.arrayBuffer();
        if (data.byteLength !== Number(range[2]) - start + 1 || data.byteLength > READ_SIZE) throw new Error('Invalid MP4 range response');
        if (!data.byteLength) throw new Error('MP4 source returned an empty range');
        const wasReady = this.ready;
        (data as ArrayBuffer & { fileStart: number }).fileStart = start;
        const next = this.file.appendBuffer(data);
        // onReady selects the first playback range. Do not overwrite it with the metadata offset.
        if (wasReady || !this.ready) this.offset = Number.isFinite(next) && next > 0 ? next : start + data.byteLength;
        if (!this.ready) {
          metadataBytes += data.byteLength;
          if (metadataBytes > 16 * 1024 * 1024) throw new Error('MP4 metadata exceeds the supported limit');
        }
      }
      if (this.offset >= this.total && this.ready) this.file.flush();
      this.finish();
    } catch (error) {
      if (!this.controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')) this.fail(error instanceof Error ? error : new Error('Shared MP4 playback failed'));
    } finally {
      this.pumping = false;
      // Seeking aborts the old request; restart from its new offset after that promise unwinds.
      if (!this.controller.signal.aborted && this.readController?.signal.aborted) void this.pump();
    }
  }

  private finish(): void {
    if (this.ready && this.offset >= this.total && this.mediaSource?.readyState === 'open'
      && [...this.queues.values()].every(queue => !queue.buffer.updating && !queue.items.length)) {
      try { this.mediaSource.endOfStream(); } catch { /* A seek may have reopened the source. */ }
    }
  }

  private bufferAhead(): number {
    const ranges = this.video.buffered;
    for (let i = 0; i < ranges.length; i++) if (ranges.start(i) <= this.video.currentTime + 0.1 && ranges.end(i) >= this.video.currentTime) return ranges.end(i) - this.video.currentTime;
    return 0;
  }

  private onTimeUpdate = () => { void this.pump(); };
  private onSeeking = () => {
    if (!this.ready || this.bufferAhead() > 0.5 || this.controller.signal.aborted) return;
    this.revision++; this.readController?.abort();
    this.file.stop(); this.offset = this.file.seek(this.video.currentTime, true).offset;
    for (const queue of this.queues.values()) { queue.items = []; }
    this.queuedBytes = 0; this.file.start(); void this.pump();
  };

  private fail(error: Error): void { if (!this.controller.signal.aborted) { this.close(); this.onError(error); } }

  close(): void {
    if (this.controller.signal.aborted) return;
    this.controller.abort(); this.readController?.abort();
    this.video.removeEventListener('seeking', this.onSeeking); this.video.removeEventListener('timeupdate', this.onTimeUpdate);
    this.file?.stop(); this.file = null; this.queues.clear(); this.queuedBytes = 0;
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = ''; }
  }
}
