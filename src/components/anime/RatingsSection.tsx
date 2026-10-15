import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityRulesGate } from '@/components/community/CommunityRulesGate';
import {
  useAnimeRatings,
  useAnimeRatingStats,
  useUserRating,
  useRateAnime,
  useDeleteRating,
} from '@/hooks/user/useRatings';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2, Trash2, MessageSquareQuote } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

interface RatingsSectionProps {
  animeId: string;
}

function StarRating({ rating, onRate, interactive = false, size = 'md' }: {
  rating: number;
  onRate?: (rating: number) => void;
  interactive?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  useUiTranslation();
  const [hoverRating, setHoverRating] = useState(0);
  
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  // 5-star rating system
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          disabled={!interactive}
          onClick={() => onRate?.(star)}
          onMouseEnter={() => interactive && setHoverRating(star)}
          onMouseLeave={() => interactive && setHoverRating(0)}
          className={`${interactive ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}`}
        >
          <Star
            className={`${sizeClasses[size]} transition-colors ${star <= (hoverRating || rating)
                ? 'text-amber fill-amber'
                : 'text-muted-foreground/30'}`}
          />
        </button>
      ))}
    </div>
  );
}

export function RatingsSection({ animeId }: RatingsSectionProps) {
  useUiTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const ensureAgreed = useCommunityRulesGate();
  const [selectedRating, setSelectedRating] = useState(0);
  const [review, setReview] = useState('');
  const [showReviewInput, setShowReviewInput] = useState(false);
  
  const { data: stats, isLoading: loadingStats } = useAnimeRatingStats(animeId);
  const { data: userRating, isLoading: loadingUserRating } = useUserRating(animeId);
  const { data: allRatings = [] } = useAnimeRatings(animeId);
  const rateAnime = useRateAnime();
  const deleteRating = useDeleteRating();

  // Community reviews = ratings that carry free-text, newest first (the hook
  // already returns them ordered by created_at desc with the author profile).
  const reviews = allRatings.filter(
    (r) => typeof r.review === 'string' && r.review.trim().length > 0,
  );

  const handleRate = async (rating: number) => {
    setSelectedRating(rating);
    setShowReviewInput(true);
  };

  const handleSubmitRating = async () => {
    if (!(await ensureAgreed())) return;
    await rateAnime.mutateAsync({
      animeId,
      rating: selectedRating,
      review: review.trim() || undefined,
    });
    setSelectedRating(0);
    setReview('');
    setShowReviewInput(false);
  };

  const handleDeleteRating = async () => {
    await deleteRating.mutateAsync(animeId);
  };

  // Convert 5-star to display (stats might still be stored as 1-10, so we handle both)
  const displayAverage = stats ? (stats.average > 5 ? stats.average / 2 : stats.average) : 0;
  const displayUserRating = userRating ? (userRating.rating > 5 ? Math.ceil(userRating.rating / 2) : userRating.rating) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Star className="w-5 h-5 text-amber fill-amber" />
        <h3 className="font-display text-xl font-semibold">{uiI18n.t('app.ratings_reviews_79cced2f')}</h3>
      </div>
      
      {/* Stats Overview */}
      <div className="flex items-center gap-6 p-4 rounded-xl bg-card/50 border border-border/30">
        {loadingStats ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        ) : stats && stats.count > 0 ? (
          <>
            <div className="text-center">
              <div className="text-4xl font-bold text-amber">{displayAverage.toFixed(1)}</div>
              <div className="text-sm text-muted-foreground">{stats.count} {uiI18n.t('app.rating_3c2d687e')}{stats.count !== 1 ? 's' : ''}</div>
            </div>
            <div className="flex-1">
              <StarRating rating={Math.round(displayAverage)} size="md" />
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">{uiI18n.t('app.no_ratings_yet_be_the_first_7acaa18d')}</div>
        )}
      </div>
      
      {/* User Rating */}
      {user ? (
        <div className="p-4 rounded-xl bg-card/50 border border-border/30">
          {loadingUserRating ? (
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          ) : userRating ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{uiI18n.t('app.your_rating_83cd624d')}</span>
                <button
                  onClick={handleDeleteRating}
                  disabled={deleteRating.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <StarRating rating={displayUserRating} size="md" />
              {userRating.review && (
                <p className="text-sm text-foreground/90">{userRating.review}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{uiI18n.t('app.rate_this_anime_a5f8ad4b')}</p>
              <StarRating
                rating={selectedRating}
                onRate={handleRate}
                interactive
                size="lg"
              />
              
              {showReviewInput && (
                <div className="space-y-3 mt-4 pt-4 border-t border-border/30">
                  <Textarea
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder={uiI18n.t('app.write_a_review_optional_18632e4b')}
                    className="min-h-[80px] bg-muted/50"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSubmitRating} disabled={rateAnime.isPending}>
                      {rateAnime.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      {uiI18n.t('app.submit_rating_30107cf6')}
                    </Button>
                    <Button variant="outline" onClick={() => {
                      setShowReviewInput(false);
                      setSelectedRating(0);
                      setReview('');
                    }}>
                      {uiI18n.t('app.cancel_77dfd213')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-card/50 border border-border/30 text-center">
          <p className="text-muted-foreground mb-3">{uiI18n.t('app.sign_in_to_rate_this_anime_92e7a01d')}</p>
          <Button onClick={() => navigate('/auth')}>{uiI18n.t('app.sign_in_f8492cc1')}</Button>
        </div>
      )}

      {/* Community Reviews */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <MessageSquareQuote className="w-5 h-5 text-primary" />
          <h4 className="font-display text-lg font-semibold">{uiI18n.t('app.reviews_b83c4cda')}</h4>
          {reviews.length > 0 && (
            <span className="text-sm text-muted-foreground">({reviews.length})</span>
          )}
        </div>

        {reviews.length > 0 ? (
          <div className="space-y-3">
            {reviews.map((r) => {
              const displayRating = r.rating > 5 ? Math.round(r.rating / 2) : r.rating;
              const name = r.profile?.display_name || r.profile?.username || 'Anonymous';
              const initial = name.charAt(0).toUpperCase();
              const date = new Date(r.created_at).toLocaleDateString(uiI18n.language, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });
              const avatar = (
                <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-border/40 bg-primary/15 flex items-center justify-center">
                  {r.profile?.avatar_url ? (
                    <img
                      src={r.profile.avatar_url}
                      alt={name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold text-primary">{initial}</span>
                  )}
                </div>
              );

              return (
                <div
                  key={r.id}
                  className="p-4 rounded-xl bg-card/50 border border-border/30 space-y-2"
                >
                  <div className="flex items-center gap-3">
                    {r.profile?.username ? (
                      <Link to={`/user/${r.profile.username}`} className="shrink-0">
                        {avatar}
                      </Link>
                    ) : (
                      avatar
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground/90 truncate">
                          {r.profile?.username ? (
                            <Link
                              to={`/user/${r.profile.username}`}
                              className="hover:text-primary transition-colors"
                            >
                              {name}
                            </Link>
                          ) : (
                            name
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">{date}</span>
                      </div>
                      <StarRating rating={displayRating} size="sm" />
                    </div>
                  </div>
                  <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line">
                    {r.review}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-card/50 border border-border/30 text-center text-sm text-muted-foreground">
            {uiI18n.t('app.no_reviews_yet_rate_this_anime_and_share_your_th_4d25f8ac')}
          </div>
        )}
      </div>
    </div>
  );
}

