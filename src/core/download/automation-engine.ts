import { db } from '../db';
import { contentGraph } from '../content/content-graph';
import { extensionRegistry } from '../extensions/ExtensionRegistry';
import { toast } from 'sonner';
import { scoreAutoDownloadCandidate } from './automation-matcher';
import {
  resolveExtensionForEpisode,
  normalizeLanguage,
  describeResolution,
} from './language-resolver';
import type { ExtensionSearchProvider } from '../extensions/ExtensionRegistry';

/**
 * Normalizes title for comparison
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a parsed torrent title matches the target anime title
 */
function isTitleMatch(parsedTitle: string, targetTitles: string[]): boolean {
  if (!parsedTitle) return false;
  const normParsed = normalizeTitle(parsedTitle);
  return targetTitles.some(target => {
    const normTarget = normalizeTitle(target);
    return normParsed === normTarget || normParsed.includes(normTarget) || normTarget.includes(normParsed);
  });
}

/**
 * Reads the global default language from localStorage.
 * Set in Desktop Settings → "Default Language".
 */
function getGlobalDefaultLanguage(): string {
  return localStorage.getItem('tatakai_default_language') || 'ja';
}

export async function checkAndRunAutomation() {
  const isDesktop = typeof window !== 'undefined' && !!(window as any).electron?.startDownload;
  if (!isDesktop) return;

  try {
    // 1. Get all active rules
    const activeRules = await db.downloadRules.where('enabled').equals(1).toArray();
    if (activeRules.length === 0) return;

    console.log(`[AutomationEngine] Running auto-download checks for ${activeRules.length} rules...`);
    const globalDefaultLang = getGlobalDefaultLanguage();
    let enqueuedCount = 0;

    for (const rule of activeRules) {
      try {
        // 2. Fetch media info from Content Graph
        const media = await contentGraph.getMedia(String(rule.animeId));
        if (!media) continue;

        // Determine target titles list for matching
        const targetTitles = [
          media.titleEnglish,
          media.titleRomaji,
          media.titleNative,
          ...(media.synonyms || [])
        ].filter((t): t is string => typeof t === 'string' && !!t.trim());

        // 3. Determine latest available episode number
        let latestEpisode = media.episodes || 0;
        if (media.nextAiringEpisode?.episode) {
          latestEpisode = media.nextAiringEpisode.episode - 1;
        }

        if (latestEpisode <= rule.lastCheckedEpisode && media.status === 'RELEASING') {
          latestEpisode = rule.lastCheckedEpisode + 1;
        }

        if (latestEpisode <= rule.lastCheckedEpisode) {
          continue;
        }

        // Cap lookahead to 3 episodes at a time to prevent queue flooding
        const startEp = rule.lastCheckedEpisode + 1;
        const endEp = Math.min(latestEpisode, startEp + 2);

        console.log(`[AutomationEngine] Checked "${rule.animeTitle}": Needs episodes ${startEp} to ${endEp}`);

        for (let ep = startEp; ep <= endEp; ep++) {
          let downloaded = false;

          // ── Build the ordered extension provider list ──────────────────────
          // Prefer extensions listed in rule.sourceExtensionIds (v3 field),
          // fall back to the legacy rule.providerPriority list.
          const allProviders = extensionRegistry.getSearchProviders();

          const extensionPriorityIds: string[] =
            Array.isArray(rule.sourceExtensionIds) && rule.sourceExtensionIds.length > 0
              ? rule.sourceExtensionIds
              : Array.isArray(rule.providerPriority)
                ? rule.providerPriority
                : [];

          const prioritizedProviders: ExtensionSearchProvider[] = [...allProviders].sort((a, b) => {
            const aIdx = extensionPriorityIds.indexOf(a.id);
            const bIdx = extensionPriorityIds.indexOf(b.id);
            if (aIdx === -1 && bIdx === -1) return 0;
            if (aIdx === -1) return 1;
            if (bIdx === -1) return -1;
            return aIdx - bIdx;
          });

          if (prioritizedProviders.length === 0) {
            console.warn(`[AutomationEngine] No extensions registered — cannot download "${rule.animeTitle}" ep ${ep}`);
            toast.error(`No extensions installed for "${rule.animeTitle}" ep ${ep}`, {
              description: 'Install an extension from the Extension Hub to enable auto-downloads.',
            });
            break;
          }

          // ── Build the preferred language list ──────────────────────────────
          // Use v3 preferredLanguages if present, otherwise build from legacy fields.
          const preferredLanguages: string[] =
            Array.isArray(rule.preferredLanguages) && rule.preferredLanguages.length > 0
              ? rule.preferredLanguages
              : buildLegacyLanguageList(rule.audioLanguage, rule.fallbackLanguage);

          const fallbackMode = rule.languageFallbackMode ?? 'switch-source';

          // ── Step 1: Run the language resolution engine ─────────────────────
          console.log(
            `[AutomationEngine] Resolving language for "${rule.animeTitle}" ep ${ep}` +
            ` | Preferred: [${preferredLanguages.join(', ')}]` +
            ` | Extensions: [${prioritizedProviders.map(p => p.name).join(', ')}]`,
          );

          let resolution = await resolveExtensionForEpisode(
            prioritizedProviders,
            media.anilistId ?? rule.animeId,
            ep,
            preferredLanguages,
            globalDefaultLang,
          );

          if (!resolution) {
            if (fallbackMode === 'error') {
              const msg = `No source found for "${rule.animeTitle}" ep ${ep} in preferred languages [${preferredLanguages.join(', ')}]`;
              console.error(`[AutomationEngine] ${msg}`);
              toast.error(msg, { description: 'Check your extension language settings.' });
              continue;
            }

            if (fallbackMode === 'switch-source') {
              // Try any provider regardless of language
              if (prioritizedProviders.length > 0) {
                resolution = {
                  provider: prioritizedProviders[0],
                  resolvedLanguage: normalizeLanguage(preferredLanguages[0] ?? globalDefaultLang),
                  languageLabel: preferredLanguages[0] ?? globalDefaultLang,
                  matchType: 'heuristic',
                  capabilities: [],
                };
                console.warn(`[AutomationEngine] Language-agnostic fallback for "${rule.animeTitle}" ep ${ep} — using ${resolution.provider.name}`);
              } else {
                continue;
              }
            }
          }

          if (!resolution) continue;

          console.log(
            `[AutomationEngine] Resolved: ${describeResolution(resolution)} for "${rule.animeTitle}" ep ${ep}`,
          );

          // ── Step 2: Search for the episode using the resolved extension ────
          const { provider } = resolution;
          const queryTitle = media.titleEnglish || media.titleRomaji;
          const queries = [
            `"${queryTitle}" ${ep}`,
            `"${queryTitle}" episode ${ep}`,
          ];

          for (const query of queries) {
            if (downloaded) break;

            try {
              console.log(`[AutomationEngine] Searching "${provider.name}" for: ${query}`);
              const searchResults = await provider.search(query);
              if (!Array.isArray(searchResults) || searchResults.length === 0) continue;

              const scoredResults: Array<{ result: any; score: number; reasons: string[]; filename: string }> = [];

              for (const result of searchResults) {
                const filename = result.title || result.name || '';
                const parseRes = await (window as any).electron.parseReleaseName(filename);
                if (!parseRes?.success || !parseRes.parsed) continue;

                const parsed = parseRes.parsed;
                const parsedEp = parsed.episodeNumber;
                if (parsedEp !== ep) continue;
                if (!isTitleMatch(parsed.title, targetTitles)) continue;

                // Language filter: if the resolution is a strict match, filter for that language
                if (resolution.matchType === 'strict') {
                  const resultLang = normalizeLanguage(
                    result.audioLanguage || parsed.audio || result.language || '',
                  );
                  const isDubRequested = resolution.resolvedLanguage !== 'ja';
                  if (isDubRequested) {
                    const isDub =
                      resultLang === resolution.resolvedLanguage ||
                      filename.toLowerCase().includes('dub') ||
                      filename.toLowerCase().includes('dual audio') ||
                      filename.toLowerCase().includes('multi audio');
                    if (!isDub) continue;
                  }
                }

                const scoreInfo = scoreAutoDownloadCandidate(
                  rule,
                  {
                    title: parsed.title,
                    episodeNumber: parsedEp,
                    seasonNumber: parsed.season ?? null,
                    quality: parsed.resolution,
                    language: resolution.resolvedLanguage,
                    providerId: provider.id,
                    sourceType: result.sourceType || parsed.source || 'torrent',
                    source: parsed.source,
                    releaseGroup: parsed.releaseGroup,
                    subtitles: result.subtitles,
                  },
                  targetTitles,
                );

                scoredResults.push({
                  result,
                  score: scoreInfo.score,
                  reasons: scoreInfo.reasons,
                  filename,
                });
              }

              const bestMatch = scoredResults.sort((a, b) => b.score - a.score)[0];
              if (!bestMatch) continue;

              const { result, filename } = bestMatch;
              const downloadPath = localStorage.getItem('tatakai_download_path') || undefined;
              const posterUrl = media.coverImageLarge;
              const subtitles = rule.autoDownloadSubtitles && result.subtitles
                ? result.subtitles.map((s: any) => ({
                    url: s.url,
                    lang: s.language || s.lang,
                    label: s.label,
                  }))
                : [];

              // Determine source type for the download handler
              const resultSourceType: 'hls' | 'torrent' =
                (result.sourceType === 'torrent' ||
                  result.url?.startsWith('magnet:') ||
                  result.magnet)
                  ? 'torrent'
                  : 'hls';

              console.log(
                `[AutomationEngine] Matched "${filename}" score=${bestMatch.score}` +
                ` (${bestMatch.reasons.join(', ')}) lang=${resolution.resolvedLanguage}` +
                ` type=${resultSourceType}. Downloading...`,
              );

              const episodeId = `auto-${media.anilistId || media.malId}-${ep}`;
              const meta = {
                animeId: media.anilistId || media.malId || rule.animeId,
                animeTitle: media.titleEnglish || media.titleRomaji,
                episodeNumber: ep,
                sourceType: resultSourceType,
                resolvedLanguage: resolution.resolvedLanguage || 'ja',
                startedAt: new Date().toISOString()
              };
              localStorage.setItem(`tatakai:dl:meta:${episodeId}`, JSON.stringify(meta));

              const startRes = await (window as any).electron.startDownload({
                episodeId,
                animeName: media.titleEnglish || media.titleRomaji,
                episodeNumber: ep,
                url: result.url,
                magnet: result.magnet || (result.url?.startsWith('magnet:') ? result.url : undefined),
                sourceType: resultSourceType,
                headers: result.headers || {},
                downloadPath,
                posterUrl,
                subtitles,
              });

              if (startRes?.success || startRes?.ok) {
                const langLabel = resolution.languageLabel;
                toast.success(
                  `Auto-downloading "${media.titleEnglish || media.titleRomaji}" Episode ${ep} [${langLabel}]!`,
                );
                rule.lastCheckedEpisode = ep;
                await db.downloadRules.put(rule);
                downloaded = true;
                enqueuedCount++;
                break;
              } else {
                console.warn(`[AutomationEngine] Start download failed for ${filename}:`, startRes?.error);
                localStorage.removeItem(`tatakai:dl:meta:${episodeId}`);
              }
            } catch (searchErr) {
              console.error(`[AutomationEngine] Provider search error:`, searchErr);
            }
          }
        }
      } catch (ruleErr) {
        console.error(`[AutomationEngine] Error running rule for "${rule.animeTitle}":`, ruleErr);
      }
    }

    console.log(`[AutomationEngine] Done. Enqueued ${enqueuedCount} downloads.`);
    localStorage.setItem('tatakai_auto_download_last_checked', new Date().toISOString());
  } catch (err) {
    console.error('[AutomationEngine] Global automation check failed:', err);
  }
}

/**
 * Builds a legacy-compatible language priority list from old audioLanguage / fallbackLanguage fields.
 * Used when a rule was created before v3 of the DB schema.
 */
function buildLegacyLanguageList(audioLanguage: string, fallbackLanguage: string): string[] {
  const list: string[] = [];
  if (audioLanguage && audioLanguage !== 'none') list.push(audioLanguage);
  if (fallbackLanguage && fallbackLanguage !== 'none' && fallbackLanguage !== audioLanguage) {
    list.push(fallbackLanguage);
  }
  // Ensure 'ja' is always last as ultimate default
  if (!list.includes('ja') && !list.includes('sub')) list.push('ja');
  return list;
}
