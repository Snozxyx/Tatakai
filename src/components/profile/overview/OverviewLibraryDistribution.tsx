import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Library } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';
import { computeLibraryDistribution } from '@/core/profile/libraryDistribution';

export interface OverviewLibraryDistributionProps {
  watchlist?: any[];
  mangaReadlist?: any[];
}

const GlassTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const p = payload[0];
    return (
      <div className="rounded-xl border border-white/[0.08] bg-background/80 p-3 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.payload?.color }} />
          <span className="text-muted-foreground/70">{p.payload?.label}:</span>
          <span className="font-semibold text-foreground font-mono">{p.value}</span>
        </div>
      </div>
    );
  }
  return null;
};

export function OverviewLibraryDistribution({
  watchlist = [],
  mangaReadlist = [],
}: OverviewLibraryDistributionProps) {
  const dist = useMemo(
    () => computeLibraryDistribution(watchlist, mangaReadlist),
    [watchlist, mangaReadlist],
  );
  const [tab, setTab] = useState<'anime' | 'manga'>('anime');

  const buckets = tab === 'anime' ? dist.anime : dist.manga;
  const total = tab === 'anime' ? dist.animeTotal : dist.mangaTotal;
  const pieData = buckets.filter((b) => b.count > 0);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      {/* Header + segmented control */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Library className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              Library Distribution
            </h3>
          </div>
          <p className="text-xs text-muted-foreground/70">How your titles break down by status</p>
        </div>

        <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/[0.03] self-start sm:self-auto">
          {(['anime', 'manga'] as const).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all duration-200',
                tab === key
                  ? 'bg-white/10 text-foreground shadow-sm'
                  : 'text-muted-foreground/60 hover:text-foreground/90 hover:bg-white/[0.02]',
              )}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {total === 0 ? (
              <div className="flex flex-col items-center justify-center h-[220px] text-center">
                <Library className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground/60">
                  No {tab} titles tracked yet.
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Donut */}
                <div className="h-[170px] w-[170px] relative shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip content={<GlassTooltip />} />
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={54}
                        outerRadius={78}
                        paddingAngle={4}
                        dataKey="count"
                        stroke="none"
                        cornerRadius={5}
                        animationDuration={700}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.status} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="font-display font-bold text-2xl text-foreground">{total}</span>
                    <span className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-widest">
                      Titles
                    </span>
                  </div>
                </div>

                {/* Status bars */}
                <div className="flex-1 w-full space-y-2.5">
                  {buckets.map((b) => (
                    <div key={b.status} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground/80 w-24 shrink-0">{b.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: b.color }}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${(b.count / maxCount) * 100}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                        />
                      </div>
                      <span className="text-xs font-mono font-semibold text-foreground w-8 text-right tabular-nums">
                        {b.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </GlassPanel>
  );
}
