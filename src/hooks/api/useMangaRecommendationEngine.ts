// Manga / manhwa / manhua recommendation engine.
//
// Content-based sibling of the anime engine: it builds a taste profile from the
// user's manga readlist (statuses + reading progress), then scores candidates
// pulled from the manga catalog with the same media-agnostic scoring core. No
// collaborative term yet (the similarity graph is anime-only), so this is a
// pure content model. Results persist under media_type = 'manga'.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMangaReadlist, type MangaReadlistItem } from '@/hooks/user/useMangaReadlist';
import { getMangaByGenre, getMangaDetail, getTrendingManga, getTrendingManhwa, getTrendingManhua, type MangaCard } from '@/core/content/manga-client';
import { buildTasteProfile } from '@/core/recommendations/tasteProfile';
import { rankCandidates, clamp } from '@/core/recommendations/scoring';
import { mangaCardToMeta, mangaDetailToMeta, mangaStatusToWatchlist } from '@/core/recommendations/mangaMeta';
import { isCapacitor } from '@/lib/platform/platform';
import type { AnimeMeta, TasteProfile, UserAnimeSignal } from '@/core/recommendations/types';
import type { EngineRecommendation } from './useRecommendationEngine';

const MAX_SEEDS = 40;
const MAX_STORED = 60;

function mangaRecommendationBudget() {
  if (!isCapacitor()) return { seeds: MAX_SEEDS, concurrency: 5, genres: 5, primary: 30, secondary: 24 };
  return { seeds: 24, concurrency: 3, genres: 3, primary: 18, secondary: 16 };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

function signalsFromReadlist(rows: MangaReadlistItem[]): UserAnimeSignal[] {
  return rows.map((r) => ({
    animeId: r.manga_id,
    status: mangaStatusToWatchlist(r.status),
    completed: r.status === 'completed',
    engagement: r.last_chapter_number ? clamp(r.last_chapter_number * 3, 0, 80) : undefined,
    lastActivity: r.updated_at,
  }));
}

async function gatherMangaCandidates(
  topGenres: string[],
  budget: ReturnType<typeof mangaRecommendationBudget>,
): Promise<MangaCard[]> {
  // Pull genre-targeted picks plus all three formats (manga / manhwa / manhua)
  // so the pool covers what the reader actually reads, not just Japanese manga.
  const [byGenre, trending, manhwa, manhua] = await Promise.all([
    Promise.all(topGenres.slice(0, budget.genres).map((g) => getMangaByGenre(g, budget.primary).catch(() => [] as MangaCard[]))),
    getTrendingManga(budget.primary).catch(() => [] as MangaCard[]),
    getTrendingManhwa(budget.secondary).catch(() => [] as MangaCard[]),
    getTrendingManhua(budget.secondary).catch(() => [] as MangaCard[]),
  ]);
  return [...byGenre.flat(), ...trending, ...manhwa, ...manhua];
}

interface MangaEngineData {
  profile: TasteProfile;
  candidates: AnimeMeta[];
  excludeIds: string[];
}

async function computeMangaEngine(userId: string, readlist: MangaReadlistItem[]): Promise<MangaEngineData> {
  const budget = mangaRecommendationBudget();
  const signals = signalsFromReadlist(readlist);

  const seedIds = signals
    .filter((s) => !s.disliked)
    .sort((a, b) => new Date(b.lastActivity ?? 0).getTime() - new Date(a.lastActivity ?? 0).getTime())
    .slice(0, budget.seeds)
    .map((s) => s.animeId);

  const seedMeta = new Map<string, AnimeMeta>();
  await mapLimit(seedIds, budget.concurrency, async (id) => {
    try {
      const detail = await getMangaDetail(id);
      seedMeta.set(id, mangaDetailToMeta(id, detail));
    } catch { /* skip unresolved manga */ }
  });

  const profile = buildTasteProfile(signals, seedMeta);

  const cards = await gatherMangaCandidates(profile.topGenres.map((g) => g.genre), budget);
  const candidateMap = new Map<string, AnimeMeta>();
  for (const card of cards) {
    if (!card.id) continue;
    candidateMap.set(card.id, mangaCardToMeta(card));
  }

  const excludeIds = new Set(signals.map((s) => s.animeId));
  const data: MangaEngineData = {
    profile,
    candidates: Array.from(candidateMap.values()),
    excludeIds: Array.from(excludeIds),
  };

  await persistManga(userId, data);
  return data;
}

async function persistManga(userId: string, data: MangaEngineData): Promise<void> {
  try {
    const ranked = rankCandidates(data.candidates, data.profile, {
      excludeIds: new Set(data.excludeIds),
      nicheBoost: 0.3,
      limit: MAX_STORED,
    });
    const rows = ranked.map((r) => ({
      user_id: userId,
      media_type: 'manga',
      anime_id: r.animeId,
      score: r.score,
      confidence: r.confidence,
      factors: r.factors,
      reasons: r.reasons,
      source: 'content',
      model_version: 'v1',
      generated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      await (supabase as any).from('user_recommendations').upsert(rows, { onConflict: 'user_id,media_type,anime_id' });
    }
  } catch (e) {
    console.warn('[MangaRecommendations] persist failed:', (e as Error)?.message);
  }
}

export function useMangaRecommendationEngine(opts: { nicheBoost?: number; limit?: number } = {}) {
  const { nicheBoost = 0.3, limit = 30 } = opts;
  const { user } = useAuth();
  const { data: readlist } = useMangaReadlist(['reading', 'completed', 'plan_to_read', 'on_hold']);

  const query = useQuery({
    queryKey: ['manga-recommendation-engine', user?.id, readlist?.length],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: () => computeMangaEngine(user!.id, readlist ?? []),
  });

  const recommendations = useMemo<EngineRecommendation[]>(() => {
    if (!query.data) return [];
    const { profile, candidates, excludeIds } = query.data;
    const metaById = new Map(candidates.map((c) => [c.id, c]));
    const ranked = rankCandidates(candidates, profile, {
      excludeIds: new Set(excludeIds),
      nicheBoost,
      limit,
    });
    return ranked
      .map((r) => {
        const anime = metaById.get(r.animeId);
        return anime ? { anime, score: r.score, confidence: r.confidence, reasons: r.reasons, factors: r.factors } : null;
      })
      .filter((x): x is EngineRecommendation => x !== null);
  }, [query.data, nicheBoost, limit]);

  return {
    recommendations,
    profile: query.data?.profile ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
