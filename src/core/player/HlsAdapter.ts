import Hls from 'hls.js';
import { AbstractSourceAdapter, AdapterLoadOptions } from './SourceAdapterRegistry';
import { PlaybackMode } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';
import { buildProxyCandidateUrls, isLoopbackProxyUrl } from './stream-resolver';

export class HlsAdapter extends AbstractSourceAdapter {
  readonly mode: PlaybackMode = 'hls';
  private hls: Hls | null = null;

  async load(options: AdapterLoadOptions): Promise<void> {
    await super.load(options);
    const { source, videoElement, startTime } = options;

    const referer = (source as any).headers?.Referer;
    const userAgent = (source as any).headers?.['User-Agent'];
    
    // Resolve possible proxy candidates for the HLS stream
    let finalUrl = source.url;
    if (source.url.startsWith('http') && !isLoopbackProxyUrl(source.url)) {
      const proxyCandidates = buildProxyCandidateUrls(source.url, referer, userAgent);
      finalUrl = proxyCandidates[0] || source.url;
    }

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

    // Error handling for better recovery
    this.hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.error('[HlsAdapter] Fatal network error, trying to recover...');
            this.hls?.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.error('[HlsAdapter] Fatal media error, trying to recover...');
            this.hls?.recoverMediaError();
            break;
          default:
            console.error('[HlsAdapter] Unrecoverable fatal error:', data.details);
            this.unload();
            playbackEventBus.emit(PlayerEvents.ERROR, { reason: data.details });
            break;
        }
      }
    });

    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (startTime) videoElement.currentTime = startTime;
      if (options.autoPlay) videoElement.play().catch(() => {});
      playbackEventBus.emit(PlayerEvents.LOADED);
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

    this.hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            this.hls?.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            this.hls?.recoverMediaError();
            break;
          default:
            this.unload();
            playbackEventBus.emit(PlayerEvents.ERROR, data);
            break;
        }
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
