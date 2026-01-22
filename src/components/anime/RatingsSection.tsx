import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAnimeRatingStats, useUserRating, useRateAnime, useDeleteRating } from '@/hooks/useRatings';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface RatingsSectionProps {
  animeId: string;
}

function StarRating({ rating, onRate, interactive = false, size = 'md' }: {
  rating: number;
  onRate?: (rating: number) => void;
  interactive?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
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
            className={`${sizeClasses[size]} transition-colors ${
              star <= (hoverRating || rating)
                ? 'text-amber fill-amber'
                : 'text-muted-foreground/30'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export function RatingsSection({ animeId }: RatingsSectionProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedRating, setSelectedRating] = useState(0);
  const [review, setReview] = useState('');
  const [showReviewInput, setShowReviewInput] = useState(false);
  
  const { data: stats, isLoading: loadingStats } = useAnimeRatingStats(animeId);
  const { data: userRating, isLoading: loadingUserRating } = useUserRating(animeId);
  const rateAnime = useRateAnime();
  const deleteRating = useDeleteRating();

  const handleRate = async (rating: number) => {
    setSelectedRating(rating);
    setShowReviewInput(true);
  };

  const handleSubmitRating = async () => {
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
        <h3 className="font-display text-xl font-semibold">Ratings & Reviews</h3>
      </div>
      
      {/* Stats Overview */}
      <div className="flex items-center gap-6 p-4 rounded-xl bg-card/50 border border-border/30">
        {loadingStats ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        ) : stats && stats.count > 0 ? (
          <>
            <div className="text-center">
              <div className="text-4xl font-bold text-amber">{displayAverage.toFixed(1)}</div>
              <div className="text-sm text-muted-foreground">{stats.count} rating{stats.count !== 1 ? 's' : ''}</div>
            </div>
            <div className="flex-1">
              <StarRating rating={Math.round(displayAverage)} size="md" />
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">No ratings yet. Be the first!</div>
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
                <span className="text-sm text-muted-foreground">Your rating</span>
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
              <p className="text-sm text-muted-foreground">Rate this anime</p>
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
                    placeholder="Write a review (optional)..."
                    className="min-h-[80px] bg-muted/50"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSubmitRating} disabled={rateAnime.isPending}>
                      {rateAnime.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Submit Rating
                    </Button>
                    <Button variant="outline" onClick={() => {
                      setShowReviewInput(false);
                      setSelectedRating(0);
                      setReview('');
                    }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-card/50 border border-border/30 text-center">
          <p className="text-muted-foreground mb-3">Sign in to rate this anime</p>
          <Button onClick={() => navigate('/auth')}>Sign In</Button>
        </div>
      )}
      
    </div>
  );
}
