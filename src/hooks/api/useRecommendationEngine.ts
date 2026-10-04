// The multi-signal recommendation engine hook.
//
// Blends a per-user *content* model (taste profile built from watchlist,
// history engagement, ratings and feedback) with a *collaborative* score
// trained across all users (get_user_collaborative_scores RPC). Results and the
// taste profile are persisted to Supabase so the web app shows the same output.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchlist, type WatchlistItem } from '@/hooks/user/useWatchlist';
import { useWatchHistory } from '@/hooks/user/useWatchHistory';
import { contentGraph } from '@/core/content/content-graph';
import type { TatakaiMedia } from '@/core/content/types';
import { buildTasteProfile } from '@/core/recommendations/tasteProfile';
import { rankCandidates } from '@/core/recommendations/scoring';
import { enrichAnimeMeta, toAnimeMeta } from '@/core/recommendations/metadataEnrich';
import { isCapacitor } from '@/lib/platform/platform';
import type {
  AnimeMeta,
  RecommendationFactors,
  TasteProfile,
  UserAnimeSignal,
  WatchlistStatus,
} from '@/core/recommendations/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MODEL_VERSION = 'v1';
const MAX_SEEDS = 60; // cap metadata enrichment for the profile
const MAX_STORED = 60; // how many recs to persist

/**
 * The model is identical on every platform; only the amount of remote work is
 * reduced on mobile. A phone does not benefit from fetching hundreds of rows
 * before rendering a 6–40 item rail, and the smaller pool materially improves
 * first load on cellular connections.
 */
function recommendationBudget() {
  if (!isCapacitor()) {
    return {
      history: 500,
      seeds: MAX_SEEDS,
      collaborative: 200,
      missingCollaborative: 80,
      genreCount: 3,
      genrePageSize: 24,
    };
  }
  return {
    history: 240,
    seeds: 36,
    collaborative: 100,
    missingCollaborative: 40,
    genreCount: 2,
    genrePageSize: 16,
  };
}

export interface EngineRecommendation {
  anime: AnimeMeta;
  score: number;
  confidence: number;
  reasons: string[];
  factors: RecommendationFactors;
}

export interface RecommendationEngineData {
  profile: TasteProfile;
  candidates: AnimeMeta[];
  collaborativeById: Record<string, number>;
  excludeIds: string[];
}

// ── Signal assembly ──────────────────────────────────────────────────────────

interface HistoryStat {
  episodes: Set<number>;
  completed: boolean;
  completionHits: number;
  views: number;
  totalProgress: number;
  totalDuration: number;
  lastWatched: string;
}

/** Per-anime engagement (0–100) from watch history, mirroring useSmartFavorites. */
function engagementFromHistory(history: Array<any>): Map<string, { engagement: number; completed: boolean; last: string }> {
  const stats = new Map<string, HistoryStat>();
  for (const item of history) {
    const s = stats.get(item.anime_id) ?? {
      episodes: new Set<number>(),
      completed: false,
      completionHits: 0,
      views: 0,
      totalProgress: 0,
      totalDuration: 0,
      lastWatched: item.watched_at,
    };
    s.views += 1;
    s.episodes.add(item.episode_number);
    if (item.completed) {
      s.completed = true;
      s.completionHits += 1;
    }
    s.totalProgress += item.progress_seconds || 0;
    s.totalDuration += item.duration_seconds || 0;
    if (new Date(item.watched_at).getTime() > new Date(s.lastWatched).getTime()) s.lastWatched = item.watched_at;
    stats.set(item.anime_id, s);
  }

  const out = new Map<string, { engagement: number; completed: boolean; last: string }>();
  stats.forEach((s, id) => {
    const days = (Date.now() - new Date(s.lastWatched).getTime()) / DAY_MS;
    const recency = Math.exp(-days / 28);
    const completion = Math.min(1, s.completionHits / Math.max(1, s.views));
    const breadth = Math.min(1, s.episodes.size / 12);
    const consistency = Math.min(1, s.views / 8);
    const progress = Math.min(1, s.totalProgress / Math.max(1, s.totalDuration));
    const engagement = Math.round(
      (breadth * 0.3 + completion * 0.25 + recency * 0.2 + consistency * 0.15 + progress * 0.1) * 100,
    );
    out.set(id, { engagement, completed: s.completed, last: s.lastWatched });
  });
  return out;
}

function statusToWatchlist(status: string): WatchlistStatus | undefined {
  const valid: WatchlistStatus[] = ['watching', 'completed', 'plan_to_watch', 'dropped', 'on_hold'];
  return valid.includes(status as WatchlistStatus) ? (status as WatchlistStatus) : undefined;
}

