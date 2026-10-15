import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useRecommendationEngine,
  type EngineRecommendation,
} from '@/hooks/api/useRecommendationEngine';
import type { RecommendationFactors, TasteProfile } from '@/core/recommendations/types';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkles, TrendingUp, Brain, Star, Film, ThumbsUp, ThumbsDown, EyeOff, ChevronDown, Users, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProxiedImageUrl } from '@/lib/api';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts';
import { AnimeAtlasPanel } from '@/components/atlas/AnimeAtlasPanel';
import { useMangaRecommendationEngine } from '@/hooks/api/useMangaRecommendationEngine';
import { MangaRecommendationGrid } from '@/components/manga/MangaRecommendationGrid';
import { useNovelRecommendationEngine } from '@/hooks/api/useNovelRecommendationEngine';
import { NovelRecommendationGrid } from '@/components/novel/NovelRecommendationGrid';
import { BookOpen } from 'lucide-react';

type RecommendationFeedback = 'like' | 'dislike' | 'already_seen' | 'skip';

const FACTOR_ITEMS: Array<{ key: keyof RecommendationFactors; label: string; color: string }> = [
  { key: 'genreMatch', get label() { return uiI18n.t('app.genre_fit_12ca4401'); }, color: 'bg-primary' },
  { key: 'collaborative', get label() { return uiI18n.t('app.community_bfd58ee3'); }, color: 'bg-fuchsia-500' },
  { key: 'ratingMatch', get label() { return uiI18n.t('app.rating_fit_1d470498'); }, color: 'bg-green-500' },
  { key: 'studioMatch', get label() { return uiI18n.t('app.studio_fit_9cda8e16'); }, color: 'bg-amber-500' },
  { key: 'tagMatch', get label() { return uiI18n.t('app.theme_fit_04b84dd0'); }, color: 'bg-blue-500' },
  { key: 'recencyBoost', get label() { return uiI18n.t('app.era_fit_38f6488f'); }, color: 'bg-cyan-500' },
  { key: 'popularityBoost', get label() { return uiI18n.t('app.popularity_be6c200f'); }, color: 'bg-rose-500' },
];

const TIER_STYLES: Record<string, { dot: string; label: string }> = {
  strong: { dot: 'bg-green-500', get label() { return uiI18n.t('app.strong_match_a99cde57'); } },
  possible: { dot: 'bg-yellow-500', get label() { return uiI18n.t('app.possible_match_d11ba676'); } },
  weak: { dot: 'bg-gray-500', get label() { return uiI18n.t('app.weak_match_7334132e'); } },
};

