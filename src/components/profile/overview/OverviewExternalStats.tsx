import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { memo } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Clock, Play, BookOpen, Star, Tv } from 'lucide-react';
import { AnimatedCounter } from './AnimatedCounter';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { cn } from '@/lib/utils';
import type { ExternalStats } from '@/lib/externalIntegrations';

interface OverviewExternalStatsProps {
  stats: ExternalStats[];
  isLoading?: boolean;
}

const PROVIDER_META: Record<
  ExternalStats['provider'],
  { label: string; accent: string; dot: string }
> = {
  anilist: { get label() { return uiI18n.t('app.anilist_c03a6787'); }, accent: 'text-[#02A9FF]', dot: 'bg-[#02A9FF]' },
  mal: { get label() { return uiI18n.t('app.myanimelist_be786904'); }, accent: 'text-[#2E51A2]', dot: 'bg-[#2E51A2]' },
};

function ProviderCard({ data }: { data: ExternalStats }) {
  useUiTranslation();
  const meta = PROVIDER_META[data.provider];

  const tiles = [
    { key: 'count', get label() { return uiI18n.t('app.anime_f1b32a19'); }, value: data.anime.count, suffix: 'titles', icon: Tv },
    { key: 'eps', get label() { return uiI18n.t('app.episodes_49d641ba'); }, value: data.anime.episodesWatched, suffix: 'eps', icon: Play },
    { key: 'days', get label() { return uiI18n.t('app.days_watched_b2b2b763'); }, value: data.anime.daysWatched, suffix: 'd', decimals: 1, icon: Clock },
    { key: 'score', get label() { return uiI18n.t('app.mean_score_4729b833'); }, value: data.anime.meanScore, suffix: '', decimals: data.anime.meanScore % 1 ? 2 : 0, icon: Star },
  ];

  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', meta.dot)} aria-hidden="true" />
          <span className={cn('text-sm font-bold tracking-tight', meta.accent)}>{meta.label}</span>
          {data.username && (
            <span className="text-xs text-muted-foreground/60">@{data.username}</span>
          )}
        </div>
        {data.profileUrl && (
          <a
            href={data.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
            aria-label={uiI18n.t('app.open_i18n_value_0_profile_0c33b11f', { value0: meta.label })}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Anime tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((t, idx) => {
          const Icon = t.icon;
          return (
            <motion.div
              key={t.key}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: idx * 0.03 }}
              className="flex flex-col gap-1.5 rounded-lg bg-black/20 border border-white/[0.03] p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 truncate">
                  {t.label}
                </span>
                <Icon className="w-3.5 h-3.5 text-muted-foreground/40" aria-hidden="true" />
              </div>
              <span className="font-display text-lg font-bold tabular-nums text-foreground">
                <AnimatedCounter value={t.value} decimals={t.decimals || 0} />
                {t.suffix && <span className="text-[10px] font-medium text-muted-foreground/50 ml-1">{t.suffix}</span>}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Status breakdown */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground/70">
        {data.anime.watching ? <span>{data.anime.watching} {uiI18n.t('app.watching_874e70e6')}</span> : null}
        {data.anime.completed ? <span>{data.anime.completed} {uiI18n.t('app.completed_231e564d')}</span> : null}
        {data.anime.planning ? <span>{data.anime.planning} {uiI18n.t('app.planned_80e61027')}</span> : null}
        {data.anime.paused ? <span>{data.anime.paused} {uiI18n.t('app.on_hold_062be345')}</span> : null}
        {data.anime.dropped ? <span>{data.anime.dropped} {uiI18n.t('app.dropped_ad3f9aa5')}</span> : null}
      </div>

      {/* Manga (AniList only) */}
      {data.manga && (
        <div className="mt-3 flex items-center gap-4 rounded-lg bg-black/20 border border-white/[0.03] p-3">
          <BookOpen className="w-4 h-4 text-muted-foreground/50" aria-hidden="true" />
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-foreground/80">
            <span className="font-semibold">{data.manga.count}</span>
            <span className="text-muted-foreground/60">{uiI18n.t('app.manga_f8dd8a9e')} {data.manga.chaptersRead} {uiI18n.t('app.chapters_1fb03542')}</span>
            {data.manga.meanScore ? (
              <span className="text-muted-foreground/60">{uiI18n.t('app.score_75ebcb36')} {data.manga.meanScore}</span>
            ) : null}
          </div>
        </div>
      )}

      {/* Top genres */}
      {data.topGenres && data.topGenres.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.topGenres.map((g) => (
            <span
              key={g.genre}
              className="px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.04] text-[10px] text-muted-foreground/70"
            >
              {g.genre} · {g.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const OverviewExternalStats = memo(function OverviewExternalStats({
  stats,
  isLoading = false,
}: OverviewExternalStatsProps) {
  useUiTranslation();
  // Nothing connected and nothing loading — render nothing.
  if (!isLoading && stats.length === 0) return null;

  return (
    <GlassPanel
      className="relative overflow-hidden p-5 sm:p-7 border-white/[0.04] bg-background/40 backdrop-blur-2xl rounded-2xl"
      role="region"
      aria-label={uiI18n.t('app.linked_tracker_statistics_c5cc086b')}
    >
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#02A9FF]/10 blur-[70px] rounded-full pointer-events-none" />

      <div className="relative z-10 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <ExternalLink className="w-4 h-4 text-primary/80" />
          <h3 className="font-display font-bold text-base sm:text-lg text-foreground tracking-tight">
            {uiI18n.t('app.tracker_statistics_12166c40')}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground/70">
          {uiI18n.t('app.live_stats_pulled_from_your_linked_anilist_and_m_54171e56')}
        </p>
      </div>

      <div className="relative z-10 space-y-4">
        {isLoading && stats.length === 0 ? (
          <div className="h-28 rounded-xl bg-white/[0.02] border border-white/[0.03] animate-pulse" />
        ) : (
          stats.map((s) => <ProviderCard key={s.provider} data={s} />)
        )}
      </div>
    </GlassPanel>
  );
});
