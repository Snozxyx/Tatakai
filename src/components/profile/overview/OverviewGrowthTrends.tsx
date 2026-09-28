import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { TrendingUp, LineChart as LineIcon } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';
import { computeMonthlySeries, type GrowthInputs } from '@/core/profile/growthSeries';

export interface OverviewGrowthTrendsProps extends GrowthInputs {
  months?: number;
}

const GlassTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-background/80 p-3 shadow-2xl backdrop-blur-2xl">
        <p className="text-xs font-semibold text-foreground/90 mb-1.5">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.stroke }} />
            <span className="text-muted-foreground/70">{entry.name}:</span>
            <span className="font-semibold text-foreground font-mono">
              {entry.value}
              {entry.name === 'Completion' ? '%' : ''}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function OverviewGrowthTrends({ months = 12, ...inputs }: OverviewGrowthTrendsProps) {
  const series = useMemo(() => computeMonthlySeries(inputs, months), [inputs, months]);
  const [view, setView] = useState<'growth' | 'completion'>('growth');

  return (
    <GlassPanel className="relative h-full overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              Growth & Trends
            </h3>
          </div>
          <p className="text-xs text-muted-foreground/70">Real monthly activity over the last {months} months</p>
        </div>

        <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/[0.03] self-start sm:self-auto">
          <button
            onClick={() => setView('growth')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
              view === 'growth'
                ? 'bg-white/10 text-foreground shadow-sm'
                : 'text-muted-foreground/60 hover:text-foreground/90 hover:bg-white/[0.02]',
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Growth
          </button>
          <button
            onClick={() => setView('completion')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
              view === 'completion'
                ? 'bg-white/10 text-foreground shadow-sm'
                : 'text-muted-foreground/60 hover:text-foreground/90 hover:bg-white/[0.02]',
            )}
          >
            <LineIcon className="w-3.5 h-3.5" />
            Completion
          </button>
        </div>
      </div>

      <div className="relative z-10 h-[260px] w-full">
        {!series.hasData ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <TrendingUp className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground/60">Not enough activity to chart yet.</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {view === 'growth' ? (
              <motion.div
                key="growth"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series.cumulative} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="animeGrowth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="mangaGrowth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="label" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<GlassTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="anime"
                      name="Anime"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fill="url(#animeGrowth)"
                      animationDuration={900}
                    />
                    <Area
                      type="monotone"
                      dataKey="manga"
                      name="Manga"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#mangaGrowth)"
                      animationDuration={900}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            ) : (
              <motion.div
                key="completion"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="h-full w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series.completionTrend} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="label" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#52525b"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 100]}
                      unit="%"
                    />
                    <Tooltip content={<GlassTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="rate"
                      name="Completion"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#10b981' }}
                      animationDuration={900}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </GlassPanel>
  );
}