function RecommendationCard({
  recommendation,
  feedback,
  onFeedback,
}: {
  recommendation: EngineRecommendation;
  feedback?: RecommendationFeedback;
  onFeedback: (animeId: string, feedback: RecommendationFeedback, rec: EngineRecommendation) => void;
}) {
  useUiTranslation();
  const { anime, score, confidence, reasons, factors, tier } = recommendation;
  const [showExplain, setShowExplain] = useState(false);
  const tierStyle = tier ? TIER_STYLES[tier] : undefined;

  return (
    <GlassPanel hoverEffect className="group overflow-hidden">
      <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
        {/* Poster thumb — fixed width, badges live in-flow on the right so nothing can overlap */}
        <Link
          to={`/anime/${anime.id}`}
          className="relative block aspect-[2/3] w-24 shrink-0 self-start overflow-hidden rounded-xl bg-muted/30 sm:w-28"
        >
          <img
            src={getProxiedImageUrl(anime.poster ?? '')}
            alt={anime.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </Link>

        {/* Right side: badges, title, reasons, actions, fit bars */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className={`shrink-0 whitespace-nowrap px-2 py-1 rounded-md text-[11px] font-bold ${confidence > 0.7 ? 'bg-green-500/80 text-white' :
              confidence > 0.4 ? 'bg-yellow-500/80 text-white' : 'bg-gray-500/80 text-white'}`}>
              {confidence > 0.7 ? uiI18n.t('app.high_b1a5954a') : confidence > 0.4 ? uiI18n.t('app.medium_d404968e') : uiI18n.t('app.low_a124947c')} {uiI18n.t('app.match_0335207f')}
            </div>
            {tierStyle && (
              <div className="shrink-0 whitespace-nowrap px-2 py-1 rounded-md text-[10px] font-bold bg-black/60 text-white flex items-center gap-1.5" title={uiI18n.t('app.how_this_score_compares_to_titles_you_rated_0a057dca')}>
                <span className={`w-1.5 h-1.5 rounded-full ${tierStyle.dot}`} />
                {tierStyle.label}
              </div>
            )}
            <div className="shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full bg-primary/90 text-primary-foreground text-[11px] font-bold flex items-center gap-1">
              <Star className="w-3 h-3 fill-current" />
              {score}%
            </div>
          </div>

          <Link to={`/anime/${anime.id}`} className="block font-bold text-sm sm:text-base line-clamp-2 hover:text-primary transition-colors">
            {anime.title}
          </Link>

          {reasons.length > 0 && (
            <div className="space-y-0.5">
              {reasons.slice(0, 2).map((reason, i) => (
                <p key={i} className="text-xs text-muted-foreground line-clamp-1">• {reason}</p>
              ))}
            </div>
          )}

          {feedback && (
            <div className="text-[10px] uppercase tracking-wide text-primary font-bold">
              {uiI18n.t('app.feedback_da4abb9f')} {feedback.replace('_', ' ')}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => onFeedback(anime.id, 'like', recommendation)}
              className={`h-7 px-2 rounded-md border text-[10px] font-bold uppercase tracking-wide ${feedback === 'like' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-white/5 border-white/10 hover:border-green-500/40'}`}
              title={uiI18n.t('app.more_like_this_a11d8172')}>
              <ThumbsUp className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => onFeedback(anime.id, 'dislike', recommendation)}
              className={`h-7 px-2 rounded-md border text-[10px] font-bold uppercase tracking-wide ${feedback === 'dislike' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-white/5 border-white/10 hover:border-red-500/40'}`}
              title={uiI18n.t('app.not_interested_41d90aba')}>
              <ThumbsDown className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => onFeedback(anime.id, 'skip', recommendation)}
              className={`h-7 px-2 rounded-md border text-[10px] font-bold uppercase tracking-wide ${feedback === 'skip' ? 'bg-slate-500/25 text-slate-300 border-slate-400/40' : 'bg-white/5 border-white/10 hover:border-slate-400/40'}`}
              title={uiI18n.t('app.skip_for_now_6fc09607')}>
              {uiI18n.t('app.skip_3da47453')}
            </button>
            <button type="button" onClick={() => onFeedback(anime.id, 'already_seen', recommendation)}
              className={`h-7 px-2 rounded-md border text-[10px] font-bold uppercase tracking-wide ${feedback === 'already_seen' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 border-white/10 hover:border-amber-500/40'}`}
              title={uiI18n.t('app.already_watched_5685a59d')}>
              <EyeOff className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => setShowExplain((p) => !p)}
              className="h-7 px-2 rounded-md border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1">
              {uiI18n.t('app.why_21e2caea')}
              <ChevronDown className={`w-3 h-3 transition-transform ${showExplain ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showExplain && (
            <div className="pt-2 border-t border-white/10 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {FACTOR_ITEMS.map((item) => (
                <div key={item.key} className="min-w-0">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="truncate">{item.label}</span>
                    <span className="ml-2 shrink-0">{Math.round((factors[item.key] ?? 0) * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded bg-white/10 overflow-hidden mt-1">
                    <div className={`h-full ${item.color}`} style={{ width: `${Math.round((factors[item.key] ?? 0) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}

function TasteProfileDisplay({ profile }: { profile: TasteProfile }) {
  useUiTranslation();
  const radarData = profile.topGenres.slice(0, 6).map((g) => ({
    genre: g.genre,
    weight: Math.round(g.weight * 100),
  }));

  return (
    <GlassPanel className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/20 rounded-xl">
          <Brain className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">{uiI18n.t('app.your_taste_profile_703b86dd')}</h2>
          <p className="text-sm text-muted-foreground">
            {uiI18n.t('app.built_from_a3d5f439')} {profile.sampleSize} {uiI18n.t('app.title_3c6de1b7')}{profile.sampleSize === 1 ? '' : 's'} {uiI18n.t('app.across_your_lists_ratings_and_history_3ef12e03')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {radarData.length >= 3 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="genre" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Radar dataKey="weight" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div>
            <h3 className="text-sm font-bold text-muted-foreground mb-2">{uiI18n.t('app.top_genres_dd8a1654')}</h3>
            <div className="space-y-1">
              {profile.topGenres.slice(0, 5).map((g, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm">{g.genre}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${g.weight * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(g.weight * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-muted-foreground mb-2">{uiI18n.t('app.rating_range_a0eacf18')}</h3>
            <p className="text-sm">
              {profile.ratingRange.min.toFixed(1)} - {profile.ratingRange.max.toFixed(1)} {uiI18n.t('app.avg_50cf99ab')} {profile.ratingRange.average.toFixed(1)})
            </p>
          </div>

          {profile.topStudios.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-muted-foreground mb-2">{uiI18n.t('app.favorite_studios_a8418fa3')}</h3>
              <div className="flex flex-wrap gap-2">
                {profile.topStudios.slice(0, 4).map((s, i) => (
                  <span key={i} className="px-2 py-1 bg-primary/20 text-primary text-xs rounded">{s.studio}</span>
                ))}
              </div>
            </div>
          )}

          {profile.accuracy != null && (
            <div>
              <h3 className="text-sm font-bold text-muted-foreground mb-2">{uiI18n.t('app.prediction_accuracy_c91838df')}</h3>
              <p className="text-sm">
                {uiI18n.t('app.off_by_92e82f03')} <span className="font-bold text-primary">{profile.accuracy.toFixed(1)}%</span> {uiI18n.t('app.on_average_352c9b65')}
                <span className="text-muted-foreground"> {uiI18n.t('app.predicted_scores_vs_your_actual_ratings_407ba5ea')}</span>
              </p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold text-muted-foreground mb-2">{uiI18n.t('app.diversity_score_5370dacb')}</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${profile.diversityScore * 100}%` }} />
              </div>
              <span className="text-sm font-bold">{Math.round(profile.diversityScore * 100)}%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {profile.diversityScore > 0.7 ? uiI18n.t('app.very_diverse_taste_67ea62c6') : profile.diversityScore > 0.4 ? uiI18n.t('app.moderate_diversity_143890c1') : uiI18n.t('app.focused_preferences_645d118e')}
            </p>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

export default function RecommendationsPage() {
  useUiTranslation();
  const isDesktopApp = useIsDesktopApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [nicheBoost, setNicheBoost] = useState(0.3);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium'>('all');

  const { recommendations, profile, isLoading } = useRecommendationEngine({ nicheBoost, limit: 40 });
  const { recommendations: mangaRecs, isLoading: loadingManga } = useMangaRecommendationEngine({ nicheBoost, limit: 30 });
  const { recommendations: novelRecs, isLoading: loadingNovels } = useNovelRecommendationEngine({ nicheBoost, limit: 24 });

  const { data: recommendationFeedback = {} } = useQuery({
    queryKey: ['recommendation-feedback', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Record<string, RecommendationFeedback>> => {
      if (!user) return {};
      const { data, error } = await (supabase as any)
        .from('recommendation_feedback')
        .select('anime_id, feedback')
        .eq('user_id', user.id)
        .limit(500);
      if (error) {
        console.warn('[Recommendations] Failed to load feedback:', error.message);
        return {};
      }
      const mapped: Record<string, RecommendationFeedback> = {};
      (data || []).forEach((row: any) => {
        if (row?.anime_id && row?.feedback) mapped[row.anime_id] = row.feedback as RecommendationFeedback;
      });
      return mapped;
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ animeId, feedback, recommendation }: { animeId: string; feedback: RecommendationFeedback; recommendation: EngineRecommendation }) => {
      if (!user) throw new Error(uiI18n.t('app.not_authenticated_0c91acba'));
      const payload = {
        user_id: user.id,
        anime_id: animeId,
        feedback,
        recommendation_score: recommendation.score,
        reasons_snapshot: recommendation.reasons,
        factors_snapshot: recommendation.factors,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from('recommendation_feedback')
        .upsert(payload, { onConflict: 'user_id,anime_id' });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.setQueryData(['recommendation-feedback', user?.id], (prev: Record<string, RecommendationFeedback> | undefined) => ({
        ...(prev || {}),
        [vars.animeId]: vars.feedback,
      }));
    },
  });

  const handleFeedback = (animeId: string, feedback: RecommendationFeedback, recommendation: EngineRecommendation) => {
    feedbackMutation.mutate({ animeId, feedback, recommendation }, {
      onSuccess: () => {
        const label = feedback === 'already_seen' ? uiI18n.t('app.already_watched_435ea51f') : feedback;
        toast.success(uiI18n.t('app.feedback_saved_i18n_value_0_2a1bf1cf', { value0: label }));
      },
      onError: (error: any) => toast.error(error?.message || uiI18n.t('app.failed_to_save_recommendation_feedback_e72fa26e')),
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <GlassPanel className="p-8 text-center max-w-md">
          <Sparkles className="w-16 h-16 mx-auto mb-4 text-primary" />
          <h2 className="text-2xl font-bold mb-2">{uiI18n.t('app.sign_in_required_05e76e79')}</h2>
          <p className="text-muted-foreground mb-4">{uiI18n.t('app.sign_in_to_get_personalized_recommendations_from_be5f978f')}</p>
        </GlassPanel>
      </div>
    );
  }

  const filteredRecommendations = recommendations.filter((rec) => {
    const existing = recommendationFeedback[rec.anime.id];
    if (existing === 'dislike' || existing === 'already_seen' || existing === 'skip') return false;
    if (filter === 'high') return rec.confidence > 0.7;
    if (filter === 'medium') return rec.confidence > 0.4 && rec.confidence <= 0.7;
    return true;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Background />
      <Sidebar />

      <main className={`relative z-10 ${isDesktopApp ? 'pl-4' : 'pl-4 md:pl-28'} pr-4 md:pr-6 py-4 md:py-6`}>
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{uiI18n.t('app.recommendations_4faa65b5')}</h1>
              <p className="text-muted-foreground">{uiI18n.t('app.personalized_from_your_lists_ratings_and_history_3ddd9fa6')}</p>
            </div>
          </div>
        </div>

        {isLoading && !profile ? (
          <GlassPanel className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </div>
          </GlassPanel>
        ) : profile && profile.sampleSize > 0 ? (
          <TasteProfileDisplay profile={profile} />
        ) : (
          <GlassPanel className="p-6 text-center">
            <Brain className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{uiI18n.t('app.watch_rate_or_add_some_anime_to_build_your_taste_a58cca88')}</p>
          </GlassPanel>
        )}

        <Tabs defaultValue="grid" className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <TabsList>
              <TabsTrigger value="grid" className="gap-2"><TrendingUp className="w-4 h-4" /> {uiI18n.t('app.for_you_21f25753')}</TabsTrigger>
              <TabsTrigger value="manga" className="gap-2"><BookOpen className="w-4 h-4" /> {uiI18n.t('app.manga_87db0f99')}</TabsTrigger>
              <TabsTrigger value="novels" className="gap-2"><BookOpen className="w-4 h-4" /> {uiI18n.t('app.novels_4ae488fd')}</TabsTrigger>
              <TabsTrigger value="atlas" className="gap-2"><Compass className="w-4 h-4" /> {uiI18n.t('app.atlas_8bd28d90')}</TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 min-w-[220px]">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{uiI18n.t('app.popular_9bc2c5b3')}</span>
                <Slider value={[nicheBoost]} min={0} max={1} step={0.05} onValueChange={(v) => setNicheBoost(v[0])} className="w-32" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">{uiI18n.t('app.niche_d6aa4102')}</span>
              </div>
              <div className="flex gap-2">
                <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>{uiI18n.t('app.all_6a720856')}</Button>
                <Button variant={filter === 'high' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('high')}>{uiI18n.t('app.high_b1a5954a')}</Button>
                <Button variant={filter === 'medium' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('medium')}>{uiI18n.t('app.medium_d404968e')}</Button>
              </div>
            </div>
          </div>

          <TabsContent value="grid">
            {isLoading ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-44 bg-muted/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredRecommendations.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {filteredRecommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.anime.id}
                    recommendation={rec}
                    feedback={recommendationFeedback[rec.anime.id]}
                    onFeedback={handleFeedback}
                  />
                ))}
              </div>
            ) : (
              <GlassPanel className="p-8 text-center">
                <Film className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">{uiI18n.t('app.no_recommendations_yet_watch_and_rate_more_anime_41af36ab')}</p>
              </GlassPanel>
            )}

            {recommendations.some((r) => r.factors.collaborative > 0) && (
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                {uiI18n.t('app.community_signal_is_active_some_picks_are_booste_ad25e6d7')}
              </p>
            )}
          </TabsContent>

          <TabsContent value="manga">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold">{uiI18n.t('app.manga_manhwa_manhua_for_you_4d15d41f')}</h2>
              <span className="text-xs text-muted-foreground">{uiI18n.t('app.based_on_your_readlist_2964c256')}</span>
            </div>
            <MangaRecommendationGrid recommendations={mangaRecs} isLoading={loadingManga} />
          </TabsContent>

          <TabsContent value="novels">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold">{uiI18n.t('app.light_novels_for_you_80013f13')}</h2>
              <span className="text-xs text-muted-foreground">{uiI18n.t('app.based_on_your_novel_library_97e1d559')}</span>
            </div>
            <NovelRecommendationGrid recommendations={novelRecs} isLoading={loadingNovels} />
          </TabsContent>

          <TabsContent value="atlas">
            <AnimeAtlasPanel animeRecs={recommendations} mangaRecs={mangaRecs} novelRecs={novelRecs} />
          </TabsContent>
        </Tabs>
      </main>

      <MobileNav />
    </div>
  );
}
