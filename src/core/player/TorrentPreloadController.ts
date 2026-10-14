import { automaticTransferAllowed } from '@/core/download/mobile/network-policy';
import { isP2PDisabled } from '@/lib/torrent/p2pPolicy';
import { Capacitor } from '@capacitor/core';
import { resolveExtensionApiBase, streamExtensionSources } from '@/hooks/media/useExtensionSourceStream';
import { parseReleaseName } from '@tatakai/release-parser';
export const PRELOAD_KEY = 'tatakai:preload-next-episode';
export class TorrentPreloadController {
  private session?: string;
  private started = false;
  private generation = 0;
  private childSession?: string;
  async update(session: string | undefined, nextEpisode: number | undefined, position: number, duration: number, context?: { anilistId?: number; title?: string }) {
    if (session !== this.session) { this.cancel(); this.session = session; }
    if (localStorage.getItem(PRELOAD_KEY) !== 'true' || isP2PDisabled()) { this.cancel(); return; }
    if (this.started) { if (!await automaticTransferAllowed()) this.cancel(); return; }
    if (!session || !nextEpisode || !Number.isFinite(duration) || duration <= 0 || position / duration < .8) return;
    this.started = true;
    const generation = this.generation;
    if (!await automaticTransferAllowed()) { this.started = false; return; }
    if (generation !== this.generation) return;
    const rt = (window as any).tatakaiRuntime || (window as any).electron;
    try {
      const local = await rt?.preloadNextTorrentEpisode?.(session, nextEpisode, 20 * 1024 * 1024);
      if (!local?.success && context?.anilistId && rt?.preloadTorrentSource) {
        const base = await resolveExtensionApiBase(Capacitor.isNativePlatform());
        const namespaces = (base.namespaces || []).filter(ns => (ns.routes || []).some(route => ['sources', 'torrent'].includes(route)));
        // Discover one next release without adding a debrid transfer or entering a swarm.
        for (const ns of namespaces) {
          if (generation !== this.generation) break;
          const sources = await streamExtensionSources(ns.namespace, { anilistId: context.anilistId, titles: context.title ? [context.title] : undefined,
            episode: nextEpisode, resolution: '1080p', preferredLanguage: 'sub', route: ns.routes.includes('sources') ? 'sources' : 'torrent' }, 15000);
          const source = sources.find((candidate: any) => {
            const magnet = candidate.magnet || candidate.magnetLink || candidate.url;
            const parsed = parseReleaseName(candidate.filenameHint || candidate.title || candidate.name || '');
            return /^magnet:/i.test(magnet || '') && (parsed.episodeNumber == null || parsed.episodeNumber === nextEpisode);
          });
          if (!source || generation !== this.generation || !await automaticTransferAllowed() || isP2PDisabled()) continue;
          const result = await rt.preloadTorrentSource(source.magnet || source.magnetLink || source.url, nextEpisode, 20 * 1024 * 1024);
          if (result?.success && result.ownsSession && result.sessionId) {
            if (generation !== this.generation) void rt.releaseTorrentPreload?.(result.sessionId);
            else this.childSession = result.sessionId;
          }
          break;
        }
      }
    }
    catch { /* Preloading must never interrupt the current episode. */ }
    if (generation !== this.generation) void rt?.cancelTorrentPreload?.(session);
  }
  cancel() {
    if (this.session) void ((window as any).tatakaiRuntime || (window as any).electron)?.cancelTorrentPreload?.(this.session);
    if (this.childSession) void ((window as any).tatakaiRuntime || (window as any).electron)?.releaseTorrentPreload?.(this.childSession);
    this.childSession = undefined;
    this.started = false; this.session = undefined; ++this.generation;
  }
}
