import { AbstractSourceAdapter, AdapterLoadOptions } from './SourceAdapterRegistry';
import { PlaybackMode } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';
import { buildProxyCandidateUrls, isLoopbackProxyUrl } from './stream-resolver';
import { upsertLocalTorrentSessionHistory } from '@/lib/localStorage';

export class TorrentAdapter extends AbstractSourceAdapter {
  readonly mode: PlaybackMode = 'torrent';
  private sessionId: string | null = null;
  private stopListener: (() => void) | null = null;

  async load(options: AdapterLoadOptions): Promise<void> {
    await super.load(options);
    const { source, videoElement, startTime } = options;

    // WatchPage may already resolve torrent playback to a playable HTTP URL.
    // In that case, treat the URL as final media and do not start a new session.
    if (source.url.startsWith('http') || source.url.startsWith('file://')) {
      const referer = (source as any).headers?.Referer;
      const userAgent = (source as any).headers?.['User-Agent'];

      let finalUrl = source.url;
      if (!isLoopbackProxyUrl(source.url)) {
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

      videoElement.onplay = () => playbackEventBus.emit(PlayerEvents.PLAY);
      videoElement.onpause = () => playbackEventBus.emit(PlayerEvents.PAUSE);
      videoElement.ontimeupdate = () => playbackEventBus.emit(PlayerEvents.TIME_UPDATE, videoElement.currentTime);
      videoElement.ondurationchange = () => playbackEventBus.emit(PlayerEvents.DURATION_CHANGE, videoElement.duration);
      videoElement.onwaiting = () => playbackEventBus.emit(PlayerEvents.BUFFERING, true);
      videoElement.onplaying = () => playbackEventBus.emit(PlayerEvents.BUFFERING, false);
      videoElement.onended = () => playbackEventBus.emit(PlayerEvents.ENDED);
      videoElement.onloadedmetadata = () => playbackEventBus.emit(PlayerEvents.LOADED);
      videoElement.onerror = (e) => playbackEventBus.emit(PlayerEvents.ERROR, e);
      return;
    }

    // source.url for torrent mode is the infoHash or magnet
    const infoHash = source.url;
    
    try {
      // 1. Start torrent session via bridge
      const session = await (window as any).tatakaiRuntime.startTorrentSession(infoHash, {
        autoSelectLargest: true
      });

      if (!session.success) {
        throw new Error(session.error || 'Failed to start torrent session');
      }

      this.sessionId = session.sessionId;

      try {
        upsertLocalTorrentSessionHistory({
          sessionId: session.sessionId,
          infoHash: session.infoHash || infoHash,
          torrentName: session.name,
          fileName: session.fileName,
          fileIndex: session.fileIndex ?? 0,
          status: 'active',
          progress: 0,
        });
      } catch {
        // Ignore storage failures.
      }

      // 2. Get stream URL
      const stream = await (window as any).tatakaiRuntime.getTorrentStreamUrl(this.sessionId);
      if (!stream.success) {
        throw new Error(stream.error || 'Failed to get torrent stream URL');
      }

      videoElement.src = stream.url;

      if (startTime) {
        videoElement.currentTime = startTime;
      }

      if (options.autoPlay) {
        videoElement.play().catch(() => {});
      }

      // 3. Listen for progress events
      this.stopListener = (window as any).tatakaiRuntime.onTorrentProgress((stats: any) => {
        if (stats.sessionId === this.sessionId) {
          playbackEventBus.emit('torrent:progress', stats);
        }
      });

      // Bubble up standard events
      videoElement.onplay = () => playbackEventBus.emit(PlayerEvents.PLAY);
      videoElement.onpause = () => playbackEventBus.emit(PlayerEvents.PAUSE);
      videoElement.ontimeupdate = () => playbackEventBus.emit(PlayerEvents.TIME_UPDATE, videoElement.currentTime);
      videoElement.ondurationchange = () => playbackEventBus.emit(PlayerEvents.DURATION_CHANGE, videoElement.duration);
      videoElement.onwaiting = () => playbackEventBus.emit(PlayerEvents.BUFFERING, true);
      videoElement.onplaying = () => playbackEventBus.emit(PlayerEvents.BUFFERING, false);
      videoElement.onended = () => playbackEventBus.emit(PlayerEvents.ENDED);
      videoElement.onloadedmetadata = () => playbackEventBus.emit(PlayerEvents.LOADED);
      videoElement.onerror = (e) => playbackEventBus.emit(PlayerEvents.ERROR, e);

    } catch (err: any) {
      playbackEventBus.emit(PlayerEvents.ERROR, err.message);
      throw err;
    }
  }

  async unload(): Promise<void> {
    if (this.sessionId) {
      await (window as any).tatakaiRuntime.stopTorrentSession(this.sessionId);
      this.sessionId = null;
    }

    if (this.stopListener) {
      this.stopListener();
      this.stopListener = null;
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
