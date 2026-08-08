import { AbstractSourceAdapter, AdapterLoadOptions } from './SourceAdapterRegistry';
import { PlaybackMode } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';

export class OfflineAdapter extends AbstractSourceAdapter {
  readonly mode: PlaybackMode = 'offline';

  async load(options: AdapterLoadOptions): Promise<void> {
    await super.load(options);
    const { source, videoElement, startTime } = options;

    const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
    let playableUrl = source.url;

    if (playableUrl.startsWith('tatakai-media://')) {
      // Already using our custom protocol — use as-is
    } else if (playableUrl.startsWith('file://')) {
      if (isElectron) {
        // Convert file:// → tatakai-media:// to bypass webSecurity restrictions
        const rawPath = playableUrl.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, '');
        playableUrl = `tatakai-media:///${rawPath.replace(/ /g, '%20')}`;
      }
    } else if (!playableUrl.startsWith('http')) {
      // Raw absolute path
      const normalized = playableUrl.replace(/\\/g, '/');
      const encoded = normalized.replace(/ /g, '%20');
      if (isElectron) {
        playableUrl = /^[A-Za-z]:\//.test(normalized)
          ? `tatakai-media:///${encoded}`
          : `tatakai-media://${encoded}`;
      } else {
        playableUrl = /^[A-Za-z]:\//.test(normalized)
          ? `file:///${encoded}`
          : `file://${encoded}`;
      }
    }

    videoElement.src = playableUrl;
    
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
