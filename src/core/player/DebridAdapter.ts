import { AbstractSourceAdapter, AdapterLoadOptions } from './SourceAdapterRegistry';
import { PlaybackMode } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';
import { debridOrchestrator } from '../providers/debrid-orchestrator';
import { HlsAdapter } from './HlsAdapter';

export class DebridAdapter extends AbstractSourceAdapter {
  readonly mode: PlaybackMode = 'debrid';
  private loadGeneration = 0;
  private delegate: HlsAdapter | null = null;

  async load(options: AdapterLoadOptions): Promise<void> {
    await super.load(options);
    const { source, videoElement, startTime } = options;
    const generation = ++this.loadGeneration;

    // Already an HTTP URL (WatchPage pre-resolved): never re-resolve, or every
    // mount creates another provider torrent. Delegate by URL shape.
    const initialUrl = String(source.url || '');
    if (/^https?:/i.test(initialUrl)) {
      await this.playHttp(initialUrl, options);
      return;
    }

    playbackEventBus.emit(PlayerEvents.BUFFERING, true);

    try {
      // source.url is the magnet link
      const resolvedUrl = await debridOrchestrator.resolveMagnetToStream(source.url, {
        episodeNumber: source.episodeNumber,
        filenameHint: source.filenameHint,
      });
      if (generation !== this.loadGeneration || this.videoElement !== videoElement) return;

      await this.playHttp(resolvedUrl, options);

    } catch (err: any) {
      if (generation !== this.loadGeneration) return;
      playbackEventBus.emit(PlayerEvents.ERROR, err.message);
      playbackEventBus.emit(PlayerEvents.BUFFERING, false);
      throw err;
    }
  }

  /** Play an already-resolved debrid HTTP URL (direct MP4 or HLS manifest). */
  private async playHttp(resolvedUrl: string, options: AdapterLoadOptions): Promise<void> {
    const { videoElement, startTime, source } = options;
    const isHls = /\.m3u8(?:$|[?#/])/i.test(resolvedUrl);

    // HLS-over-debrid needs hls.js — a bare <video> src silently fails in
    // Chrome/Electron. Delegate to HlsAdapter (direct URL, never proxied: the
    // CDN link is IP-pinned).
    if (isHls) {
      if (this.delegate) {
        try { await this.delegate.unload(); } catch { /* ignore */ }
      }
      const hls = new HlsAdapter();
      this.delegate = hls;
      await hls.load({
        ...options,
        source: { ...source, url: resolvedUrl, mode: 'hls' },
      });
      return;
    }

    // Bubble up events
    videoElement.onplay = () => playbackEventBus.emit(PlayerEvents.PLAY);
    videoElement.onpause = () => playbackEventBus.emit(PlayerEvents.PAUSE);
    videoElement.ontimeupdate = () => playbackEventBus.emit(PlayerEvents.TIME_UPDATE, videoElement.currentTime);
    videoElement.ondurationchange = () => playbackEventBus.emit(PlayerEvents.DURATION_CHANGE, videoElement.duration);
    videoElement.onwaiting = () => playbackEventBus.emit(PlayerEvents.BUFFERING, true);
    videoElement.onplaying = () => playbackEventBus.emit(PlayerEvents.BUFFERING, false);
    videoElement.onended = () => playbackEventBus.emit(PlayerEvents.ENDED);
    videoElement.onloadedmetadata = () => {
        if (Number.isFinite(startTime) && Number(startTime) > 0) {
          try { videoElement.currentTime = Number(startTime); } catch { /* metadata race */ }
        }
        playbackEventBus.emit(PlayerEvents.LOADED);
        playbackEventBus.emit(PlayerEvents.BUFFERING, false);
        if (options.autoPlay) videoElement.play().catch(() => {});
    };
    videoElement.onerror = (e) => playbackEventBus.emit(PlayerEvents.ERROR, e);

    // Debrid CDN URLs play direct — never route through the shared proxy
    // (IP-pinned, expiring, tokenized).
    videoElement.src = resolvedUrl;
    videoElement.load();
  }

  async unload(): Promise<void> {
    this.loadGeneration += 1;
    if (this.delegate) {
      try { await this.delegate.unload(); } catch { /* ignore */ }
      this.delegate = null;
    }
    if (this.videoElement) {
      this.videoElement.src = '';
      this.videoElement.onplay = null;
      this.videoElement.onpause = null;
      this.videoElement.ontimeupdate = null;
      this.videoElement.ondurationchange = null;
      this.videoElement.onwaiting = null;
      this.videoElement.onplaying = null;
      this.videoElement.onended = null;
      this.videoElement.onloadedmetadata = null;
      this.videoElement.onerror = null;
    }
    this.videoElement = null;
    this.currentSource = null;
  }

  async play(): Promise<void> {
    return this.videoElement?.play();
  }

  pause(): void {
    this.videoElement?.pause();
  }

  seek(time: number): void {
    if (this.videoElement) {
      this.videoElement.currentTime = time;
    }
  }

  setVolume(volume: number): void {
    if (this.videoElement) {
      this.videoElement.volume = volume;
    }
  }
}
