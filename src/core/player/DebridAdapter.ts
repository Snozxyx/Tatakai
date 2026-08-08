import { AbstractSourceAdapter, AdapterLoadOptions } from './SourceAdapterRegistry';
import { PlaybackMode } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';
import { debridOrchestrator } from '../providers/debrid-orchestrator';

export class DebridAdapter extends AbstractSourceAdapter {
  readonly mode: PlaybackMode = 'debrid' as any; // Adding 'debrid' to modes

  async load(options: AdapterLoadOptions): Promise<void> {
    await super.load(options);
    const { source, videoElement, startTime } = options;

    playbackEventBus.emit(PlayerEvents.BUFFERING, true);
    
    try {
      // source.url is the magnet link
      const resolvedUrl = await debridOrchestrator.resolveMagnetToStream(source.url);
      
      videoElement.src = resolvedUrl;
      
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
      videoElement.onloadedmetadata = () => {
          playbackEventBus.emit(PlayerEvents.LOADED);
          playbackEventBus.emit(PlayerEvents.BUFFERING, false);
      };
      videoElement.onerror = (e) => playbackEventBus.emit(PlayerEvents.ERROR, e);

    } catch (err: any) {
      playbackEventBus.emit(PlayerEvents.ERROR, err.message);
      playbackEventBus.emit(PlayerEvents.BUFFERING, false);
      throw err;
    }
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
