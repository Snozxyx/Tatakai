import { AbstractSourceAdapter, AdapterLoadOptions } from './SourceAdapterRegistry';
import { PlaybackMode } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';
import { buildProxyCandidateUrls, isLoopbackProxyUrl } from './stream-resolver';

export class DirectAdapter extends AbstractSourceAdapter {
  readonly mode: PlaybackMode = 'direct';
  private candidates: string[] = [];
  private candidateIndex = 0;

  async load(options: AdapterLoadOptions): Promise<void> {
    await super.load(options);
    const { source, videoElement, startTime } = options;

    const referer = (source as any).headers?.Referer;
    const userAgent = (source as any).headers?.['User-Agent'];
    const refererCandidates = (source as any).refererCandidates as string[] | undefined;

    // Candidate ladder (HlsAdapter parity): mounting `proxy[0]` blindly meant
    // a dead proxy base or wrong Referer sat on a spinner until the page-level
    // failover fired. Advance through candidates on `<video>` error instead.
    // Loopback (desktop proxy / native mobile proxy / torrent server) plays
    // directly — wrapping it would strip the headers that make it work.
    if (source.url.startsWith('http') && !isLoopbackProxyUrl(source.url)) {
        this.candidates = buildProxyCandidateUrls(
          source.url, referer, userAgent, undefined, undefined, refererCandidates,
        ).slice(0, 8);
    } else {
        this.candidates = [source.url];
    }
    if (this.candidates.length === 0) this.candidates = [source.url];
    this.candidateIndex = 0;
    const finalUrl = this.candidates[0];

    videoElement.src = finalUrl;
    
    if (startTime) {
      videoElement.currentTime = startTime;
    }

    if (options.autoPlay) {
      videoElement.play().catch(() => {});
    }

    // Bubble up events
    videoElement.onplay = () => playbackEventBus.emit(PlayerEvents.PLAY);
    videoElement.onpause = () => playbackEventBus.emit(PlayerEvents.PAUSE);
    videoElement.ontimeupdate = () => playbackEventBus.emit(PlayerEvents.TIME_UPDATE, videoElement.currentTime);
    videoElement.ondurationchange = () => playbackEventBus.emit(PlayerEvents.DURATION_CHANGE, videoElement.duration);
    videoElement.onwaiting = () => playbackEventBus.emit(PlayerEvents.BUFFERING, true);
    videoElement.onplaying = () => playbackEventBus.emit(PlayerEvents.BUFFERING, false);
    videoElement.onended = () => playbackEventBus.emit(PlayerEvents.ENDED);
    videoElement.onloadedmetadata = () => playbackEventBus.emit(PlayerEvents.LOADED);
    videoElement.onerror = () => {
      // Fail over to the next proxy candidate before surfacing the error, so
      // one dead candidate costs a re-mount, not a server switch.
      if (this.candidateIndex < this.candidates.length - 1) {
        this.candidateIndex += 1;
        const next = this.candidates[this.candidateIndex];
        try {
          videoElement.src = next;
          videoElement.load();
          if (options.autoPlay) videoElement.play().catch(() => {});
          return;
        } catch {
          /* fall through to error */
        }
      }
      playbackEventBus.emit(PlayerEvents.ERROR, {
        reason: 'direct_error',
        url: this.candidates[this.candidateIndex],
      });
    };
  }

  async unload(): Promise<void> {
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
