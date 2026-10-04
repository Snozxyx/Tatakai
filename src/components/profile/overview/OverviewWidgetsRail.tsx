import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  CheckCircle,
  Clock,
  Eye,
  History,
  List,
  Pause,
  Play,
  XCircle,
} from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface OverviewWidgetsRailProps {
  watchlist?: any[];
  history?: any[];
  mangaReadlist?: any[];
  onNavigateTab: (tabKey: string) => void;
  isViewingOther?: boolean;
}

// Safelist color mappings to ensure Tailwind JIT compilation works correctly
const THEME_COLORS = {
  rose: {
    iconWrapper: 'bg-rose-500/10 text-rose-400',
    hoverText: 'group-hover:text-rose-400',
    hoverBg: 'group-hover:bg-rose-500/20',
    hoverBorder: 'group-hover:border-rose-500/50',
    glow: 'bg-rose-500/15',
  },
  amber: {
    iconWrapper: 'bg-amber-500/10 text-amber-400',
    hoverText: 'group-hover:text-amber-400',
    hoverBg: 'group-hover:bg-amber-500/20',
    hoverBorder: 'group-hover:border-amber-500/50',
    glow: 'bg-amber-500/15',
  },
  sky: {
    iconWrapper: 'bg-sky-500/10 text-sky-400',
    hoverText: 'group-hover:text-sky-400',
    hoverBg: 'group-hover:bg-sky-500/20',
    hoverBorder: 'group-hover:border-sky-500/50',
    glow: 'bg-sky-500/15',
  },
} as const;

type ThemeColor = keyof typeof THEME_COLORS;

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  watching: { label: 'Watching', color: 'text-sky-400', bg: 'bg-sky-400/20', icon: Eye },
  completed: { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-400/20', icon: CheckCircle },
  plan_to_watch: { label: 'Plan', color: 'text-amber-400', bg: 'bg-amber-400/20', icon: Clock },
  on_hold: { label: 'On Hold', color: 'text-orange-400', bg: 'bg-orange-400/20', icon: Pause },
  dropped: { label: 'Dropped', color: 'text-rose-400', bg: 'bg-rose-400/20', icon: XCircle },
};

const FALLBACK_STATUS = STATUS_LABELS.plan_to_watch;

