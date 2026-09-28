import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Star } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { computeRatingDistribution, type RatingRow } from '@/core/profile/ratingStats';

export interface OverviewRatingDistributionProps {
  ratings?: RatingRow[];
}

// Score → hue ramp: low scores rose, mid amber, high emerald.
function barColor(rating: number): string {
  if (rating <= 3) return '#f43f5e';
  if (rating <= 6) return '#f59e0b';
  if (rating <= 8) return '#8b5cf6';
  return '#10b981';
}

const GlassTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-background/80 p-3 shadow-2xl backdrop-blur-2xl">
        <p className="text-xs font-semibold text-foreground/90 mb-1">Score {label}</p>
        <p className="text-xs text-muted-foreground/70">
          <span className="font-mono font-semibold text-foreground">{payload[0].value}</span>{' '}
          {payload[0].value === 1 ? 'title' : 'titles'}
        </p>
      </div>
    );
  }
  return null;
};

export function OverviewRatingDistribution({ ratings = [] }: OverviewRatingDistributionProps) {
  const dist = useMemo(() => computeRatingDistribution(ratings), [ratings]);

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 flex items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              Rating Distribution
            </h3>
          </div>
          <p className="text-xs text-muted-foreground/70">How you score the titles you rate</p>
        </div>
        {dist.total > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary shrink-0">
            <span className="font-bold font-display tabular-nums">{dist.average.toFixed(1)}</span>
            <span className="text-[10px] uppercase font-semibold tracking-wide">avg</span>
          </div>
        )}
      </div>

      <div className="relative z-10 h-[220px] w-full">
        {dist.total === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Star className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground/60">No ratings yet.</p>
            <p className="text-xs text-muted-foreground/40 mt-1">Rate titles to see your distribution.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dist.buckets} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false} />
              <XAxis dataKey="rating" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="count" radius={[5, 5, 0, 0]} animationDuration={700} barSize={26}>
                {dist.buckets.map((b) => (
                  <Cell key={b.rating} fill={barColor(b.rating)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {dist.total > 0 && (
        <div className="relative z-10 flex items-center justify-between pt-4 border-t border-white/[0.04] mt-2 text-[11px] text-muted-foreground/60">
          <span>{dist.total} rated</span>
          {dist.mode !== null && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              Most given: <span className="font-mono font-semibold text-foreground">{dist.mode}/10</span>
            </motion.span>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
