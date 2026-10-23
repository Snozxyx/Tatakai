import uiI18n from "@/lib/uiI18n";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Pause, Play, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";
import { getHighQualityImage, type SpotlightAnime } from "@/lib/api";
import { buildPreferredAnimeRouteId } from "@/lib/animeIdMapping";
import { useMotionPreference } from "@/hooks/ui/useMotionPreference";

export type CinematicSpotlight = SpotlightAnime & { chapters?: number };

function TitleArtwork({ anime }: { anime: SpotlightAnime }) {
  useUiTranslation();
  const [failed, setFailed] = useState<string[]>([]);
  const source = [anime.titleLogo, anime.logo].find(
    (url) => url && !failed.includes(url)
  );
  return (
    <h1
      className="cinematic-title ui-spotlight-copy font-display"
      title={anime.name}
    >
      {source ? (
        <img
          src={source}
          alt={anime.name}
          className="h-full max-h-20 w-full object-contain"
          onError={() => setFailed((previous) => [...previous, source])}
        />
      ) : (
        <span className="line-clamp-2 text-balance text-[28px] font-extrabold leading-tight tracking-tight">
          {anime.name}
        </span>
      )}
    </h1>
  );
}

function Poster({
  anime,
  active,
  nearby,
}: {
  anime: SpotlightAnime;
  active: boolean;
  nearby: boolean;
}) {
  useUiTranslation();
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={
        failed || !anime.poster
          ? "/placeholder.svg"
          : getHighQualityImage(anime.poster)
      }
      alt={anime.name}
      width={400}
      height={600}
      loading={active || nearby ? "eager" : "lazy"}
      fetchPriority={active ? "high" : "low"}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

export function CinematicHero({
  spotlights,
  onActiveSpotlightChange,
  mediaType = "anime",
  getDetailsPath,
  hideCatalogActions = false,
  actionLabel,
}: {
  spotlights: CinematicSpotlight[];
  onActiveSpotlightChange?: (anime: CinematicSpotlight) => void;
  mediaType?: "anime" | "manga" | "novel";
  getDetailsPath?: (anime: SpotlightAnime) => string;
  hideCatalogActions?: boolean;
  actionLabel?: string;
}) {
  useUiTranslation();
  const items = useMemo(
    () => spotlights.filter(Boolean).slice(0, 5),
    [spotlights]
  );
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [inView, setInView] = useState(true);
  const section = useRef<HTMLElement>(null);
  const reduced = useMotionPreference();
  const navigate = useNavigate();
  const active = items[index] || items[0];
  const identities = items.map((item) => item.id).join("|");

  useEffect(() => {
    if (active) onActiveSpotlightChange?.(active);
  }, [active, onActiveSpotlightChange]);

  useEffect(() => {
    if (!api) return;
    const select = () => setIndex(api.selectedScrollSnap());
    api.on("select", select);
    api.on("reInit", select);
    select();
    return () => {
      api.off("select", select);
      api.off("reInit", select);
    };
  }, [api]);

  useEffect(() => {
    setIndex(0);
    api?.scrollTo(0, true);
  }, [api, identities]);

  useEffect(() => {
    const sync = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", sync);
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry.isIntersecting)
    );
    if (section.current) observer.observe(section.current);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (
      !api ||
      items.length < 2 ||
      paused ||
      interacting ||
      focused ||
      !visible ||
      !inView ||
      reduced
    )
      return;
    const timer = window.setInterval(() => {
      const bounds = section.current?.getBoundingClientRect();
      if (!bounds || bounds.bottom <= 0 || bounds.top >= window.innerHeight)
        return;
      if (api.canScrollNext()) api.scrollNext();
      else api.scrollTo(0);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [
    api,
    items.length,
    paused,
    interacting,
    focused,
    visible,
    inView,
    reduced,
    index,
  ]);

  if (!active) return null;
  const isText = mediaType === "manga" || mediaType === "novel";
  const routeId = isText
    ? active.id
    : buildPreferredAnimeRouteId({ ...active }) || active.id;
  return (
    <section
      ref={section}
      className="cinematic-hero"
      aria-label={uiI18n.t("app.featured_i18n_value_0_9e42d616", {
        value0: mediaType,
      })}
      onPointerDown={() => setInteracting(true)}
      onPointerUp={() => setInteracting(false)}
      onPointerCancel={() => setInteracting(false)}
      onPointerLeave={() => setInteracting(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <div className="cinematic-backdrop" aria-hidden="true">
        <img
          key={`${active.id}:${active.banner}`}
          src={
            getHighQualityImage(active.banner || active.poster) ||
            "/placeholder.svg"
          }
          alt=""
          decoding="async"
          onError={(event) => {
            const img = event.currentTarget;
            if (img.dataset.fallback) {
              img.style.opacity = "0";
              return;
            }
            img.dataset.fallback = "true";
            img.src = active.poster
              ? getHighQualityImage(active.poster)
              : "/placeholder.svg";
          }}
        />
      </div>
      <div className="relative z-10">
        <div className="flex items-center justify-center gap-2 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.24em] text-white/80">
          <Star className="h-3 w-3 fill-primary text-primary" />{" "}
          {uiI18n.t("app.the_spotlight_23dc8643")}{" "}
          <span className="text-white/40">/</span>{" "}
          {String(active.rank).padStart(2, "0")}
        </div>
        <Carousel
          setApi={setApi}
          opts={{
            align: "center",
            loop: items.length > 2,
            containScroll: false,
            duration: reduced ? 0 : 25,
          }}
          aria-label={uiI18n.t("app.i18n_value_0_spotlight_posters_6686cd68", {
            value0: isText
              ? mediaType === "novel"
                ? "Novel"
                : "Manga"
              : "Anime",
          })}
          className="cinematic-carousel"
        >
          <CarouselContent className="ml-0 items-center py-5">
            {items.map((anime, i) => (
              <CarouselItem
                key={anime.id}
                className="cinematic-slide pl-0"
                aria-label={uiI18n.t(
                  "app.i18n_value_0_of_i18n_value_1_fc894332",
                  { value0: i + 1, value1: items.length }
                )}
              >
                <button
                  type="button"
                  className="cinematic-poster"
                  data-active={i === index}
                  aria-label={uiI18n.t("app.show_i18n_value_0_4eb1ad4a", {
                    value0: anime.name,
                  })}
                  aria-pressed={i === index}
                  onClick={() => api?.scrollTo(i, Boolean(reduced))}
                >
                  <Poster
                    key={`${anime.id}:${anime.poster}`}
                    anime={anime}
                    active={i === index}
                    nearby={
                      i === (index + 1) % items.length ||
                      i === (index - 1 + items.length) % items.length
                    }
                  />
                </button>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        <div className="px-5 text-center">
          <TitleArtwork
            key={`${active.id}:${active.titleLogo}:${active.logo}`}
            anime={active}
          />
          <div className="mt-2 flex min-h-6 items-center justify-center gap-2 overflow-hidden text-[11px] font-medium text-white/75">
            {active.otherInfo.slice(0, 3).map((info, i) => (
              <span
                key={i}
                className="truncate rounded-md border border-white/10 bg-white/5 px-2 py-1"
              >
                {info}
              </span>
            ))}
            {!getDetailsPath && (
              <span className="shrink-0 text-white/55">
                {isText
                  ? active.chapters
                    ? uiI18n.t("app.i18n_value_0_chapters_6744ce28", {
                        value0: active.chapters,
                      })
                    : ""
                  : uiI18n.t("app.sub_i18n_value_0_5a972a06", {
                      value0: active.episodes.sub,
                    })}
              </span>
            )}
          </div>
          <p
            key={active.id}
            className="ui-spotlight-copy mt-3 h-9 line-clamp-2 text-xs leading-[18px] text-white/60"
          >
            {active.description}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                navigate(
                  getDetailsPath
                    ? getDetailsPath(active)
                    : `/${mediaType}/${routeId}`
                )
              }
              className="ui-button flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {isText ? (
                <BookOpen className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}{" "}
              {actionLabel ||
                (isText
                  ? uiI18n.t("app.read_now_1d9d0f1e")
                  : uiI18n.t("app.watch_now_fe70cb6e"))}
            </button>
            {!hideCatalogActions && (
              <AddToPlaylistButton
                animeId={active.id}
                animeName={active.name}
                animePoster={active.poster}
                mediaType={isText ? "manga" : mediaType}
                {...(mediaType === "novel" ? { mediaFormat: "novel" } : {})}
                variant="icon"
                className="h-[52px] w-[52px] shrink-0 rounded-2xl border border-border bg-muted/60 text-foreground"
              />
            )}
          </div>
        </div>
        {items.length > 1 ? (
          <div className="cinematic-pagination flex h-16 items-center justify-center">
            {items.map((anime, i) => (
              <button
                key={anime.id}
                type="button"
                aria-label={uiI18n.t(
                  "app.go_to_spotlight_i18n_value_0_c85ff8d4",
                  { value0: i + 1 }
                )}
                aria-current={i === index ? "true" : undefined}
                onClick={() => api?.scrollTo(i, Boolean(reduced))}
                className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  className={`h-1 rounded-full transition-[width,background-color] ${
                    i === index ? "w-6 bg-white" : "w-1 bg-white/35"
                  }`}
                />
              </button>
            ))}
            {!reduced && (
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                aria-label={
                  paused
                    ? uiI18n.t("app.resume_spotlight_rotation_ea6487a4")
                    : uiI18n.t("app.pause_spotlight_rotation_95348f6f")
                }
                className="ml-1 flex h-11 w-11 items-center justify-center rounded-full text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {paused ? (
                  <Play className="h-3.5 w-3.5" />
                ) : (
                  <Pause className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="h-6" />
        )}
      </div>
    </section>
  );
}

export function CinematicHeroSkeleton() {
  useUiTranslation();
  return (
    <div
      className="cinematic-hero"
      aria-label={uiI18n.t("app.loading_spotlight_c7d73b9d")}
      aria-busy="true"
    >
      <div className="mx-auto mt-7 h-3 w-28 rounded bg-muted" />
      <div className="cinematic-skeleton-poster mx-auto my-7 rounded-2xl bg-muted animate-pulse" />
      <div className="mx-5 flex h-20 items-center justify-center">
        <div className="h-8 w-3/4 rounded bg-muted animate-pulse" />
      </div>
      <div className="mx-auto mt-2 h-6 w-40 rounded bg-muted" />
      <div className="mx-5 mt-3 h-9 rounded bg-muted" />
      <div className="mx-5 mt-5 h-[52px] rounded-2xl bg-muted" />
      <div className="h-16" />
    </div>
  );
}

/** The backdrop belongs to the page so artwork continues beneath the glass header. */
export function MobileHomeBackdrop({ anime }: { anime?: SpotlightAnime }) {
  useUiTranslation();
  if (!anime) return null;
  return (
    <div data-mobile-home-backdrop aria-hidden="true">
      <img
        key={`${anime.id}:${anime.banner}:${anime.poster}`}
        src={
          getHighQualityImage(anime.banner || anime.poster) ||
          "/placeholder.svg"
        }
        alt=""
        decoding="async"
        onError={(event) => {
          const img = event.currentTarget;
          if (img.dataset.fallback) {
            img.style.opacity = "0";
            return;
          }
          img.dataset.fallback = "true";
          img.src = anime.poster
            ? getHighQualityImage(anime.poster)
            : "/placeholder.svg";
        }}
      />
    </div>
  );
}
