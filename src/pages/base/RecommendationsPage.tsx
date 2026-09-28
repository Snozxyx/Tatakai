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
import { BookOpen } from 'lucide-react';

type RecommendationFeedback = 'like' | 'dislike' | 'already_seen' | 'skip';

const FACTOR_ITEMS: Array<{ key: keyof RecommendationFactors; label: string; color: string }> = [
  { key: 'genreMatch', label: 'Genre fit', color: 'bg-primary' },
  { key: 'collaborative', label: 'Community', color: 'bg-fuchsia-500' },
  { key: 'ratingMatch', label: 'Rating fit', color: 'bg-green-500' },
  { key: 'studioMatch', label: 'Studio fit', color: 'bg-amber-500' },
  { key: 'tagMatch', label: 'Theme fit', color: 'bg-blue-500' },
  { key: 'recencyBoost', label: 'Era fit', color: 'bg-cyan-500' },
  { key: 'popularityBoost', label: 'Popularity', color: 'bg-rose-500' },
];

function RecommendationCard({
  recommendation,
  feedback,
  onFeedback,
}: {
  recommendation: EngineRecommendation;
  feedback?: RecommendationFeedback;
  onFeedback: (animeId: string, feedback: RecommendationFeedback, rec: EngineRecommendation) => void;
}) {
  const { anime, score, confidence, reasons, factors } = recommendation;
  const [showExplain, setShowExplain] = useState(false);

  return (
    <GlassPanel hoverEffect className="group overflow-hidden">
      <div className="relative aspect-[2/3]">
        <Link to={`/anime/${anime.id}`}>
          <img
            src={getProxiedImageUrl(anime.poster ?? '')}
            alt={anime.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
        </Link>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

        <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-primary/90 backdrop-blur text-primary-foreground text-xs font-bold flex items-center gap-1">
          <Star className="w-3 h-3 fill-current" />
          {score}%
        </div>

        <div className="absolute top-3 left-3">
          <div className={`px-2 py-1 rounded-md text-xs font-bold ${confidence > 0.7 ? 'bg-green-500/80 text-white' :
            confidence > 0.4 ? 'bg-yellow-500/80 text-white' : 'bg-gray-500/80 text-white'}`}>
            {confidence > 0.7 ? 'High' : confidence > 0.4 ? 'Medium' : 'Low'} Match
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <Link to={`/anime/${anime.id}`} className="block font-bold text-sm line-clamp-2 hover:text-primary transition-colors">
          {anime.title}
        </Link>

        {reasons.length > 0 && (
          <div className="space-y-1">
            {reasons.slice(0, 2).map((reason, i) => (
              <p key={i} className="text-xs text-muted-foreground line-clamp-1">• {reason}</p>
            ))}
          </div>
        )}

        {feedback && (
          <div className="text-[10px] uppercase tracking-wide text-primary font-bold">
            Feedback: {feedback.replace('_', ' ')}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onFeedback(anime.id, 'like', recommendation)}
            className={`h-7 px-2 rounded-md border text-[10px] font-bold uppercase tracking-wide ${feedback === 'like' ? 'bg-green-500/20 text-green-400 border-green-500/40' : 'bg-white/5 border-white/10 hover:border-green-500/40'}`}
            title="More like this">
            <ThumbsUp className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => onFeedback(anime.id, 'dislike', recommendation)}
            className={`h-7 px-2 rounded-md border text-[10px] font-bold uppercase tracking-wide ${feedback === 'dislike' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-white/5 border-white/10 hover:border-red-500/40'}`}
            title="Not interested">
            <ThumbsDown className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => onFeedback(anime.id, 'skip', recommendation)}
            className={`h-7 px-2 rounded-md border text-[10px] font-bold uppercase tracking-wide ${feedback === 'skip' ? 'bg-slate-500/25 text-slate-300 border-slate-400/40' : 'bg-white/5 border-white/10 hover:border-slate-400/40'}`}
            title="Skip for now">
            Skip
          </button>
          <button type="button" onClick={() => onFeedback(anime.id, 'already_seen', recommendation)}
            className={`h-7 px-2 rounded-md border text-[10px] font-bold uppercase tracking-wide ${feedback === 'already_seen' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-white/5 border-white/10 hover:border-amber-500/40'}`}
            title="Already watched">
            <EyeOff className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => setShowExplain((p) => !p)}
            className="ml-auto h-7 px-2 rounded-md border border-white/10 bg-white/5 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1">
            Why
            <ChevronDown className={`w-3 h-3 transition-transform ${showExplain ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showExplain && (
          <div className="pt-2 border-t border-white/10 space-y-1.5">
            {FACTOR_ITEMS.map((item) => (
              <div key={item.key}>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{item.label}</span>
                  <span>{Math.round((factors[item.key] ?? 0) * 100)}%</span>
                </div>
                <div className="h-1.5 rounded bg-white/10 overflow-hidden mt-1">
                  <div className={`h-full ${item.color}`} style={{ width: `${Math.round((factors[item.key] ?? 0) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

function TasteProfileDisplay({ profile }: { profile: TasteProfile }) {
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
          <h2 className="text-xl font-bold">Your Taste Profile</h2>
          <p className="text-sm text-muted-foreground">
            Built from {profile.sampleSize} title{profile.sampleSize === 1 ? '' : 's'} across your lists, ratings and history
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
            <h3 className="text-sm font-bold text-muted-foreground mb-2">Top Genres</h3>
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
            <h3 className="text-sm font-bold text-muted-foreground mb-2">Rating Range</h3>
            <p className="text-sm">
              {profile.ratingRange.min.toFixed(1)} - {profile.ratingRange.max.toFixed(1)} (avg: {profile.ratingRange.average.toFixed(1)})
            </p>
          </div>

          {profile.topStudios.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-muted-foreground mb-2">Favorite Studios</h3>
              <div className="flex flex-wrap gap-2">
                {profile.topStudios.slice(0, 4).map((s, i) => (
                  <span key={i} className="px-2 py-1 bg-primary/20 text-primary text-xs rounded">{s.studio}</span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold text-muted-foreground mb-2">Diversity Score</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${profile.diversityScore * 100}%` }} />
              </div>
              <span className="text-sm font-bold">{Math.round(profile.diversityScore * 100)}%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {profile.diversityScore > 0.7 ? 'Very diverse taste' : profile.diversityScore > 0.4 ? 'Moderate diversity' : 'Focused preferences'}
            </p>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

export default function RecommendationsPage() {
  const isDesktopApp = useIsDesktopApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [nicheBoost, setNicheBoost] = useState(0.3);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium'>('all');

  const { recommendations, profile, isLoading } = useRecommendationEngine({ nicheBoost, limit: 40 });
  const { recommendations: mangaRecs, isLoading: loadingManga } = useMangaRecommendationEngine({ nicheBoost, limit: 30 });

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
      if (!user) throw new Error('Not authenticated');
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
        const label = feedback === 'already_seen' ? 'already watched' : feedback;
        toast.success(`Feedback saved: ${label}`);
      },
      onError: (error: any) => toast.error(error?.message || 'Failed to save recommendation feedback'),
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <GlassPanel className="p-8 text-center max-w-md">
          <Sparkles className="w-16 h-16 mx-auto mb-4 text-primary" />
          <h2 className="text-2xl font-bold mb-2">Sign In Required</h2>
          <p className="text-muted-foreground mb-4">Sign in to get personalized recommendations from your lists, ratings and viewing history.</p>
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
              <h1 className="text-3xl font-bold">Recommendations</h1>
              <p className="text-muted-foreground">Personalized from your lists, ratings and history, blended with what similar fans enjoy</p>
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
            <p className="text-muted-foreground">Watch, rate or add some anime to build your taste profile.</p>
          </GlassPanel>
        )}

        <Tabs defaultValue="grid" className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <TabsList>
              <TabsTrigger value="grid" className="gap-2"><TrendingUp className="w-4 h-4" /> For You</TabsTrigger>
              <TabsTrigger value="manga" className="gap-2"><BookOpen className="w-4 h-4" /> Manga</TabsTrigger>
              <TabsTrigger value="atlas" className="gap-2"><Compass className="w-4 h-4" /> Atlas</TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 min-w-[220px]">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Popular</span>
                <Slider value={[nicheBoost]} min={0} max={1} step={0.05} onValueChange={(v) => setNicheBoost(v[0])} className="w-32" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">Niche</span>
              </div>
              <div className="flex gap-2">
                <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>All</Button>
                <Button variant={filter === 'high' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('high')}>High</Button>
                <Button variant={filter === 'medium' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('medium')}>Medium</Button>
              </div>
            </div>
          </div>

          <TabsContent value="grid">
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="aspect-[2/3] bg-muted/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredRecommendations.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
                <p className="text-muted-foreground">No recommendations yet. Watch and rate more anime to improve suggestions.</p>
              </GlassPanel>
            )}

            {recommendations.some((r) => r.factors.collaborative > 0) && (
              <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                Community signal is active — some picks are boosted by fans with similar taste.
              </p>
            )}
          </TabsContent>

          <TabsContent value="manga">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-bold">Manga, Manhwa & Manhua for you</h2>
              <span className="text-xs text-muted-foreground">Based on your readlist</span>
            </div>
            <MangaRecommendationGrid recommendations={mangaRecs} isLoading={loadingManga} />
          </TabsContent>

          <TabsContent value="atlas">
            <AnimeAtlasPanel animeRecs={recommendations} mangaRecs={mangaRecs} />
          </TabsContent>
        </Tabs>
      </main>

      <MobileNav />
    </div>
  );
}
