import { useState, useEffect } from 'react';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { useMLRecommendations, useTasteProfile } from '@/hooks/useMLRecommendations';
import { usePersonalizedRecommendations } from '@/hooks/useRecommendations';
import { useAuth } from '@/contexts/AuthContext';
import { Sparkles, TrendingUp, Brain, Star, Calendar, Film, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getProxiedImageUrl } from '@/lib/api';
import { MLRecommendation, TasteProfile } from '@/lib/mlRecommendations';

function RecommendationCard({ recommendation }: { recommendation: MLRecommendation }) {
  const { anime, score, confidence, reasons, factors } = recommendation;

  return (
    <Link to={`/anime/${anime.id}`}>
      <GlassPanel hoverEffect className="group cursor-pointer overflow-hidden">
        <div className="relative aspect-[3/4]">
          <img
            src={getProxiedImageUrl(anime.poster)}
            alt={anime.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

          {/* Score Badge */}
          <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-primary/90 backdrop-blur text-primary-foreground text-xs font-bold flex items-center gap-1">
            <Star className="w-3 h-3 fill-current" />
            {score}%
          </div>

          {/* Confidence Indicator */}
          <div className="absolute top-3 left-3">
            <div className={`px-2 py-1 rounded-md text-xs font-bold ${confidence > 0.7 ? 'bg-green-500/80 text-white' :
              confidence > 0.4 ? 'bg-yellow-500/80 text-white' :
                'bg-gray-500/80 text-white'
              }`}>
              {confidence > 0.7 ? 'High' : confidence > 0.4 ? 'Medium' : 'Low'} Match
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors mb-2">
              {anime.name}
            </h3>

            {/* Reasons */}
            {reasons.length > 0 && (
              <div className="space-y-1">
                {reasons.slice(0, 2).map((reason, i) => (
                  <p key={i} className="text-xs text-muted-foreground line-clamp-1">
                    • {reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </GlassPanel>
    </Link>
  );
}

function TasteProfileDisplay({ profile }: { profile: TasteProfile }) {
  return (
    <GlassPanel className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/20 rounded-xl">
          <Brain className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Your Taste Profile</h2>
          <p className="text-sm text-muted-foreground">
            Based on your watch history and preferences
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Genres */}
        <div>
          <h3 className="text-sm font-bold text-muted-foreground mb-2">Top Genres</h3>
          <div className="space-y-1">
            {profile.preferredGenres.slice(0, 5).map((g, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm">{g.genre}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${g.weight * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-right">
                    {Math.round(g.weight * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preferences */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-bold text-muted-foreground mb-2">Rating Range</h3>
            <p className="text-sm">
              {profile.preferredRatings.min.toFixed(1)} - {profile.preferredRatings.max.toFixed(1)}
              {' '}(avg: {profile.preferredRatings.average.toFixed(1)})
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-muted-foreground mb-2">Preferred Types</h3>
            <div className="flex flex-wrap gap-2">
              {profile.preferredTypes.slice(0, 3).map((t, i) => (
                <span key={i} className="px-2 py-1 bg-primary/20 text-primary text-xs rounded">
                  {t.type}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-muted-foreground mb-2">Diversity Score</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${profile.diversityScore * 100}%` }}
                />
              </div>
              <span className="text-sm font-bold">
                {Math.round(profile.diversityScore * 100)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {profile.diversityScore > 0.7 ? 'Very diverse taste' :
                profile.diversityScore > 0.4 ? 'Moderate diversity' :
                  'Focused preferences'}
            </p>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}

export default function RecommendationsPage() {
  const { user } = useAuth();
  const { data: tasteProfile, isLoading: loadingProfile } = useTasteProfile();
  const { data: recommendations, isLoading: loadingRecs } = useMLRecommendations(30);
  const { data: personalizedRecs, isLoading: loadingPersonalized } = usePersonalizedRecommendations(12);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium'>('all');
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    if (loadingRecs || loadingProfile || loadingPersonalized) {
      const interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 95) return prev;
          return prev + Math.floor(Math.random() * 15);
        });
      }, 500);
      return () => clearInterval(interval);
    } else {
      setLoadingProgress(100);
    }
  }, [loadingRecs, loadingProfile, loadingPersonalized]);

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <GlassPanel className="p-8 text-center max-w-md">
          <Sparkles className="w-16 h-16 mx-auto mb-4 text-primary" />
          <h2 className="text-2xl font-bold mb-2">Sign In Required</h2>
          <p className="text-muted-foreground mb-4">
            Sign in to get personalized ML-powered recommendations based on your taste.
          </p>
        </GlassPanel>
      </div>
    );
  }

  const filteredRecommendations = recommendations?.filter((rec) => {
    if (filter === 'high') return rec.confidence > 0.7;
    if (filter === 'medium') return rec.confidence > 0.4 && rec.confidence <= 0.7;
    return true;
  }) || [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-4 md:pl-28 pr-4 md:pr-6 py-4 md:py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">ML Recommendations</h1>
              <p className="text-muted-foreground">
                Powered by machine learning analysis of your viewing preferences
              </p>
            </div>
          </div>
        </div>

        {/* Taste Profile */}
        {loadingProfile ? (
          <GlassPanel className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-4 bg-muted rounded w-2/3" />
            </div>
          </GlassPanel>
        ) : tasteProfile ? (
          <TasteProfileDisplay profile={tasteProfile} />
        ) : (
          <GlassPanel className="p-6 text-center">
            <Brain className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              Watch some anime to build your taste profile
            </p>
          </GlassPanel>
        )}

        {/* Personalized Recommendations Section */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-6">
            <Target className="w-5 h-5 text-green-400" />
            <h2 className="text-xl font-bold">Personalized Recommendations</h2>
            <span className="text-xs text-muted-foreground ml-2">(Based on your genre preferences)</span>
          </div>

          {loadingPersonalized ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] bg-muted/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : personalizedRecs && personalizedRecs.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {personalizedRecs.slice(0, 12).map((item: any, index: number) => (
                <Link key={item.anime.id} to={`/anime/${item.anime.id}`}>
                  <GlassPanel hoverEffect className="group cursor-pointer overflow-hidden">
                    <div className="relative aspect-[3/4]">
                      <img
                        src={getProxiedImageUrl(item.anime.poster)}
                        alt={item.anime.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

                      {/* Score Badge */}
                      <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-green-500/90 backdrop-blur text-white text-xs font-bold flex items-center gap-1">
                        <Star className="w-3 h-3 fill-current" />
                        {item.score}
                      </div>

                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <h3 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors mb-2">
                          {item.anime.name}
                        </h3>

                        {/* Reason */}
                        {item.reason && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            • {item.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </GlassPanel>
                </Link>
              ))}
            </div>
          ) : (
            <GlassPanel className="p-8 text-center">
              <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                Watch some anime to get personalized recommendations.
              </p>
            </GlassPanel>
          )}
        </div>

        {/* Recommendations */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-primary" />
              Recommended For You
            </h2>
            <div className="flex gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                All
              </Button>
              <Button
                variant={filter === 'high' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('high')}
              >
                High Match
              </Button>
              <Button
                variant={filter === 'medium' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('medium')}
              >
                Medium Match
              </Button>
            </div>
          </div>

          {loadingRecs ? (
            <div className="space-y-8">
              <div className="flex flex-col items-center justify-center py-12">
                <div className="text-6xl font-bold text-primary mb-4 animate-pulse">
                  {loadingProgress}%
                </div>
                <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-4">Analyzing your taste profile...</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] bg-muted/50 rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ) : filteredRecommendations.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredRecommendations.map((rec) => (
                <RecommendationCard key={rec.anime.id} recommendation={rec} />
              ))}
            </div>
          ) : (
            <GlassPanel className="p-8 text-center">
              <Film className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">
                No recommendations found. Try watching more anime to improve suggestions.
              </p>
            </GlassPanel>
          )}
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
