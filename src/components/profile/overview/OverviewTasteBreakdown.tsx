import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Star, Shuffle } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import type { TasteProfile } from '@/core/recommendations/types';

export interface OverviewTasteBreakdownProps {
  profile?: TasteProfile | null;
  isLoading?: boolean;
}

function diversityLabel(score: number): string {
  if (score > 0.7) return 'Very diverse taste';
  if (score > 0.4) return 'Moderate diversity';
  return 'Focused preferences';
}

export function OverviewTasteBreakdown({ profile, isLoading = false }: OverviewTasteBreakdownProps) {
  const hasProfile = !!profile && (profile.topStudios.length > 0 || profile.sampleSize > 0);

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-primary/80" />
          <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
            Taste Breakdown
          </h3>
        </div>
        <p className="text-xs text-muted-foreground/70">Favorite studios, rating range, and diversity</p>
      </div>

      <div className="relative z-10 flex-1">
        {isLoading ? (
          <div className="h-[200px] w-full animate-pulse rounded-xl bg-white/[0.02]" />
        ) : !hasProfile ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-center">
            <Building2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground/60 max-w-[220px]">
              No taste profile yet. Generate one to see your favorite studios.
            </p>
            <Link to="/recommendations" className="mt-3 text-xs font-medium text-primary hover:underline">
              Build your taste profile →
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Favorite studios */}
            {profile!.topStudios.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground/60" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Favorite Studios
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile!.topStudios.slice(0, 6).map((s) => (
                    <span
                      key={s.studio}
                      className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium"
                    >
                      {s.studio}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Rating range */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Star className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Preferred Rating
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/[0.04] relative overflow-hidden">
                  <div
                    className="absolute h-full rounded-full bg-gradient-to-r from-primary/50 to-primary"
                    style={{
                      left: `${(profile!.ratingRange.min / 10) * 100}%`,
                      width: `${((profile!.ratingRange.max - profile!.ratingRange.min) / 10) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-mono font-semibold text-foreground tabular-nums shrink-0">
                  {profile!.ratingRange.min.toFixed(1)}–{profile!.ratingRange.max.toFixed(1)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                Avg {profile!.ratingRange.average.toFixed(1)}/10
              </p>
            </div>

            {/* Diversity */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <Shuffle className="w-3.5 h-3.5 text-muted-foreground/60" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Diversity Score
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-emerald-500"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${profile!.diversityScore * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <span className="text-xs font-bold text-foreground tabular-nums shrink-0">
                  {Math.round(profile!.diversityScore * 100)}%
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1">
                {diversityLabel(profile!.diversityScore)}
              </p>
            </div>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
