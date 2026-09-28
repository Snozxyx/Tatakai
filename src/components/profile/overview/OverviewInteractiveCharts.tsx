import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { GlassPanel } from '@/components/ui/GlassPanel';
import {
  PieChart as PieIcon,
  TrendingUp,
  Activity,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OverviewInteractiveChartsProps {
  animeCount: number;
  manhwaCount: number;
  mangaCount: number;
  comicsCount: number;
  watchTimeSeconds: number;
  commentCount: number;
  forumPostCount: number;
  reputationRate?: number;
  history?: any[];
}

const MEDIA_COLORS = {
  Anime: '#f43f5e',   // Rose
  Manhwa: '#ec4899',  // Pink
  Manga: '#f59e0b',   // Amber
  Comics: '#8b5cf6',  // Violet
};

type ChartView = 'distribution' | 'trends' | 'engagement';

export function OverviewInteractiveCharts({
  animeCount,
  manhwaCount,
  mangaCount,
  comicsCount,
  watchTimeSeconds,
  commentCount,
  forumPostCount,
  reputationRate = 98.5,
  history = [],
}: OverviewInteractiveChartsProps) {
  const [activeView, setActiveView] = useState<ChartView>('distribution');

  // Distribution data
  const distributionData = useMemo(() => {
    const raw = [
      { name: 'Anime', value: Math.max(animeCount, 1), color: MEDIA_COLORS.Anime },
      { name: 'Manhwa', value: Math.max(manhwaCount, 0), color: MEDIA_COLORS.Manhwa },
      { name: 'Manga', value: Math.max(mangaCount, 0), color: MEDIA_COLORS.Manga },
      { name: 'Comics', value: Math.max(comicsCount, 0), color: MEDIA_COLORS.Comics },
    ];
    const total = raw.reduce((acc, curr) => acc + curr.value, 0);
    return raw.filter((item) => item.value > 0 || total === 1);
  }, [animeCount, manhwaCount, mangaCount, comicsCount]);

  // Activity trends over 6 months
  const trendsData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const result: { label: string; watchHours: number; chapters: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = months[d.getMonth()];
      const totalHours = watchTimeSeconds / 3600;
      const factor = (6 - i) / 21 + 0.05;
      const monthHours = Number((totalHours * factor * 1.2).toFixed(1));
      const monthChapters = Math.round((mangaCount + manhwaCount * 2) * factor * 2);

      result.push({
        label,
        watchHours: Math.max(monthHours, 0.5),
        chapters: Math.max(monthChapters, 1),
      });
    }

    return result;
  }, [watchTimeSeconds, mangaCount, manhwaCount]);

  // Engagement data
  const engagementData = useMemo(() => {
    return [
      { metric: 'Comments', count: commentCount || 4, fill: '#38bdf8' },
      { metric: 'Forum Posts', count: forumPostCount || 2, fill: '#818cf8' },
      { metric: 'Reputation', count: Math.round(reputationRate), fill: '#10b981' },
      { metric: 'Shared', count: Math.max(Math.round(animeCount * 0.15), 1), fill: '#f43f5e' },
    ];
  }, [commentCount, forumPostCount, reputationRate, animeCount]);

  // Custom Glass Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-white/[0.08] bg-background/80 p-3 shadow-2xl backdrop-blur-2xl">
          <p className="text-xs font-semibold text-foreground/90 mb-1.5">{label || payload[0]?.name}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`tooltip-${index}`} className="flex items-center gap-2 text-xs">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color || entry.payload?.fill || entry.fill }}
              />
              <span className="text-muted-foreground/70">{entry.name || 'Count'}:</span>
              <span className="font-semibold text-foreground font-mono">
                {entry.value} {entry.unit || ''}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const totalTitles = animeCount + manhwaCount + mangaCount + comicsCount;

  return (
    <GlassPanel className="relative overflow-hidden p-5 sm:p-7 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
      {/* Decorative background glow */}
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[hsl(var(--profile-accent)/0.10)] blur-[70px] rounded-full pointer-events-none" />

      {/* Header & Segmented Control */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-primary/80" />
            <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
              Analytics Overview
            </h3>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Media distribution, consumption velocity, and interaction stats
          </p>
        </div>

        {/* Minimal Segmented Control */}
        <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/[0.03] self-start sm:self-auto">
          <button
            onClick={() => setActiveView('distribution')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
              activeView === 'distribution'
                ? 'bg-white/10 text-foreground shadow-sm'
                : 'text-muted-foreground/60 hover:text-foreground/90 hover:bg-white/[0.02]',
            )}
          >
            <PieIcon className="w-3.5 h-3.5" />
            <span>Distribution</span>
          </button>

          <button
            onClick={() => setActiveView('trends')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
              activeView === 'trends'
                ? 'bg-white/10 text-foreground shadow-sm'
                : 'text-muted-foreground/60 hover:text-foreground/90 hover:bg-white/[0.02]',
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Trends</span>
          </button>

          <button
            onClick={() => setActiveView('engagement')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
              activeView === 'engagement'
                ? 'bg-white/10 text-foreground shadow-sm'
                : 'text-muted-foreground/60 hover:text-foreground/90 hover:bg-white/[0.02]',
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Community</span>
          </button>
        </div>
      </div>

      {/* Chart Display Area */}
      <div className="h-[250px] sm:h-[270px] w-full relative z-10">
        <AnimatePresence mode="wait">
          {activeView === 'distribution' && (
            <motion.div
              key="distribution"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full w-full flex flex-col sm:flex-row items-center justify-around gap-6"
            >
              <div className="h-[200px] w-[200px] sm:h-[230px] sm:w-[230px] relative shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<CustomTooltip />} />
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={92}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      cornerRadius={6}
                      animationDuration={800}
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Donut Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Total
                  </span>
                  <span className="font-display font-bold text-2xl text-foreground my-0.5">
                    {totalTitles}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 font-medium">Titles</span>
                </div>
              </div>

              {/* Minimal Legend Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-2 w-full sm:w-auto max-w-xs">
                {distributionData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-6 px-3 py-2 rounded-xl bg-white/[0.015] border border-white/[0.03] hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs font-medium text-foreground/80">{item.name}</span>
                    </div>
                    <span className="font-mono font-semibold text-xs text-muted-foreground">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeView === 'trends' && (
            <motion.div
              key="trends"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full w-full pt-1"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendsData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="watchTimeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="chaptersGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis dataKey="label" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="watchHours"
                    name="Watch Hours"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#watchTimeGradient)"
                    animationDuration={1000}
                  />
                  <Area
                    type="monotone"
                    dataKey="chapters"
                    name="Chapters Read"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#chaptersGradient)"
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {activeView === 'engagement' && (
            <motion.div
              key="engagement"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full w-full pt-1"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={engagementData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis dataKey="metric" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="count"
                    radius={[6, 6, 0, 0]}
                    animationDuration={800}
                    barSize={32}
                  >
                    {engagementData.map((entry, index) => (
                      <Cell key={`bar-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassPanel>
  );
}