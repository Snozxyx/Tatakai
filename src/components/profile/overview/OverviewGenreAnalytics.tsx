import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts';
import { Sparkles } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import type { TasteProfile } from '@/core/recommendations/types';

export interface OverviewGenreAnalyticsProps {
  profile?: TasteProfile | null;
  isLoading?: boolean;
}

const GlassTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-background/80 p-3 shadow-2xl backdrop-blur-2xl">
        <p className="text-xs font-semibold text-foreground/90">{payload[0].payload.genre}</p>
        <p className="text-xs text-muted-foreground/70">
          Affinity <span className="font-mono font-semibold text-foreground">{payload[0].value}%</span>
        </p>
      </div>
    );
  }
  return null;
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[220px] text-center">
      <Sparkles className="w-10 h-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground/60 max-w-[220px]">{message}</p>
      <Link
        to="/recommendations"
        className="mt-3 text-xs font-medium text-primary hover:underline"
      >
        Build your taste profile →
      </Link>
    </div>
  );
}

export function OverviewGenreAnalytics({ profile, isLoading = false }: OverviewGenreAnalyticsProps) {
  const radarData = useMemo(
    () =>
      (profile?.topGenres || []).slice(0, 6).map((g) => ({
        genre: g.genre,
        weight: Math.round(g.weight * 100),
      })),
    [profile],
  );

  // Top tags from the taste profile's tag weight map (highest-weighted first).
  const topTags = useMemo(() => {
    const entries = Object.entries(profile?.tags || {});
    return entries
      .filter(([, w]) => Number.isFinite(w) && w > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag]) => tag);
  }, [profile]);

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-primary/80" />
          <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
            Genre Analytics
          </h3>
        </div>
        <p className="text-xs text-muted-foreground/70">Your genre affinity across watched titles</p>
      </div>

      <div className="relative z-10">
        {isLoading ? (
          <div className="h-[220px] w-full animate-pulse rounded-xl bg-white/[0.02]" />
        ) : !profile || radarData.length === 0 ? (
          <EmptyState message="No taste profile yet. Visit Recommendations to generate one from your lists." />
        ) : radarData.length >= 3 ? (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="70%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="genre" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip content={<GlassTooltip />} />
                <Radar
                  dataKey="weight"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.4}
                  animationDuration={800}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="space-y-2 py-4">
            {(profile.topGenres || []).slice(0, 5).map((g) => (
              <div key={g.genre} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground/80 w-24 shrink-0 truncate">{g.genre}</span>
                <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${g.weight * 100}%` }} />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                  {Math.round(g.weight * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Top tags */}
        {profile && topTags.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/[0.04]">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Top Tags
            </span>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {topTags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-medium text-foreground/80"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