/** Merge every signal source into one UserAnimeSignal per anime. */
function assembleSignals(
  watchlist: WatchlistItem[],
  history: Array<any>,
  ratings: Array<{ anime_id: string; rating: number }>,
  feedback: Array<{ anime_id: string; feedback: string }>,
): UserAnimeSignal[] {
  const byId = new Map<string, UserAnimeSignal>();
  const upsert = (id: string, patch: Partial<UserAnimeSignal>) => {
    const prev = byId.get(id) ?? { animeId: id };
    byId.set(id, { ...prev, ...patch });
  };

  for (const w of watchlist) upsert(w.anime_id, { status: statusToWatchlist(w.status), lastActivity: w.updated_at });
  const eng = engagementFromHistory(history);
  eng.forEach((v, id) => upsert(id, { engagement: v.engagement, completed: v.completed, lastActivity: v.last }));
  for (const r of ratings) upsert(r.anime_id, { userRating: r.rating });
  for (const f of feedback) {
    if (f.feedback === 'like') upsert(f.anime_id, { liked: true });
    else if (f.feedback === 'dislike') upsert(f.anime_id, { disliked: true });
  }
  return Array.from(byId.values());
}

// ── Candidate gathering ──────────────────────────────────────────────────────

async function gatherCandidateMedia(
  topGenres: string[],
  budget: ReturnType<typeof recommendationBudget>,
): Promise<TatakaiMedia[]> {
  const media: TatakaiMedia[] = [];
  const push = (arr?: TatakaiMedia[]) => { if (arr) media.push(...arr); };

  try {
    const home = await contentGraph.getHomePage();
    push(home.trending);
    push(home.popular);
    push(home.topAiring);
    push(home.topUpcoming);
    push(home.latestCompleted);
    push(home.spotlight);
  } catch { /* home is best-effort */ }

  // Genre-targeted search widens coverage beyond the homepage's popular set.
  const genreResults = await Promise.all(
    topGenres.slice(0, budget.genreCount).map((genre) =>
      contentGraph.search({ genres: [genre], page: 1, perPage: budget.genrePageSize }).then((r) => r.media).catch(() => [] as TatakaiMedia[])),
  );
  for (const arr of genreResults) push(arr);
  return media;
}

// ── The engine query ─────────────────────────────────────────────────────────

async function computeEngine(userId: string): Promise<RecommendationEngineData> {
  const budget = recommendationBudget();
  const [{ data: watchlist }, { data: history }, { data: ratings }, { data: feedback }] = await Promise.all([
    supabase.from('watchlist').select('*').eq('user_id', userId),
    supabase.from('watch_history').select('*').eq('user_id', userId).order('watched_at', { ascending: false }).limit(budget.history),
    supabase.from('ratings').select('anime_id, rating').eq('user_id', userId),
    (supabase as any).from('recommendation_feedback').select('anime_id, feedback').eq('user_id', userId),
  ]);

  const signals = assembleSignals(
    (watchlist as WatchlistItem[]) ?? [],
    (history as Array<any>) ?? [],
    (ratings as Array<{ anime_id: string; rating: number }>) ?? [],
    (feedback as Array<{ anime_id: string; feedback: string }>) ?? [],
  );

  // Enrich metadata for the strongest seeds (most recent / rated / liked first).
  const seedIds = signals
    .filter((s) => !s.disliked)
    .sort((a, b) => new Date(b.lastActivity ?? 0).getTime() - new Date(a.lastActivity ?? 0).getTime())
    .slice(0, budget.seeds)
    .map((s) => s.animeId);
  const seedMeta = await enrichAnimeMeta(seedIds);

  const profile = buildTasteProfile(signals, seedMeta);

  // Collaborative scores from the global model (aggregate; RLS-safe RPC).
  const collaborativeById: Record<string, number> = {};
  let collabIds: string[] = [];
  try {
    const { data: collab } = await (supabase as any).rpc('get_user_collaborative_scores', {
      p_user_id: userId,
      p_limit: budget.collaborative,
    });
    const rows = (collab as Array<{ anime_id: string; score: number }>) ?? [];
    const maxScore = rows.reduce((m, r) => Math.max(m, Number(r.score) || 0), 0);
    for (const r of rows) {
      collaborativeById[r.anime_id] = maxScore > 0 ? (Number(r.score) || 0) / maxScore : 0;
    }
    collabIds = rows.map((r) => r.anime_id);
  } catch { /* collaborative model optional until similarity is refreshed */ }

  // Candidates: content-graph media (free metadata) + collaborative ids (fetched).
  const media = await gatherCandidateMedia(profile.topGenres.map((g) => g.genre), budget);
  const candidateMap = new Map<string, AnimeMeta>();
  for (const m of media) {
    const meta = toAnimeMeta(m);
    candidateMap.set(meta.id, meta);
  }
  const missingCollab = collabIds
    .filter((id) => !candidateMap.has(id))
    .slice(0, budget.missingCollaborative);
  const collabMeta = await enrichAnimeMeta(missingCollab);
  collabMeta.forEach((meta, id) => candidateMap.set(id, meta));

  const excludeIds = new Set(signals.map((s) => s.animeId));
  // Also exclude anything explicitly hidden via feedback.
  for (const f of (feedback as Array<{ anime_id: string; feedback: string }>) ?? []) {
    if (['dislike', 'already_seen', 'skip'].includes(f.feedback)) excludeIds.add(f.anime_id);
  }

  const data: RecommendationEngineData = {
    profile,
    candidates: Array.from(candidateMap.values()),
    collaborativeById,
    excludeIds: Array.from(excludeIds),
  };

  await persist(userId, data);
  return data;
}

