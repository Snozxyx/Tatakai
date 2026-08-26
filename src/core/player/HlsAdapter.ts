import Hls from 'hls.js';
import { AbstractSourceAdapter, AdapterLoadOptions } from './SourceAdapterRegistry';
import { PlaybackMode } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';
import { buildProxyCandidateUrls, isLoopbackProxyUrl } from './stream-resolver';

export class HlsAdapter extends AbstractSourceAdapter {
  readonly mode: PlaybackMode = 'hls';
  private hls: Hls | null = null;

  /**
   * Every URL we can try for the current source, best first. hls.js only ever
   * loads one at a time; when a URL is exhausted we advance the index and
   * re-`loadSource`, which is the difference between "this proxy candidate is
   * dead" and "this stream is dead".
   */
  private candidates: string[] = [];
  private candidateIndex = 0;
  private networkRetries = 0;
  private mediaRetries = 0;
  private recovering = false;

  /**
   * Bounds on in-place recovery before we give up on a URL. hls.js already
   * retries individual fragment/level loads internally (see the
   * `*LoadingMaxRetry` config), so these count *fatal* errors — the ones that
   * mean the whole load is stuck. Without a bound, `startLoad()` on a
   * permanently broken URL (an expired proxy token, a 403, a body Chrome
   * refuses to decode) loops forever and the player just sits there.
   */
  private static readonly MAX_NETWORK_RETRIES = 3;
  private static readonly MAX_MEDIA_RETRIES = 2;

  async load(options: AdapterLoadOptions): Promise<void> {
    await super.load(options);
    const { source, videoElement, startTime } = options;

    const referer = (source as any).headers?.Referer;
    const userAgent = (source as any).headers?.['User-Agent'];

    // A loopback URL is already the in-app proxy (the extension host registered
    // the source's headers with it), so there is nothing to wrap it in — going
    // through the remote proxy would just strip the headers that make it work.
    this.candidates =
      source.url.startsWith('http') && !isLoopbackProxyUrl(source.url)
        ? buildProxyCandidateUrls(source.url, referer, userAgent)
        : [source.url];
    if (this.candidates.length === 0) this.candidates = [source.url];
    this.candidateIndex = 0;
    this.networkRetries = 0;
    this.mediaRetries = 0;
    this.recovering = false;

    const finalUrl = this.candidates[0];

    if (!Hls.isSupported()) {
      if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = finalUrl;
        if (startTime) videoElement.currentTime = startTime;
      } else {
        throw new Error('HLS is not supported in this browser');
      }
      return;
    }

