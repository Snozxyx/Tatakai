import { AbstractSourceAdapter, AdapterLoadOptions } from './SourceAdapterRegistry';
import { PlaybackMode } from './player-core';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';
import { buildProxyCandidateUrls, isLoopbackProxyUrl } from './stream-resolver';
import { upsertLocalTorrentSessionHistory } from '@/lib/localStorage';
import { setActivity, clearActivity } from '@/core/activity/activity-monitor';
import { isP2PDisabled } from '@/lib/torrent/p2pPolicy';

const fmtSpeed = (b?: number): string | null => {
  if (!b || b <= 0) return null;
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${Math.max(1, Math.round(b / 1024))} KB/s`;
};

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

      // Loopback (native torrent server / desktop proxy) plays directly.
      // Remote HTTP torrents get the same proxy candidate ladder as direct
      // MP4 so one dead candidate costs a re-mount, not a server switch.
      const candidates = !isLoopbackProxyUrl(source.url)
        ? buildProxyCandidateUrls(source.url, referer, userAgent).slice(0, 8)
        : [source.url];
      const finalUrl = candidates[0] || source.url;
      let candidateIndex = 0;

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
      videoElement.onerror = () => {
        if (candidateIndex < candidates.length - 1) {
          candidateIndex += 1;
          try {
            videoElement.src = candidates[candidateIndex];
            videoElement.load();
            if (options.autoPlay) videoElement.play().catch(() => {});
            return;
          } catch {
            /* fall through */
          }
        }
        playbackEventBus.emit(PlayerEvents.ERROR, {
          reason: 'torrent_http_error',
          url: candidates[candidateIndex],
        });
      };
      return;
    }

    // source.url for torrent mode is the infoHash or magnet
    const infoHash = source.url;

    // Hard stop for the P2P kill-switch: even a path that bypasses the UI
    // gates must never join a swarm. HTTP/file URLs above are already-resolved
    // media (debrid, loopback, direct) and are unaffected.
    if (isP2PDisabled()) {
      const err = new Error('P2P torrents are disabled in Settings. Use a debrid service to play this release.');
      playbackEventBus.emit(PlayerEvents.ERROR, err.message);
      throw err;
    }
    
    try {
      // 1. Start torrent session via bridge
      const session = await (window as any).tatakaiRuntime.startTorrentSession(infoHash, {
        autoSelectLargest: true
      });

      if (!session.success) {
        throw new Error(session.error || 'Failed to start torrent session');
      }

      this.sessionId = session.sessionId;

      setActivity('torrent', {
        kind: 'torrenting',
        label: session.name || session.fileName || 'Torrent stream',
        detail: 'Connecting…',
      });

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

      // 2. Wait for the head of the file before mounting <video>: the native
      // loopback server answers 503 while nothing is verifiable, which the
      // player would surface as a hard error. Best-effort (8s) so a slow swarm
      // still starts instead of stalling on the spinner.
      try {
        const ensure = (window as any).tatakaiRuntime.ensureTorrentPrebuffer;
        if (typeof ensure === 'function' && this.sessionId) {
          await Promise.race([
            ensure(this.sessionId),
            new Promise((resolve) => setTimeout(resolve, 8000)),
          ]);
        }
      } catch {
        /* start anyway — progress overlay shows peers/speed */
      }

      // 3. Get stream URL
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

      // 4. Listen for progress events
      this.stopListener = (window as any).tatakaiRuntime.onTorrentProgress((stats: any) => {
        if (stats.sessionId === this.sessionId) {
          playbackEventBus.emit('torrent:progress', stats);
          const dl = fmtSpeed(stats.downloadSpeed ?? stats.dlSpeedBps);
          const peers = stats.numPeers ?? stats.peers;
          const detail = [dl ? `↓ ${dl}` : null, typeof peers === 'number' && peers > 0 ? `${peers} peers` : null]
            .filter(Boolean)
            .join(' · ');
          setActivity('torrent', {
            kind: 'torrenting',
            detail: detail || undefined,
            progress: typeof stats.progress === 'number' ? Math.round(stats.progress * (stats.progress <= 1 ? 100 : 1)) : undefined,
          });
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
    clearActivity('torrent');
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