/** Persist a default ranking + the taste profile so other surfaces can read them. */
async function persist(userId: string, data: RecommendationEngineData): Promise<void> {
  try {
    const collabMap = new Map(Object.entries(data.collaborativeById));
    const ranked = rankCandidates(data.candidates, data.profile, {
      excludeIds: new Set(data.excludeIds),
      collaborativeById: collabMap,
      nicheBoost: 0.3,
      limit: MAX_STORED,
    });
    const metaById = new Map(data.candidates.map((c) => [c.id, c]));

    void metaById;
    const rows = ranked.map((r) => ({
      user_id: userId,
      media_type: 'anime',
      anime_id: r.animeId,
      score: r.score,
      confidence: r.confidence,
      factors: r.factors,
      reasons: r.reasons,
      source: 'hybrid',
      model_version: MODEL_VERSION,
      generated_at: new Date().toISOString(),
    }));

    if (rows.length) {
      await (supabase as any).from('user_recommendations').upsert(rows, { onConflict: 'user_id,media_type,anime_id' });
    }
    await (supabase as any).from('user_taste_profiles').upsert(
      { user_id: userId, profile: data.profile, sample_size: data.profile.sampleSize, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  } catch (e) {
    console.warn('[Recommendations] persist failed:', (e as Error)?.message);
  }
}

/**
 * Base query: computes the taste profile, candidate pool and collaborative
 * scores once (cached), and persists a default ranking. The niche slider then
 * re-ranks client-side without refetching.
 */
export function useRecommendationEngineData() {
  const { user } = useAuth();
  // Depend on list/history sizes so the engine recomputes when the user's data changes.
  const { data: watchlist } = useWatchlist();
  const { data: history } = useWatchHistory(isCapacitor() ? 240 : 500);

  return useQuery({
    queryKey: ['recommendation-engine', user?.id, watchlist?.length, history?.length],
    enabled: !!user,
    staleTime: 15 * 60 * 1000,
    queryFn: () => computeEngine(user!.id),
  });
}

/** Ranked recommendations, re-scored live from the niche knob. */
export function useRecommendationEngine(opts: { nicheBoost?: number; limit?: number } = {}) {
  const { nicheBoost = 0.3, limit = 40 } = opts;
  const query = useRecommendationEngineData();

  const recommendations = useMemo<EngineRecommendation[]>(() => {
    if (!query.data) return [];
    const { profile, candidates, collaborativeById, excludeIds } = query.data;
    const metaById = new Map(candidates.map((c) => [c.id, c]));
    const ranked = rankCandidates(candidates, profile, {
      excludeIds: new Set(excludeIds),
      collaborativeById: new Map(Object.entries(collaborativeById)),
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
    refetch: query.refetch,
  };
}

/** Read persisted recommendations (e.g. on the web app) without recomputing. */
export function useStoredRecommendations(limit = 40) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['stored-recommendations', user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('user_recommendations')
        .select('*')
        .eq('user_id', user!.id)
        .eq('media_type', 'anime')
        .order('score', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as Array<{
        anime_id: string;
        score: number;
        confidence: number;
        factors: RecommendationFactors;
        reasons: string[];
        generated_at: string;
      }>;
    },
  });
}
