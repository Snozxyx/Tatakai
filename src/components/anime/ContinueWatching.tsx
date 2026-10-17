import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clock, History, Play } from 'lucide-react';

import {
  useContinueWatching,
  migrateGuestProgressToAccount,
} from '@/hooks/user/useWatchHistory';
import { useAuth } from '@/contexts/AuthContext';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { getProxiedImageUrl } from '@/lib/api';
import { fetchAniZipMapping } from '@/lib/mapping/anizip';
import { HomeSectionHeading } from '@/components/home/HomeSectionHeading';
import { Peekable } from '@/components/media/MediaQuickPeek';
import { peekFromAnime } from '@/components/media/quickPeekStore';
import i18n from '@/lib/i18n';

function formatTimeLeft(remainingSeconds: number) {
  if (remainingSeconds <= 0) return i18n.t('discover.almostFinished');

  const minutes = Math.ceil(remainingSeconds / 60);

  if (minutes < 60) return i18n.t('discover.minutesLeft', { count: minutes });

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return i18n.t('discover.hoursLeft', { hours, minutes: remainingMinutes });
}

function resolveAnilistId(animeId: string, rawAnilist?: number | null): number | null {
  if (rawAnilist && Number.isFinite(rawAnilist) && rawAnilist > 0) return Number(rawAnilist);
  const raw = String(animeId || '').trim();
  const prefixed = raw.match(/^anilist[:_-]?(\d+)$/i);
  if (prefixed?.[1]) return Number(prefixed[1]);
  if (/^\d+$/.test(raw)) return Number(raw);
  return null;
}

type ContinueItem = NonNullable<ReturnType<typeof useContinueWatching>['data']>[number];

const ContinueCard = memo(function ContinueCard({ item }: { item: ContinueItem }) {
  useUiTranslation();
  const { t } = useTranslation();
  const progressSeconds = Math.max(0, Number(item.progress_seconds) || 0);
  const durationSeconds = Math.max(0, Number(item.duration_seconds) || 0);
  const percent =
    durationSeconds > 0
      ? Math.min(100, Math.round((progressSeconds / durationSeconds) * 100))
      : null;
  const timeLeft =
    durationSeconds > 0 ? formatTimeLeft(durationSeconds - progressSeconds) : null;

  const rawAnilist = (item as unknown as { anilist_id?: number | null }).anilist_id;
  const anilistId = resolveAnilistId(item.anime_id, rawAnilist);

  // Episode screencap + title for the exact episode being resumed — cached 10min.
  const { data: episodeDetail } = useQuery({
    queryKey: ['continue-episode-detail', anilistId ?? item.anime_id, item.episode_number],
    queryFn: async () => {
      if (!anilistId) return null;
      try {
        const mapping = await fetchAniZipMapping(anilistId);
        return mapping?.byNumber.get(item.episode_number) ?? null;
      } catch {
        return null;
      }
    },
    enabled: anilistId != null,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });

  const poster = item.anime_poster ? getProxiedImageUrl(item.anime_poster) : '/placeholder.svg';
  const thumb = episodeDetail?.image ? getProxiedImageUrl(episodeDetail.image) : poster;
  const epTitle = episodeDetail?.title ?? null;

  return (
    <Peekable
      key={item.id}
      media={peekFromAnime(
        { id: item.anime_id, name: item.anime_name, poster: item.anime_poster },
        `/anime/${item.anime_id}`,
      )}
    >
      <Link
        to={`/watch/${encodeURIComponent(item.episode_id)}?t=${Math.floor(progressSeconds)}`}
        aria-label={percent !== null ? t('discover.resumeLabelWithPercent', { name: item.anime_name, episode: item.episode_number, percent }) : t('discover.resumeLabel', { name: item.anime_name, episode: item.episode_number })}
        data-mobile-poster-card
        className="group flex w-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] transition-all duration-300 hover:border-primary/40 hover:bg-white/[0.04] hover:shadow-[0_0_28px_-10px_hsl(var(--primary)/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99]"
      >
        {/* Landscape episode thumbnail — the actual screencap when resolved */}
        <div className="relative aspect-video w-full overflow-hidden bg-white/[0.04]">
          <img
            src={thumb}
            alt={epTitle ? t('migration.episodeTitle', { number: item.episode_number, title: epTitle }) : t('migration.animeEpisode', { name: item.anime_name, number: item.episode_number })}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.dataset.fallback === '1') return;
              img.dataset.fallback = '1';
              img.src = '/placeholder.svg';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
            {t('migration.episodeShort')} {item.episode_number}
          </span>
          {timeLeft && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white/85 backdrop-blur-sm">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {timeLeft}
            </span>
          )}

          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
              <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" />
            </span>
          </span>

          {epTitle && (
            <p className="absolute inset-x-2 bottom-6 line-clamp-1 text-[11px] font-semibold text-white/90 drop-shadow-md">
              {epTitle}
            </p>
          )}

          {/* Progress bar docked to the thumbnail bottom edge */}
          {percent !== null && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15" aria-hidden="true">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>

        {/* Series + resume line */}
        <div className="flex items-center gap-2.5 p-3">
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="h-10 w-8 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 text-[13px] font-bold leading-tight text-white/90 transition-colors group-hover:text-primary">
              {item.anime_name}
            </h3>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-white/50">
              <span className="truncate">
                {t('anime.episode')} {item.episode_number}
                {epTitle ? uiI18n.t('app.i18n_value_0_723b674d', { value0: epTitle }) : ''}
              </span>
              {percent !== null && (
                <span className="shrink-0 tabular-nums font-bold text-white/60">{percent}%</span>
              )}
            </div>
            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
              {t('discover.resume')}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </div>

        {/* Fallback progress row when duration is unknown (keeps % visible) */}
        {percent === null && (
          <div className="px-3 pb-3" aria-hidden="true">
            <ProgressBar progress={0} className="h-1.5 rounded-full opacity-0" />
          </div>
        )}
      </Link>
    </Peekable>
  );
});

export function ContinueWatching() {
  useUiTranslation();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: items, isLoading } = useContinueWatching();

  useEffect(() => {
    if (user?.id) void migrateGuestProgressToAccount(user.id);
  }, [user?.id]);

  if (!user || isLoading || !items?.length) return null;

  return (
    <section className="mb-12" aria-labelledby="continue-watching-heading">
      <HomeSectionHeading
        icon={<Clock className="w-5 h-5 text-primary" />}
        title={<span id="continue-watching-heading">{t('discover.continueWatching')}</span>}
        subtitle={items.length === 1 ? t('migration.serieInProgress', { count: 1 }) : t('migration.seriesInProgress', { count: items.length })}
        action={
          <div className="flex items-center gap-3 shrink-0">
            <p className="hidden text-xs text-muted-foreground sm:block">
              {t('discover.pickUpWhereLeftOff')}
            </p>
            <Link
              to="/profile?tab=history"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={t('discover.viewFullHistory')}
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              {t('nav.history')}
            </Link>
          </div>
        }
      />

      <div data-mobile-home-rail="resume" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.slice(0, 4).map((item) => (
          <ContinueCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
