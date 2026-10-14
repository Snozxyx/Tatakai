import { resolveExtensionApiBase, streamExtensionSources } from '@/hooks/media/useExtensionSourceStream';
import { db } from '../db';
import type { DownloadRule } from '../db/tatakai-db';
import { contentGraph } from '../content/content-graph';
import { extensionRegistry } from '../extensions/ExtensionRegistry';
import { evaluateCandidates, type EvaluationCandidate } from '@tatakai/candidate-evaluator';
import { parseReleaseName } from '@tatakai/release-parser';
import { fetchEpisodes } from '@/lib/api/api-client';
import { availableDownloadEpisodes } from '@/lib/episodeAvailability';
import { startMobileDownload } from './mobile/mobileDownloader';
import { automaticTransferAllowed } from './mobile/network-policy';
import { Capacitor } from '@capacitor/core';

export async function simulateAutoDownload(ruleId: string, episode?: number) {
  const rule = await db.downloadRules.get(ruleId);
  if (!rule) {
    const api = (window as any).electron?.autoDownload;
    if (api?.simulate) return api.simulate(ruleId, episode);
    throw new Error('Download rule not found');
  }
  const media = await contentGraph.getMedia(String(rule.animeId));
  if (!media) throw new Error('Series metadata is unavailable');
  const target = episode ?? rule.lastCheckedEpisode + 1;
  if (!Number.isInteger(target) || target < 1) throw new Error('Invalid episode number');
  const episodeList = await fetchEpisodes(String(rule.animeId));
  const available = availableDownloadEpisodes(episodeList.episodes).find(e => e.number === target);
  if (!available) return { ranked: [], selected: null, message: 'Episode is not confirmed available' };
  const titles = [media.titleEnglish, media.titleRomaji, media.titleNative, ...(media.synonyms || [])].filter((title): title is string => !!title);
  const candidates: EvaluationCandidate[] = [];
  const language = rule.preferredLanguages?.[0] || rule.audioLanguage || 'ja';
  const base = await resolveExtensionApiBase(Capacitor.isNativePlatform());
  const namespaces = (base.namespaces || []).filter(ns => (ns.routes || []).some(route => route === 'sources' || route === 'stream'));
  const resolved = await Promise.allSettled(namespaces.map(async ns => {
    const sources = await streamExtensionSources(ns.namespace, { anilistId: media.anilistId, titles, episode: target,
      resolution: rule.scoringProfile === 'data-saver' ? '720p' : rule.preferredQuality,
      preferredLanguage: language === 'ja' || language === 'sub' ? 'sub' : 'dub', route: 'sources' }, 15000);
    return sources.map(source => makeCandidate(source, ns.namespace, titles[0], target));
  }));
  for (const result of resolved) if (result.status === 'fulfilled') candidates.push(...result.value);
  const searches = await Promise.allSettled(extensionRegistry.getSearchProviders().map(async provider => {
    const results = await provider.search(`${titles[0]} ${target}`);
    return (results || []).filter(source => source.url || source.magnet || source.magnetLink).map(source => makeCandidate(source, provider.id));
  }));
  for (const result of searches) if (result.status === 'fulfilled') candidates.push(...result.value);
  const unique = [...new Map(candidates.map(c => [c.id, c])).values()];
  return { ...evaluateCandidates(rule, unique, target, titles), episode: target, media };
}

function makeCandidate(source: any, providerId: string, contextualTitle?: string, contextualEpisode?: number): EvaluationCandidate {
  const parsed = parseReleaseName(source.title || source.name || contextualTitle || '');
  const url = source.url || source.magnet || source.magnetLink;
  const torrent = /^magnet:/i.test(url);
  return { id: `${providerId}:${url}`, payload: { ...source, url }, candidate: {
    title: contextualTitle && !torrent ? contextualTitle : parsed.title || contextualTitle,
    episodeNumber: source.episodeNumber ?? (torrent ? parsed.episodeNumber ?? contextualEpisode : contextualEpisode ?? parsed.episodeNumber),
    seasonNumber: source.seasonNumber ?? parsed.season, quality: source.quality || parsed.resolution,
    language: source.audioLanguage || source.language || parsed.audio,
    providerId, sourceType: torrent ? 'torrent' : 'hls', releaseGroup: parsed.releaseGroup, subtitles: source.subtitles,
  } };
}

