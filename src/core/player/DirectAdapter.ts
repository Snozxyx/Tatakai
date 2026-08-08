import { AbstractSourceAdapter, AdapterLoadOptions } from './SourceAdapterRegistry';
import { PlaybackMode } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';
import { buildProxyCandidateUrls, isLoopbackProxyUrl } from './stream-resolver';

export class DirectAdapter extends AbstractSourceAdapter {
  readonly mode: PlaybackMode = 'direct';

  async load(options: AdapterLoadOptions): Promise<void> {
    await super.load(options);
    const { source, videoElement, startTime } = options;

    const referer = (source as any).headers?.Referer;
    const userAgent = (source as any).headers?.['User-Agent'];
    
    // Resolve possible proxy candidates if it's an external URL
    let finalUrl = source.url;
    if (source.url.startsWith('http') && !isLoopbackProxyUrl(source.url)) {
        const proxyCandidates = buildProxyCandidateUrls(source.url, referer, userAgent);
        finalUrl = proxyCandidates[0] || source.url;
    }

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
    videoElement.onerror = (e) => playbackEventBus.emit(PlayerEvents.ERROR, e);
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
