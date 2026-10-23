import { AbstractSourceAdapter, type AdapterLoadOptions } from './SourceAdapterRegistry';
import { playbackEventBus, PlayerEvents } from './PlaybackEventBus';
import { proxyRemoteUrl } from '@/core/extensions/remote/media';

/** Shared by desktop and mobile players; requests stay on the device's header proxy. */
export async function attachDashTransport(options: AdapterLoadOptions, onError: () => void) {
  const dash = await import('dashjs');
  options.signal?.throwIfAborted();
  const player = dash.MediaPlayer().create();
  const urls = new Map<string, string>();
  player.addRequestInterceptor(async request => {
    options.signal?.throwIfAborted();
    const original = request.url;
    const local = await proxyRemoteUrl(original, options.source.headers || {}, true);
    options.signal?.throwIfAborted();
    if (urls.size > 2000) urls.delete(urls.keys().next().value!);
    urls.set(local, original); request.url = local;
    return request;
  });
  player.addResponseInterceptor(async response => {
    // Relative MPD entries resolve against the upstream URL, never an opaque token.
    const original = urls.get(response.url) || urls.get(response.request.url);
    if (original) response.url = original;
    return response;
  });
  player.on(dash.MediaPlayer.events.ERROR, onError);
  try {
    player.initialize(options.videoElement, options.source.originalUrl || options.source.url, options.autoPlay !== false, options.startTime || 0);
    return player;
  } catch (error) { player.reset(); throw error; }
}

/** MPEG-DASH manifests and fragments use the same on-device header proxy as extensions. */
export class DashAdapter extends AbstractSourceAdapter {
  readonly mode = 'dash' as const;
  private player: import('dashjs').MediaPlayerClass | null = null;
  async load(options: AdapterLoadOptions) {
    await super.load(options);
    const video = options.videoElement;
    video.onplay = () => playbackEventBus.emit(PlayerEvents.PLAY);
    video.onpause = () => playbackEventBus.emit(PlayerEvents.PAUSE);
    video.ontimeupdate = () => playbackEventBus.emit(PlayerEvents.TIME_UPDATE, video.currentTime);
    video.ondurationchange = () => playbackEventBus.emit(PlayerEvents.DURATION_CHANGE, video.duration);
    video.onwaiting = () => playbackEventBus.emit(PlayerEvents.BUFFERING, true);
    video.onplaying = () => playbackEventBus.emit(PlayerEvents.BUFFERING, false);
    video.onended = () => playbackEventBus.emit(PlayerEvents.ENDED);
    video.onloadedmetadata = () => playbackEventBus.emit(PlayerEvents.LOADED);
    this.player = await attachDashTransport(options, () => playbackEventBus.emit(PlayerEvents.ERROR, { reason: 'dash_error' }));
  }
  async unload() {
    this.player?.reset(); this.player = null;
    if (this.videoElement) {
      const video = this.videoElement;
      video.onplay = video.onpause = video.ontimeupdate = video.ondurationchange = video.onwaiting = video.onplaying = video.onended = video.onloadedmetadata = null;
      video.removeAttribute('src'); video.load();
    }
    this.videoElement = null; this.currentSource = null;
  }
  async play() { await this.videoElement?.play(); }
  pause() { this.videoElement?.pause(); }
  seek(time: number) { if (this.videoElement) this.videoElement.currentTime = time; }
  setVolume(value: number) { if (this.videoElement) this.videoElement.volume = value; }
}