let running: Promise<void> | null = null;
export function checkAndRunAutomation(): Promise<void> {
  if (running) return running;
  running = runAutomation().finally(() => { running = null; });
  return running;
}
async function runAutomation() {
  if (!Capacitor.isNativePlatform() && !(window as any).electron?.startDownload) return;
  if (!await automaticTransferAllowed()) return;
  const rules = (await db.downloadRules.toArray()).filter(rule => rule.enabled);
  const legacy = await (window as any).electron?.autoDownload?.list?.() || [];
  for (const rule of rules) {
    // Main-process subscriptions retain their sole scheduler ownership.
    if (legacy.some((sub: any) => String(sub.animeId || sub.id) === String(rule.animeId))) continue;
    try {
      const simulation = await simulateAutoDownload(rule.id);
      if (!simulation.selected) continue;
      const source = simulation.selected.payload;
      const episode = rule.lastCheckedEpisode + 1;
      const episodeId = `auto-${rule.animeId}-${episode}`;
      if ((await db.offlineEpisodes.get(episodeId))) continue;
      const input = { episodeId, animeId: String(rule.animeId), animeName: rule.animeTitle, episodeNumber: episode,
        wifiOnly: localStorage.getItem('tatakai:automation-wifi-only') !== 'false',
        url: source.url || source.magnet, magnet: source.magnet, sourceType: simulation.selected.candidate.sourceType,
        headers: source.headers || {}, subtitles: rule.autoDownloadSubtitles ? source.subtitles || [] : [], posterUrl: simulation.media?.coverImageLarge };
      const result = Capacitor.isNativePlatform() ? await startMobileDownload(input) : await (window as any).electron.startDownload(input);
      if (!result?.ok && !result?.success) throw new Error(result?.error || 'Download could not start');
      // Advance only after the native queue has accepted this episode.
      await db.downloadRules.update(rule.id, { lastCheckedEpisode: episode, lastError: undefined });
    } catch (error) { await db.downloadRules.update(rule.id, { lastError: error instanceof Error ? error.message : String(error) }); }
  }
}

export const autoDownloadApi = {
  async list() {
    if ((window as any).electron?.autoDownload) return (window as any).electron.autoDownload.list();
    return (await db.downloadRules.toArray()).map(rule => ({ id: rule.id, animeId: String(rule.animeId), title: rule.animeTitle,
      nextEpisode: rule.lastCheckedEpisode + 1, scoringProfile: rule.scoringProfile, enqueuedEpisodes: [], addedAt: Date.parse(rule.createdAt) }));
  },
  async subscribe(animeId: string, title: string, nextEpisode: number, anilistId?: number) {
    if ((window as any).electron?.autoDownload) return (window as any).electron.autoDownload.subscribe(animeId, title, nextEpisode, anilistId);
    const id = `mobile-auto:${animeId}`;
    const rule: DownloadRule = { id, animeId: anilistId || Number(animeId), animeTitle: title, enabled: true, preferredQuality: '1080p',
      scoringProfile: 'balanced', preferredLanguages: ['ja'], sourceExtensionIds: [], languageFallbackMode: 'switch-source',
      audioLanguage: 'ja', fallbackLanguage: '', providerPriority: [], autoDownloadSubtitles: true, lastCheckedEpisode: nextEpisode - 1, createdAt: new Date().toISOString() };
    if (!Number.isFinite(rule.animeId) || rule.animeId <= 0) throw new Error('A catalog identifier is required');
    await db.downloadRules.put(rule);
  },
  async unsubscribe(animeId: string) {
    if ((window as any).electron?.autoDownload) return (window as any).electron.autoDownload.unsubscribe(animeId);
    await db.downloadRules.where('animeId').equals(Number(animeId)).delete();
  },
};
