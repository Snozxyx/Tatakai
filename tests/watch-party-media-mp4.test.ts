import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { WatchPartyMp4Playback } from '../src/core/watch-party/media-mp4';
import type { WatchPartyMediaTransport } from '../src/core/watch-party/media';

/** Original two-second blue video + silent audio, generated with ffmpeg; no third-party media. */
function tailMetadataFixture(): Uint8Array {
  const original = new Uint8Array(readFileSync(new URL('./fixtures/watch-party-tail.mp4', import.meta.url)));
  const padding = 2 * 1024 * 1024;
  let offset = 0; let mdat = -1; let moov = -1;
  const view = new DataView(original.buffer, original.byteOffset, original.byteLength);
  while (offset < original.length) {
    const length = view.getUint32(offset);
    const kind = new TextDecoder().decode(original.subarray(offset + 4, offset + 8));
    if (kind === 'mdat') mdat = offset;
    if (kind === 'moov') { moov = offset; break; }
    offset += length;
  }
  if (mdat < 0 || moov < 0) throw new Error('Invalid MP4 fixture');
  const bytes = new Uint8Array(original.length + padding);
  bytes.set(original.subarray(0, moov)); bytes.set(original.subarray(moov), moov + padding);
  new DataView(bytes.buffer).setUint32(mdat, view.getUint32(mdat) + padding);
  return bytes;
}

class FakeBuffer extends EventTarget {
  updating = false;
  buffered = { length: 0, start: () => 0, end: () => 0 };
  appended: ArrayBuffer[] = [];
  appendBuffer(data: ArrayBuffer) {
    this.appended.push(data); this.updating = true;
    queueMicrotask(() => { this.updating = false; this.dispatchEvent(new Event('updateend')); });
  }
  remove() { this.updating = true; queueMicrotask(() => { this.updating = false; this.dispatchEvent(new Event('updateend')); }); }
}

class FakeMediaSource extends EventTarget {
  static latest: FakeMediaSource;
  static isTypeSupported() { return true; }
  readyState = 'open'; duration = 0;
  buffers: FakeBuffer[] = [];
  constructor() { super(); FakeMediaSource.latest = this; }
  addSourceBuffer() { const buffer = new FakeBuffer(); this.buffers.push(buffer); return buffer; }
  endOfStream() { this.readyState = 'ended'; }
}

class FakeVideo extends EventTarget {
  currentTime = 0;
  buffered = { length: 0, start: () => 0, end: () => 0 };
  set src(_value: string) { queueMicrotask(() => FakeMediaSource.latest.dispatchEvent(new Event('sourceopen'))); }
}

async function until(predicate: () => boolean): Promise<void> {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > 10000) throw new Error('Playback did not settle'); await new Promise(resolve => setTimeout(resolve, 5)); }
}

test('incremental MP4 skips a large mdat to read tail metadata and appends playable fragments', async () => {
  const bytes = tailMetadataFixture(); const ranges: number[] = []; const errors: Error[] = [];
  const transport: WatchPartyMediaTransport = { rootUrl: 'https://cdn.example/movie.mp4', cancelPending() {}, async fetch(_url, options) {
    const { start, end = bytes.length - 1 } = options!.range!;
    ranges.push(start); const last = Math.min(end, bytes.length - 1);
    return new Response(bytes.slice(start, last + 1), { status: 206, headers: { 'content-range': `bytes ${start}-${last}/${bytes.length}` } });
  } };
  const oldMediaSource = globalThis.MediaSource; const create = URL.createObjectURL; const revoke = URL.revokeObjectURL;
  globalThis.MediaSource = FakeMediaSource as unknown as typeof MediaSource;
  URL.createObjectURL = () => 'blob:watch-party-test'; URL.revokeObjectURL = () => {};
  const playback = new WatchPartyMp4Playback(transport, new FakeVideo() as unknown as HTMLVideoElement, error => errors.push(error));
  try {
    await playback.load();
    await until(() => errors.length > 0 || FakeMediaSource.latest.readyState === 'ended');
    expect(errors.map(e => e.message)).toEqual([]);
    expect(ranges[0]).toBe(0);
    expect(ranges[1]).toBeGreaterThan(2 * 1024 * 1024);
    expect(FakeMediaSource.latest.buffers).toHaveLength(2);
    expect(FakeMediaSource.latest.buffers.every(buffer => buffer.appended.length >= 2)).toBe(true);
  } finally { playback.close(); globalThis.MediaSource = oldMediaSource; URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
});

test('closing incremental MP4 cancels an active range and does not report a playback error', async () => {
  let cancelled = false; let started = false; const errors: Error[] = [];
  const transport: WatchPartyMediaTransport = { rootUrl: 'https://cdn.example/movie.mp4', cancelPending() {}, fetch(_url, options) {
    started = true;
    return new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => {
      cancelled = true; reject(new DOMException('Aborted', 'AbortError'));
    }));
  } };
  const oldMediaSource = globalThis.MediaSource; const create = URL.createObjectURL; const revoke = URL.revokeObjectURL;
  globalThis.MediaSource = FakeMediaSource as unknown as typeof MediaSource;
  URL.createObjectURL = () => 'blob:watch-party-test'; URL.revokeObjectURL = () => {};
  const playback = new WatchPartyMp4Playback(transport, new FakeVideo() as unknown as HTMLVideoElement, error => errors.push(error));
  try {
    await playback.load(); await until(() => started); playback.close();
    expect(cancelled).toBe(true); expect(errors).toEqual([]);
  } finally { playback.close(); globalThis.MediaSource = oldMediaSource; URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
});
