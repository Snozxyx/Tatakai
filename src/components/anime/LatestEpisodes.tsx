import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { memo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Play, Zap } from "lucide-react";

import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { AnimeCard, getHighQualityPoster } from "@/lib/api";
import { fetchAniZipMapping } from "@/lib/mapping/anizip";
import { Peekable } from "@/components/media/MediaQuickPeek";
import { peekFromAnime } from "@/components/media/quickPeekStore";

interface LatestEpisodesProps {
  animes: AnimeCard[];
}

function resolveCardAnilistId(anime: AnimeCard): number | null {
  if (anime.anilistId && Number.isFinite(anime.anilistId) && anime.anilistId > 0) {
    return anime.anilistId;
  }
  const raw = String(anime.id || "").trim();
  const prefixed = raw.match(/^anilist[:_-]?(\d+)$/i);
  if (prefixed?.[1]) return Number(prefixed[1]);
  if (/^\d+$/.test(raw)) return Number(raw);
  return null;
}

function LatestEpisodeCard({ anime }: { anime: AnimeCard }) {
  useUiTranslation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const anilistId = resolveCardAnilistId(anime);

  // Latest aired episode (title + screencap) — cached 10min, so the 10-card
  // rail costs at most 10 cached mapping reads on first paint.
  const { data: latest } = useQuery({
    queryKey: ["anizip-latest", anilistId ?? anime.id],
    queryFn: async () => {
      if (!anilistId) return null;
      try {
        const mapping = await fetchAniZipMapping(anilistId);
        return mapping?.lastAiredEpisode ?? null;
      } catch {
        return null;
      }
    },
    enabled: anilistId != null,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });

  const poster = getHighQualityPoster(anime.poster, anime.anilistId);
  const thumb = latest?.image || poster || "/placeholder.svg";
  const epNumber = latest?.number ?? anime.episodes.sub ?? null;
  const epTitle = latest?.title ?? null;

  // Open that exact episode in the watch page. The episode identity is
  // `<baseId>?ep=<n>` (see buildEpisodeId / WatchPage decodedEpisodeId).
  const watchHref =
    epNumber != null
      ? `/watch/${encodeURIComponent(`${anime.id}?ep=${epNumber}`)}`
      : `/anime/${anime.id}`;

  return (
    <Peekable media={peekFromAnime(anime, `/anime/${anime.id}`)}>
      <article
        onClick={() => navigate(watchHref)}
        data-mobile-poster-card
        className="group relative w-[240px] shrink-0 cursor-pointer snap-start overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] transition-all duration-300 hover:border-primary/40 hover:bg-white/[0.04] active:scale-[0.98] md:w-[280px]"
        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 220px" }}
      >
        {/* Episode thumbnail — 16:9 screencap when ani.zip has one, else poster */}
        <div className="relative aspect-video w-full overflow-hidden bg-white/[0.04]">
          <img
            src={thumb}
            alt={epTitle ? uiI18n.t('app.episode_i18n_value_0_i18n_value_1_ea088a33', { value0: epNumber, value1: epTitle }) : anime.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.dataset.fallback === "1") return;
              img.dataset.fallback = "1";
              img.src = "/placeholder.svg";
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          {epNumber != null && (
            <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-sm">
              {t('migration.episodeShort')} {epNumber}
            </span>
          )}

          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </span>
          </span>

          {epTitle && (
            <p className="absolute inset-x-2 bottom-2 line-clamp-1 text-[11px] font-semibold text-white/90 drop-shadow-md">
              {epTitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5 p-3">
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="h-10 w-8 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0 flex-1">
            <h4
              data-mobile-poster-title
              className="line-clamp-1 text-[13px] font-bold leading-tight text-white/90 transition-colors group-hover:text-primary"
            >
              {anime.name}
            </h4>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/50">
              {epNumber != null && (
                <span className="font-semibold text-white/70">{t('anime.episode')} {epNumber}</span>
              )}
              {anime.type && <span className="truncate">• {anime.type}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">
                {t('anime.sub')} <span className="tabular-nums text-white/40">{anime.episodes.sub}</span>
              </span>
              {anime.episodes.dub > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {t('anime.dub')} <span className="tabular-nums text-primary/60">{anime.episodes.dub}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    </Peekable>
  );
}

export const LatestEpisodes = memo(function LatestEpisodes({ animes }: LatestEpisodesProps) {
  useUiTranslation();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 320;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (!animes || animes.length === 0) return null;

  return (
    <section className="mb-10 md:mb-12 space-y-4 md:space-y-5" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 260px' }}>
      <HomeSectionHeading
        icon={<Zap className="w-5 h-5 text-amber" />}
        title={t('discover.latestEpisodes')}
        action={
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => scroll("left")}
              aria-label={t('discover.scrollLeft')}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => scroll("right")}
              aria-label={t('discover.scrollRight')}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* Snap container for smooth, tactile scrolling */}
      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-proximity scroll-smooth scrollbar-hide [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] -mx-1 px-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {animes.slice(0, 10).map((anime) => (
          <LatestEpisodeCard key={anime.id} anime={anime} />
        ))}
      </div>
    </section>
  );
})