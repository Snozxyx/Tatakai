import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquareQuote, Star, Tv } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { useAnimeMetaByIds } from '@/hooks/api/useAnimeMetaByIds';
import type { RatingRow } from '@/core/profile/ratingStats';

const MAX_REVIEWS = 3;

/**
 * Reviews the user has written — the free-text `review` field on their anime
 * `ratings`. The ratings table only stores `anime_id`, so titles and posters are
 * resolved against the watchlist / watch-history rows already loaded on the
 * profile (both carry `anime_name` / `anime_poster` keyed by `anime_id`).
 */

export interface OverviewReviewsProps {
  ratings?: RatingRow[];
  watchlist?: any[];
  history?: any[];
  isViewingOther?: boolean;
}

interface ReviewRow {
  animeId: string;
  rating: number;
  review: string;
  createdAt?: string;
  title: string;
  poster: string | null;
}

// AniList/DB ratings are 1–10; the anime page shows a 5-star scale. Convert for
// the star display while keeping the raw score in the badge.
function toStars(rating: number): number {
  return rating > 5 ? Math.round(rating / 2) : rating;
}

export function OverviewReviews({
  ratings = [],
  watchlist = [],
  history = [],
  isViewingOther = false,
}: OverviewReviewsProps) {
  // Local metadata from the lists already loaded on the profile.
  const localMetaById = useMemo(() => {
    const map = new Map<string, { title: string; poster: string | null }>();
    const add = (row: any) => {
      const id = row?.anime_id;
      if (!id || map.has(id)) return;
      map.set(id, { title: row?.anime_name || '', poster: row?.anime_poster ?? null });
    };
    watchlist.forEach(add);
    history.forEach(add);
    return map;
  }, [watchlist, history]);

  // The (up to 3) newest reviews, before title/poster resolution.
  const topReviews = useMemo(() => {
    return ratings
      .filter((r) => typeof r.review === 'string' && r.review.trim().length > 0)
      .sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return tb - ta;
      })
      .slice(0, MAX_REVIEWS);
  }, [ratings]);

  // Only the shown reviews whose title/poster couldn't be resolved locally need
  // an AniList lookup — at most 3 ids, one request.
  const unresolvedIds = useMemo(
    () =>
      topReviews
        .map((r) => r.anime_id)
        .filter((id): id is string => {
          if (!id) return false;
          const local = localMetaById.get(id);
          return !local?.title || !local?.poster;
        }),
    [topReviews, localMetaById],
  );

  const { data: remoteMeta = {} } = useAnimeMetaByIds(unresolvedIds);

  const totalReviews = useMemo(
    () => ratings.filter((r) => typeof r.review === 'string' && r.review.trim().length > 0).length,
    [ratings],
  );

  const reviews = useMemo<ReviewRow[]>(() => {
    return topReviews.map((r) => {
      const local = r.anime_id ? localMetaById.get(r.anime_id) : undefined;
      const numeric = Number(String(r.anime_id ?? '').match(/(\d+)/)?.[1]);
      const remote = Number.isFinite(numeric) ? remoteMeta[numeric] : undefined;
      return {
        animeId: r.anime_id || '',
        rating: r.rating,
        review: (r.review || '').trim(),
        createdAt: r.created_at,
        title: local?.title || remote?.title || 'Unknown title',
        poster: local?.poster || remote?.coverImage || null,
      };
    });
  }, [topReviews, localMetaById, remoteMeta]);

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl h-full">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg border border-white/[0.05] bg-primary/10 text-primary">
              <MessageSquareQuote className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-display font-bold text-base text-foreground tracking-tight">
                {isViewingOther ? 'Reviews' : 'Your Reviews'}
              </h4>
              <p className="text-xs text-muted-foreground/70 font-medium">
                {totalReviews > 0
                  ? `Showing ${reviews.length} of ${totalReviews} ${totalReviews === 1 ? 'review' : 'reviews'}`
                  : 'Written reviews on rated anime'}
              </p>
            </div>
          </div>
        </div>

        {/* Review list */}
        {reviews.length > 0 ? (
          <div className="space-y-2.5">
            {reviews.map((row, idx) => (
              <motion.div
                key={`${row.animeId}-${idx}`}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: idx * 0.04, ease: 'easeOut' }}
              >
                <Link
                  to={row.animeId ? `/anime/${row.animeId}` : '#'}
                  className="group flex gap-3 p-3 rounded-xl border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.05] hover:border-primary/30 transition-all duration-200"
                >
                  {row.poster ? (
                    <img
                      src={row.poster}
                      alt={row.title}
                      loading="lazy"
                      className="w-10 h-14 rounded-lg object-cover shrink-0 border border-white/10 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-10 h-14 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <Tv className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="font-semibold text-xs text-foreground/90 truncate group-hover:text-primary transition-colors">
                        {row.title}
                      </h5>
                      <span className="flex items-center gap-1 shrink-0 text-[10px] font-bold text-amber-400 tabular-nums">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {toStars(row.rating)}
                        <span className="text-muted-foreground/50">/5</span>
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground/80 leading-relaxed line-clamp-3">
                      {row.review}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-white/[0.08] rounded-xl bg-white/[0.01]">
            <MessageSquareQuote className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground/70">
              {isViewingOther ? 'No reviews written yet' : "You haven't written any reviews yet"}
            </p>
            {!isViewingOther && (
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                Rate an anime and add a review to see it here
              </p>
            )}
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