function resolveWatchStatus(raw: unknown) {
  const key = String(raw ?? 'plan_to_watch').trim().toLowerCase();
  return STATUS_LABELS[key] ?? FALLBACK_STATUS;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export const OverviewWidgetsRail = memo(function OverviewWidgetsRail({
  watchlist = [],
  history = [],
  mangaReadlist = [],
  onNavigateTab,
}: OverviewWidgetsRailProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
      className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5"
    >
      {/* ── Watchlist Widget ── */}
      <Widget
        title="Watchlist"
        count={`${watchlist.length} titles`}
        icon={<List className="w-4 h-4" />}
        color="rose"
        onMore={() => onNavigateTab('watchlist')}
      >
        {watchlist.slice(0, 3).map((item) => {
          const status = resolveWatchStatus(item?.status);
          const StatusIcon = status.icon;
          return (
            <Media
              key={`wl-${item.id || item.anime_id}`}
              onClick={() => navigate(`/anime/${item.anime_id}`)}
              image={item.anime_poster}
              title={item.anime_name}
              color="rose"
              badge={
                <>
                  <StatusIcon className="w-3 h-3" />
                  {status.label}
                </>
              }
              badgeClass={cn(status.bg, status.color)}
            />
          );
        })}
      </Widget>

      {/* ── Manga & Manhwa Widget ── */}
      <Widget
        title="Manga & Manhwa"
        count={`${mangaReadlist.length} titles`}
        icon={<BookOpen className="w-4 h-4" />}
        color="amber"
        onMore={() => onNavigateTab('manga-readlist')}
      >
        {mangaReadlist.slice(0, 3).map((item) => (
          <Media
            key={`manga-${item.id || item.manga_id}`}
            onClick={() => navigate(`/manga/${item.manga_id}`)}
            image={item.manga_poster}
            title={item.manga_title}
            color="amber"
            badge={
              item.last_chapter_number != null ? (
                <>
                  <BookOpen className="w-3 h-3" />
                  Ch. {item.last_chapter_number}
                </>
              ) : undefined
            }
            badgeClass="bg-black/60 text-white border-white/10"
          />
        ))}
      </Widget>

      {/* ── Recent History Widget ── */}
      <Widget
        title="Recent History"
        count={`${history.length} watched`}
        icon={<History className="w-4 h-4" />}
        color="sky"
        onMore={() => onNavigateTab('history')}
      >
        {history.slice(0, 3).map((item) => (
          <Media
            key={`hist-${item.id}`}
            onClick={() =>
              navigate(item.episode_id ? `/watch/${encodeURIComponent(item.episode_id)}` : `/anime/${item.anime_id}`)
            }
            image={item.anime_poster}
            title={item.anime_name}
            color="sky"
            badge={
              item.episode_number != null ? (
                <>
                  <Play className="w-2.5 h-2.5" fill="currentColor" />
                  Ep. {item.episode_number}
                </>
              ) : undefined
            }
            badgeClass="bg-sky-500/80 text-white backdrop-blur-md border-none shadow-sm"
          />
        ))}
      </Widget>
    </motion.div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface WidgetProps {
  title: string;
  count: string;
  icon: React.ReactNode;
  color: ThemeColor;
  onMore: () => void;
  children: React.ReactNode;
}

function Widget({ title, count, icon, color, onMore, children }: WidgetProps) {
  const theme = THEME_COLORS[color];

  return (
    <motion.div variants={itemVariants} className="h-full">
      <GlassPanel className="relative overflow-hidden h-full p-5 flex flex-col justify-between border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl">
        {/* Decorative background glow */}
        <div className={cn('absolute -top-16 -right-16 w-40 h-40 blur-[70px] rounded-full pointer-events-none', theme.glow)} />

        {/* Header */}
        <div className="relative z-10 mb-5">
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className={cn('p-1.5 rounded-lg border border-white/[0.05]', theme.iconWrapper)}>
                {icon}
              </div>
              <h3 className="font-display font-bold text-base text-foreground tracking-tight">
                {title}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground/70 font-medium">
              {count}
            </p>
          </div>
        </div>

        {/* Media Grid & See More Card */}
        <div className="relative z-10 grid grid-cols-2 gap-3">
          {children}

          <div
            onClick={onMore}
            className="group cursor-pointer flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] transition-all duration-300 text-center min-h-[160px] outline-none focus-visible:ring-2 focus-visible:ring-white/20 hover:bg-white/[0.03] hover:border-white/[0.15]"
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onMore();
            }}
          >
            <div
              className={cn(
                'w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center text-muted-foreground transition-all duration-300 group-hover:scale-110 mb-3',
                theme.hoverBg,
                theme.hoverText
              )}
            >
              <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </div>
            <span className={cn('text-xs font-bold text-foreground transition-colors', theme.hoverText)}>
              See More
            </span>
            <span className="text-[10px] text-muted-foreground/50 mt-1">
              in {title} tab
            </span>
          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}

interface MediaProps {
  onClick: () => void;
  image?: string;
  title?: string;
  color: ThemeColor;
  badge?: React.ReactNode;
  badgeClass?: string;
}

function Media({ onClick, image, title, color, badge, badgeClass }: MediaProps) {
  const theme = THEME_COLORS[color];

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer flex flex-col relative outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-xl"
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onClick();
      }}
    >
      <div
        className={cn(
          'relative aspect-[3/4] rounded-xl overflow-hidden mb-2 border border-white/[0.04] bg-white/[0.02] transition-all duration-300 shadow-md',
          theme.hoverBorder
        )}
      >
        <img
          src={getProxiedImageUrl(image || '/placeholder.svg')}
          alt={title || ''}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {badge && (
          <div
            className={cn(
              'absolute top-1.5 left-1.5 px-2 py-0.5 flex items-center gap-1.5 rounded-md backdrop-blur-md border border-white/10 text-[9px] font-bold uppercase tracking-wider',
              badgeClass
            )}
          >
            {badge}
          </div>
        )}
      </div>
      
      <h5 className={cn('font-medium text-[11px] sm:text-xs text-foreground/90 line-clamp-2 leading-tight transition-colors duration-200', theme.hoverText)}>
        {title}
      </h5>
    </div>
  );
}