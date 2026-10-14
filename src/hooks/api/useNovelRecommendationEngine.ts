// Novel recommendation engine — content-based sibling of the manga engine.
//
// Builds a taste profile from the user's novel readlist (format = 'novel'
// rows in manga_readlist), then scores NOVEL-format candidates pulled from the
// catalog with the same media-agnostic scoring core. Results persist under
// media_type = 'novel'.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNovelReadlist, type NovelReadlistItem } from '@/hooks/user/useNovelReadlist';
import { searchNovels, getNovelDetail, type NovelSearchItem } from '@/core/content/novel-client';
import { buildRatingProfile, dedupeFranchiseSignals } from '@/core/recommendations/ratingProfile';
import { rankCandidates } from '@/core/recommendations/scoring';
import { mangaCardToMeta, mangaDetailToMeta, mangaStatusToWatchlist } from '@/core/recommendations/mangaMeta';
import type { AnimeMeta, TasteProfile, UserAnimeSignal } from '@/core/recommendations/types';
import type { EngineRecommendation } from './useRecommendationEngine';

const MODEL_VERSION = 'v1-novel';

function novelItemToCard(n: NovelSearchItem) {
  return {
    id: String(n.id),
    title: n.canonicalTitle,
    poster: n.poster,
    score: n.score,
    popularity: n.popularity,
    status: n.status,
    chapters: n.chapters,
    genres: [] as string[],
    anilistId: n.anilistId,
    malId: n.malId,
    format: 'novel',
  };
}

function signalsFromNovelReadlist(rows: NovelReadlistItem[]): UserAnimeSignal[] {
  return rows.map((r) => ({
    animeId: r.manga_id,
    status: mangaStatusToWatchlist(r.status as any),
    completed: r.status === 'completed',
    engagement: r.last_chapter_number ? Math.min(80, r.last_chapter_number * 2) : undefined,
    lastActivity: r.updated_at,
  }));
}

async function gatherNovelCandidates(topGenres: string[]): Promise<ReturnType<typeof novelItemToCard>[]> {
  const [trending, popular, ...byGenre] = await Promise.all([
    searchNovels('', 1, 24, { sort: 'TRENDING_DESC' }).catch(() => null),
    searchNovels('', 1, 24, { sort: 'POPULARITY_DESC' }).catch(() => null),
    ...topGenres.slice(0, 4).map((g) => searchNovels('', 1, 20, { genre: g, sort: 'POPULARITY_DESC' }).catch(() => null)),
  ]);
  const seen = new Set<string>();
  const out: ReturnType<typeof novelItemToCard>[] = [];
  for (const batch of [trending, popular, ...byGenre]) {
    for (const n of batch?.results || []) {
      if (!n.id || seen.has(String(n.id))) continue;
      seen.add(String(n.id));
      out.push(novelItemToCard(n));
    }
  }
  return out;
}

async function computeNovelEngine(userId: string, readlist: NovelReadlistItem[]) {
  const signals = signalsFromNovelReadlist(readlist);
  const seedIds = signals
    .filter((s) => !s.disliked)
    .sort((a, b) => new Date(b.lastActivity ?? 0).getTime() - new Date(a.lastActivity ?? 0).getTime())
    .slice(0, 30)
    .map((s) => s.animeId);

  const seedMeta = new Map<string, AnimeMeta>();
  await Promise.all(
    seedIds.map(async (id) => {
      try {
        const detail = await getNovelDetail(id);
        seedMeta.set(id, mangaDetailToMeta(id, detail as any));
      } catch { /* skip unresolved novels */ }
    }),
  );
  try {
    const { enrichMangaSeeds } = await import('@/core/recommendations/mangaBakaEnrich');
    await enrichMangaSeeds(seedMeta, 3);
  } catch { /* AniList-only seeds still score */ }

  const profile: TasteProfile = buildRatingProfile(dedupeFranchiseSignals(signals, seedMeta), seedMeta);

  const cards = await gatherNovelCandidates(profile.topGenres.map((g) => g.genre));
  const candidateMap = new Map<string, AnimeMeta>();
  for (const card of cards) {
    if (!card.id) continue;
    candidateMap.set(card.id, mangaCardToMeta(card as any));
  }
  try {
    const { enrichMangaCandidates } = await import('@/core/recommendations/mangaBakaEnrich');
    await enrichMangaCandidates(candidateMap, profile, 3);
  } catch { /* still score on AniList meta */ }

  const excludeIds = signals.map((s) => s.animeId);
  const data = { profile, candidates: Array.from(candidateMap.values()), excludeIds };

  // Persist for the recommendations surface (media_type = 'novel').
  try {
    const ranked = rankCandidates(data.candidates, data.profile, {
      excludeIds: new Set(data.excludeIds),
      nicheBoost: 0.3,
      limit: 60,
      userScoredMean: data.profile.userScoredMean,
    });
    const rows = ranked.map((r) => ({
      user_id: userId,
      media_type: 'novel',
      anime_id: r.animeId,
      score: r.score,
      confidence: r.confidence,
      factors: { ...r.factors, tier: r.tier },
      reasons: r.reasons,
      source: 'content',
      model_version: MODEL_VERSION,
      generated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      await (supabase as any).from('user_recommendations').upsert(rows, { onConflict: 'user_id,media_type,anime_id' });
    }
  } catch (e) {
    console.warn('[NovelRecommendations] persist failed:', (e as Error)?.message);
  }
  return data;
}

export function useNovelRecommendationEngine(opts: { nicheBoost?: number; limit?: number } = {}) {
  const { nicheBoost = 0.3, limit = 24 } = opts;
  const { user } = useAuth();
  const { data: readlist } = useNovelReadlist();

  const query = useQuery({
    queryKey: ['novel-recommendation-engine', user?.id, readlist?.length],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: () => computeNovelEngine(user!.id, readlist ?? []),
  });

  const recommendations = useMemo<EngineRecommendation[]>(() => {
    if (!query.data) return [];
    const { profile, candidates, excludeIds } = query.data;
    const metaById = new Map(candidates.map((c) => [c.id, c]));
    const ranked = rankCandidates(candidates, profile, {
      excludeIds: new Set(excludeIds),
      nicheBoost,
      limit,
      userScoredMean: profile.userScoredMean,
    });
    return ranked
      .map((r): EngineRecommendation | null => {
        const anime = metaById.get(r.animeId);
        return anime ? { anime, score: r.score, confidence: r.confidence, reasons: r.reasons, factors: r.factors, tier: r.tier } : null;
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