    this.hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 300, // Keep more in back buffer for seeking
      maxBufferLength: 600,  // Increase forward buffer
      maxMaxBufferLength: 1200,
      startFragPrefetch: true,
      abrEwmaDefaultEstimate: 5000000, // 5Mbps initial estimate
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 1000,
      levelLoadingMaxRetry: 6,
      manifestLoadingMaxRetry: 6,
    });

    this.hls.loadSource(finalUrl);
    this.hls.attachMedia(videoElement);

    this.hls.on(Hls.Events.ERROR, (_event, data) => this.handleError(data));

    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (startTime) videoElement.currentTime = startTime;
      if (options.autoPlay) videoElement.play().catch(() => {});
      playbackEventBus.emit(PlayerEvents.LOADED);
    });

    // A buffered fragment means the current URL genuinely works, so spend the
    // retry budget again on whatever breaks later in the stream rather than
    // carrying the count from a rough start.
    this.hls.on(Hls.Events.FRAG_BUFFERED, () => {
      this.networkRetries = 0;
      this.mediaRetries = 0;
      this.recovering = false;
    });

    // Audio tracks updated
    this.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      try {
        const tracks = (this.hls?.audioTracks || []).map((t: any, idx: number) => ({ id: idx, label: t.name || t.lang || `Track ${idx + 1}`, lang: t.lang }));
        playbackEventBus.emit(PlayerEvents.AUDIO_TRACKS, tracks);
      } catch (e) {
        // ignore
      }
    });

    // Subtitle tracks updated
    this.hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
      try {
        const tracks = (this.hls?.subtitleTracks || []).map((t: any, idx: number) => ({ id: idx, label: t.name || t.lang || `Sub ${idx + 1}`, lang: t.lang }));
        playbackEventBus.emit(PlayerEvents.SUBTITLE_TRACKS, tracks);
      } catch (e) {
        // ignore
      }
    });

    // Bubble up events
    videoElement.onplay = () => playbackEventBus.emit(PlayerEvents.PLAY);
    videoElement.onpause = () => playbackEventBus.emit(PlayerEvents.PAUSE);
    videoElement.ontimeupdate = () => playbackEventBus.emit(PlayerEvents.TIME_UPDATE, videoElement.currentTime);
    videoElement.ondurationchange = () => playbackEventBus.emit(PlayerEvents.DURATION_CHANGE, videoElement.duration);
    videoElement.onwaiting = () => playbackEventBus.emit(PlayerEvents.BUFFERING, true);
    videoElement.onplaying = () => playbackEventBus.emit(PlayerEvents.BUFFERING, false);
    videoElement.onended = () => playbackEventBus.emit(PlayerEvents.ENDED);
  }

  /**
   * Single fatal-error path for the adapter.
   *
   * There used to be two `Hls.Events.ERROR` listeners doing the same thing, so
   * every fatal network error called `startLoad()` twice with no attempt ceiling
   * — which is what turned one bad response into an endless
   * "Fatal network error, trying to recover..." loop in the console.
   */
  private handleError(data: any): void {
    if (!data?.fatal || !this.hls) return;

    const detail = data.details || 'unknown';
    const status = data.response?.code ?? data.networkDetails?.status;

    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR: {
        // A local proxy token lives 15 minutes; 410 is it telling us the token
        // is gone. Retrying cannot help — the source has to be resolved again,
        // so surface it as a distinct reason rather than burning the budget.
        if (status === 410) {
          this.fail('proxy_token_expired', detail, status);
          return;
        }
        if (this.networkRetries < HlsAdapter.MAX_NETWORK_RETRIES) {
          this.networkRetries += 1;
          console.warn(
            `[HlsAdapter] network error (${detail}${status ? ` status=${status}` : ''}), ` +
              `retry ${this.networkRetries}/${HlsAdapter.MAX_NETWORK_RETRIES}`,
          );
          this.restartLoad();
          return;
        }
        // This URL is spent — move to the next candidate, if there is one.
        if (!this.advanceCandidate()) {
          this.fail('network_error', detail, status);
        }
        return;
      }

      case Hls.ErrorTypes.MEDIA_ERROR: {
        if (this.mediaRetries < HlsAdapter.MAX_MEDIA_RETRIES) {
          this.mediaRetries += 1;
          console.warn(
            `[HlsAdapter] media error (${detail}), recover ${this.mediaRetries}/${HlsAdapter.MAX_MEDIA_RETRIES}`,
          );
          // The second attempt swaps the audio codec, which is hls.js's
          // documented escalation for a buffer append that keeps failing.
          if (this.mediaRetries > 1) {
            try {
              (this.hls as any).swapAudioCodec?.();
            } catch {
              /* not all builds expose it */
            }
          }
          this.hls.recoverMediaError();
          return;
        }
        this.fail('media_error', detail, status);
        return;
      }

      default:
        this.fail('fatal_error', detail, status);
    }
  }

  /** `startLoad()` with a small backoff, guarded against overlapping calls. */
  private restartLoad(): void {
    if (this.recovering) return;
    this.recovering = true;
    const delay = 500 * this.networkRetries;
    setTimeout(() => {
      this.recovering = false;
      try {
        this.hls?.startLoad();
      } catch {
        /* destroyed mid-recovery */
      }
    }, delay);
  }

  /**
   * Load the next candidate URL for the same source. Returns false when the list
   * is exhausted, which is the caller's signal to give up.
   */
  private advanceCandidate(): boolean {
    if (this.candidateIndex >= this.candidates.length - 1) return false;
    this.candidateIndex += 1;
    this.networkRetries = 0;
    this.recovering = false;
    const next = this.candidates[this.candidateIndex];
    console.warn(
      `[HlsAdapter] switching to candidate ${this.candidateIndex + 1}/${this.candidates.length}`,
    );
    try {
      this.hls?.loadSource(next);
      this.hls?.startLoad();
      return true;
    } catch {
      return false;
    }
  }

  /** Give up on this source and tell the app, so it can pick another server. */
  private fail(reason: string, detail: string, status?: number): void {
    console.error(`[HlsAdapter] giving up: ${reason} (${detail}${status ? ` status=${status}` : ''})`);
    const url = this.candidates[this.candidateIndex];
    void this.unload();
    playbackEventBus.emit(PlayerEvents.ERROR, { reason, detail, status, url });
  }

  setAudioTrack(index: number): void {
    if (this.hls) {
      try {
        // hls.audioTrack expects an index
        (this.hls as any).audioTrack = index;
        playbackEventBus.emit(PlayerEvents.AUDIO_TRACKS, (this.hls.audioTracks || []).map((t: any, idx: number) => ({ id: idx, label: t.name || t.lang || `Track ${idx + 1}`, lang: t.lang })));
      } catch (e) {
        // ignore
      }
    }
  }

  setSubtitleTrack(index: number): void {
    if (this.hls) {
      try {
        // hls.subtitleTrack expects an index, or -1 to disable
        (this.hls as any).subtitleTrack = index;
        playbackEventBus.emit(PlayerEvents.SUBTITLE_TRACKS, (this.hls.subtitleTracks || []).map((t: any, idx: number) => ({ id: idx, label: t.name || t.lang || `Sub ${idx + 1}`, lang: t.lang })));
      } catch (e) {
        // ignore
      }
    }
  }

  async unload(): Promise<void> {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
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
