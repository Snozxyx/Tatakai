import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Check,
  Flame,
  Gem,
  Shuffle,
  Sparkles,
  Star,
  Target,
} from "lucide-react";
import { getNovelDetail, searchNovels } from "@/core/content/novel-client";
import { useNovelHome } from "@/hooks/api/useNovelData";
import { useNovelReadlist } from "@/hooks/user/useNovelReadlist";
import { useTasteProfile } from "@/hooks/user/useTasteProfile";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { inferMangaAdultFlag } from "@/lib/contentSafety";
import { getProxiedImageUrl } from "@/lib/api";
import { formatSmartStatus, smartHint, smartReasons, translateGenre } from "@/lib/smartDiscoverI18n";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { AdultBadge } from "@/components/MediaCardBadges";
import { Peekable } from "@/components/media/MediaQuickPeek";
import { peekFromNovel } from "@/components/media/quickPeekStore";
import type { NovelSearchItem } from "@/types/novel";
import { cn } from "@/lib/utils";

type VariantId = "best" | "gem" | "trending";
type StatusFilter = "all" | "ongoing" | "completed";

const VARIANTS: Array<{ id: VariantId; label: string; hint: string; icon: typeof Target }> = [
  { id: "best", get label() { return uiI18n.t('app.best_for_you_1d81530a'); }, get hint() { return smartHint('best'); }, icon: Target },
  { id: "gem", get label() { return uiI18n.t('app.hidden_gem_ce12647f'); }, get hint() { return smartHint('gem'); }, icon: Gem },
  { id: "trending", get label() { return uiI18n.t('app.trending_now_18292796'); }, get hint() { return smartHint('trending'); }, icon: Flame },
];

function formatStatus(status?: string | null) {
  return formatSmartStatus(status);
}

function matchesStatus(item: NovelSearchItem, status: StatusFilter) {
  if (status === "all") return true;
  const s = String(item.status || "").toUpperCase();
  if (status === "ongoing") return s.includes("RELEAS") || s.includes("PUBLISH");
  return s.includes("FINISH") || s.includes("COMPLET");
}

function stripHtml(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(item: NovelSearchItem) {
  return (
    item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native || "Untitled"
  );
}

function routeIdOf(item: NovelSearchItem) {
  const raw = item.anilistId || item.malId || item.id;
  return String(raw || "");
}

/** Filter the shelf: adult gate, publication status, and titles already on the shelf. */
function useRankedPicks(
  results: NovelSearchItem[],
  variant: VariantId,
  status: StatusFilter,
  canShowAdult: boolean,
  readlistIds: Set<string>,
) {
  useUiTranslation();
  return useMemo(() => {
    const eligible = results.filter((item) => {
      if (!item || !routeIdOf(item)) return false;
      if (!canShowAdult && inferMangaAdultFlag(item as any)) return false;
      return matchesStatus(item, status);
    });
    if (eligible.length === 0) return [];

    const unseen = eligible.filter((item) => {
      const keys = [
        String(item.anilistId ?? ""),
        item.anilistId ? `anilist:${item.anilistId}` : "",
        String(item.malId ?? ""),
        item.malId ? `mal:${item.malId}` : "",
        String(item.id || ""),
      ].filter(Boolean);
      return !keys.some((k) => readlistIds.has(k));
    });
    // Never strand the lane: fall back to already-shelved titles when the
    // exclusion would leave fewer than three picks.
    const pool = unseen.length >= 3 ? unseen : eligible;

    const maxPop = Math.max(1, ...pool.map((i) => Number(i.popularity) || 0));
    const scoreOf = (item: NovelSearchItem) => {
      const scoreNorm = typeof item.score === "number" ? Math.max(0, Math.min(1, item.score / 100)) : 0;
      const popNorm = Math.log10(1 + (Number(item.popularity) || 0)) / Math.log10(1 + maxPop);
      return { scoreNorm, popNorm };
    };

    const ranked = [...pool];
    if (variant === "gem") {
      ranked.sort((a, b) => {
        const sa = scoreOf(a);
        const sb = scoreOf(b);
        // High score, low readership — the under-the-radar wins.
        return sb.scoreNorm - sb.popNorm - (sa.scoreNorm - sa.popNorm);
      });
    } else if (variant === "best") {
      ranked.sort((a, b) => {
        const sa = scoreOf(a);
        const sb = scoreOf(b);
        return sb.scoreNorm + sb.popNorm * 0.5 - (sa.scoreNorm + sa.popNorm * 0.5);
      });
    }
    // 'trending' keeps the backend TRENDING_DESC order.
    return ranked;
  }, [results, variant, status, canShowAdult, readlistIds]);
}

export const NovelSmartDiscover = memo(function NovelSmartDiscover() {
  useUiTranslation();
  const navigate = useNavigate();
  const { settings } = useContentSafetySettings();
  const canShowAdult = settings.showAdultEverywhere;
  const { data: home } = useNovelHome();
  const { data: taste } = useTasteProfile();
  const { data: readlist } = useNovelReadlist();

  const genres = useMemo(() => (Array.isArray((home as any)?.genres) ? (home as any).genres : []), [home]);
  const topTasteGenre = taste?.topGenres?.[0]?.genre || null;

  const [variant, setVariant] = useState<VariantId>("best");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [genre, setGenre] = useState<string>("all");
  const [pickIndex, setPickIndex] = useState(0);
  const genreTouched = useRef(false);

  // Default the genre filter to the user's top taste genre once it arrives —
  // unless they already picked one themselves.
  useEffect(() => {
    if (!genreTouched.current && topTasteGenre && genres.includes(topTasteGenre)) {
      setGenre(topTasteGenre);
    }
  }, [topTasteGenre, genres]);

  // Reset the pick whenever the lane's inputs change.
  useEffect(() => {
    setPickIndex(0);
  }, [variant, status, genre]);

  const { readlistIds } = useMemo(() => {
    const ids = new Set<string>();
    for (const row of readlist || []) {
      if (row.manga_id) ids.add(String(row.manga_id));
      if (row.mal_id) {
        ids.add(String(row.mal_id));
        ids.add(`mal:${row.mal_id}`);
      }
      if (row.anilist_id) {
        ids.add(String(row.anilist_id));
        ids.add(`anilist:${row.anilist_id}`);
      }
    }
    return { readlistIds: ids };
  }, [readlist]);

  const { data: results = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["novel-smart-discover", genre, variant, canShowAdult],
    queryFn: async () => {
      const res = await searchNovels("", 1, 24, {
        genre: genre !== "all" ? genre : undefined,
        sort: variant === "trending" ? "TRENDING_DESC" : variant === "gem" ? "SCORE_DESC" : "POPULARITY_DESC",
        adult: canShowAdult,
      });
      return res.results ?? [];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const ranked = useRankedPicks(results, variant, status, canShowAdult, readlistIds);
  const shortlist = useMemo(() => ranked.slice(0, 6), [ranked]);
  const active = shortlist.length > 0 ? shortlist[pickIndex % shortlist.length] : null;

  const activeRouteId = active ? routeIdOf(active) : null;
  const { data: detail, isLoading: detailLoading, isError: detailError } = useQuery({
    queryKey: ["novel-smart-discover-detail", activeRouteId],
    queryFn: () => getNovelDetail(String(activeRouteId)),
    enabled: !!activeRouteId,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const synopsis = stripHtml((detail as any)?.detail?.synopsis);

  const reasons = useMemo(() => {
    if (!active) return [];
    return smartReasons({
      genre,
      topTasteGenre,
      mediaType: null,
      score: active.score,
      popularity: active.popularity,
      status: active.status,
      chapters: active.chapters,
      variant,
    });
  }, [active, genre, topTasteGenre, variant]);

  const activeTitle = active ? titleOf(active) : "";
  const activePoster = active?.poster ? getProxiedImageUrl(active.poster) : "/placeholder.svg";
  const activeScore =
    active && typeof active.score === "number" && Number.isFinite(active.score)
      ? (active.score / 10).toFixed(1)
      : null;

  const shuffle = () => {
    if (shortlist.length <= 1) return;
    let next = Math.floor(Math.random() * shortlist.length);
    if (next === pickIndex % shortlist.length) next = (next + 1) % shortlist.length;
    setPickIndex(next);
  };

  return (
    <section className="mb-14" aria-label={uiI18n.t('app.smart_discover_dc7839a7')}>
      <HomeSectionHeading
        icon={<Sparkles className="h-5 w-5 text-amber-400" />}
        title={uiI18n.t('app.smart_discover_fc72f560')}
        subtitle={
          topTasteGenre ? uiI18n.t('app.tuned_to_your_taste_for_i18n_value_0_0f52f935', { value0: topTasteGenre }) : uiI18n.t('app.picks_tuned_to_your_shelf_596db53b')
        }
        action={
          <button
            onClick={shuffle}
            disabled={shortlist.length < 2 || isLoading}
            className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground transition-[color,background-color,border-color,opacity,transform]  hover:bg-muted motion-safe:active:scale-[0.98]"
          >
            <Shuffle className="h-3.5 w-3.5 text-primary" />
            <span>{uiI18n.t('app.surprise_me_92898d55')}</span>
          </button>
        }
      />

      {/* Variant tabs */}
      <div className="mb-1.5 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            aria-pressed={variant === v.id}
            onClick={() => setVariant(v.id)}
            title={v.hint}
            className={cn(
              "group flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-bold transition-[color,background-color,border-color,opacity,transform] duration-150 motion-safe:active:scale-[0.98]",
              variant === v.id
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground",
            )}
          >
            <v.icon
              className={cn(
                "h-4 w-4 transition-transform duration-150 ",
                variant === v.id ? "text-primary" : "text-muted-foreground",
              )}
            />
            {v.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-[11px] font-medium text-muted-foreground">
        {VARIANTS.find((v) => v.id === variant)?.hint}
      </p>

      {/* Filters: status + genres */}
      <div className="mb-5 rounded-2xl border border-border bg-muted/30 p-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
        <ThemedSelect
          aria-label={uiI18n.t('app.publication_status_084ea620')}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="h-10 cursor-pointer rounded-full border border-border bg-card px-3 text-xs font-bold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors hover:border-primary/30 hover:text-foreground focus:border-primary/60"
        >
          <option value="all">{uiI18n.t('app.any_status_55201ac9')}</option>
          <option value="ongoing">{uiI18n.t('app.ongoing_2e0254c2')}</option>
          <option value="completed">{uiI18n.t('app.completed_1798b3ba')}</option>
        </ThemedSelect>

        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5" style={{ scrollbarWidth: "none" }}>
          <button
            aria-pressed={genre === "all"}
            onClick={() => {
              genreTouched.current = true;
              setGenre("all");
            }}
            className={cn(
              "min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-[color,background-color,border-color,opacity,transform] motion-safe:active:scale-[0.98]",
              genre === "all"
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            {uiI18n.t('app.all_genres_09ac5f61')}
          </button>
          {genres.map((g: string) => (
            <button
              key={g}
              aria-pressed={genre === g}
              onClick={() => {
                genreTouched.current = true;
                setGenre(g);
              }}
              className={cn(
                "min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-[color,background-color,border-color,opacity,transform] motion-safe:active:scale-[0.98]",
                genre === g
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              {translateGenre(g)}
              {g === topTasteGenre && <span className="ml-1 text-primary">★</span>}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Pick panel */}
      <div className="group/panel relative overflow-hidden rounded-[2rem] border border-border bg-black shadow-sm">
        {/* Hairline top accent */}
        <div className="absolute inset-x-16 top-0 z-20 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" aria-hidden />
        <div className="absolute inset-0 z-0">
          <img
            key={activeRouteId || "empty"}
            src={activePoster}
            alt=""
            aria-hidden
            className="h-full w-full scale-110 object-cover blur-2xl brightness-[0.35] contrast-125 saturate-150"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/85 to-black/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/60" />
          <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_20%_100%,hsl(var(--primary)/0.22),transparent_65%)]" />
        </div>

        <div className="relative z-10 flex min-h-[720px] flex-col items-center gap-7 bg-black/20 md:min-h-[440px] p-5 backdrop-blur-xl sm:p-8 md:flex-row md:gap-10 lg:p-10">
          {isLoading && !active ? (
            <>
              <div className="aspect-[2/3] w-36 flex-shrink-0 animate-pulse rounded-2xl bg-white/10 sm:w-44 md:w-48" />
              <div className="flex-1 space-y-3">
                <div className="h-8 w-2/3 animate-pulse rounded-lg bg-white/10" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-white/5" />
                <div className="h-16 w-full animate-pulse rounded-xl bg-white/5" />
              </div>
            </>
          ) : active ? (
            <>
              <div className="relative flex-shrink-0">
                {/* Glow cast from the poster */}
                <div
                  aria-hidden
                  className="hidden"
                />
                <Peekable
                  media={peekFromNovel(
                    {
                      id: activeRouteId || "",
                      name: activeTitle,
                      poster: active.poster,
                      anilistId: typeof active.anilistId === "number" ? active.anilistId : null,
                    },
                    `/novel/${encodeURIComponent(activeRouteId || "")}`,
                  )}
                >
                  <button
                    onClick={() => navigate(`/novel/${encodeURIComponent(activeRouteId || "")}`)}
                    className="group relative block w-40 cursor-pointer overflow-hidden rounded-3xl ring-1 ring-white/20 shadow-md transition-[color,background-color,border-color,opacity,transform] duration-150 hover:ring-primary/50  active:scale-[0.98] sm:w-52 lg:w-60"
                    aria-label={activeTitle}
                  >
                    <span className="block aspect-[2/3]">
                      <img
                        src={activePoster}
                        alt={activeTitle}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.025]"
                      />
                    </span>
                    {inferMangaAdultFlag(active as any) && <AdultBadge className="absolute right-2.5 top-2.5" />}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                    <span className="absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center gap-1.5 pb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white opacity-0 transition-[color,background-color,border-color,opacity,transform] duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                      <BookOpen className="h-3.5 w-3.5" />
                      {uiI18n.t('app.open_cf9b7706')}
                    </span>
                  </button>
                </Peekable>
              </div>

              <div className="min-w-0 flex-1 text-center md:text-left">
                <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
                  <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-amber-300">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    {VARIANTS.find((v) => v.id === variant)?.label}
                  </p>
                  {shortlist.length > 1 && (
                    <div className="flex items-center gap-1.5" role="tablist" aria-label={uiI18n.t('app.picks_f5f61efb')}>
                      {shortlist.map((_, i) => (
                        <button
                          key={i}
                          role="tab"
                          aria-selected={i === pickIndex % shortlist.length}
                          aria-label={uiI18n.t('app.pick_i18n_value_0_67eead12', { value0: i + 1 })}
                          onClick={() => setPickIndex(i)}
                          className={cn(
                            "h-1.5 rounded-full transition-[color,background-color,border-color,opacity,transform] duration-150",
                            i === pickIndex % shortlist.length
                              ? "w-6 bg-primary"
                              : "w-1.5 bg-white/25 hover:bg-white/50",
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <h3 key={activeRouteId} className="ui-state-fade mt-2.5 line-clamp-2 font-display text-3xl font-black leading-[1.05] tracking-tight text-white drop-shadow-lg md:text-4xl">
                  {activeTitle}
                </h3>

                {reasons.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
                      {uiI18n.t('app.why_this_pick_4f9784d2')}
                    </p>
                    <ul className="mt-2 flex flex-wrap justify-center gap-1.5 md:justify-start">
                      {reasons.map((reason) => (
                        <li
                          key={reason}
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[11px] font-semibold text-white/85 shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-white"
                        >
                          <Check className="h-3 w-3 shrink-0 text-primary" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mx-auto mt-4 min-h-[5.25rem] max-w-2xl md:mx-0">
                  {detailLoading ? (
                    <div className="space-y-2">
                      <div className="h-3.5 w-full animate-pulse rounded-md bg-white/10" />
                      <div className="h-3.5 w-5/6 animate-pulse rounded-md bg-white/5" />
                      <div className="h-3.5 w-2/3 animate-pulse rounded-md bg-white/5" />
                    </div>
                  ) : synopsis ? (
                    <p className="line-clamp-4 text-[13px] leading-relaxed text-white/75 md:text-sm">
                      {synopsis}
                    </p>
                  ) : <p className="text-sm leading-relaxed text-white/65">{detailError ? uiI18n.t('app.synopsis_couldn_t_load_open_the_title_for_more_d_b50a327e') : uiI18n.t('app.no_synopsis_available_for_this_pick_10b80ade')}</p>}
                </div>

                <div className="mx-auto mt-4 grid max-w-md grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md md:mx-0">
                  <div className="flex flex-col items-center gap-0.5 px-2 py-3">
                    <span className="inline-flex items-center gap-1 text-base font-black text-white">
                      <Star className="h-3.5 w-3.5 fill-amber text-amber" />
                      {activeScore ?? "—"}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">{uiI18n.t('app.score_489f4877')}</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 px-2 py-3">
                    <span className="text-base font-black tabular-nums text-white">
                      {typeof active.chapters === "number" && active.chapters > 0 ? active.chapters : "—"}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">{uiI18n.t('app.chapters_034e2733')}</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 px-2 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-white">
                      {(() => { const st = formatStatus(active.status); return st === "Ongoing" || st === "En curso"; })() && (
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      )}
                      {formatStatus(active.status) ?? uiI18n.t('app.novel_1a9fdb91')}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">{uiI18n.t('app.status_bae7d5be')}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-5 md:justify-start">
                  <button
                    onClick={() => navigate(`/novel/${encodeURIComponent(activeRouteId || "")}`)}
                    className="group flex items-center gap-2 rounded-full bg-gradient-to-b from-primary to-primary px-7 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-[color,background-color,border-color,opacity,transform] hover:bg-primary/90 motion-safe:active:scale-[0.98]"
                  >
                    <BookOpen className="h-4 w-4 transition-transform " />
                    {uiI18n.t('app.start_reading_ec8c2d85')}
                  </button>
                  <button
                    disabled={shortlist.length < 2}
                    onClick={() => setPickIndex((i) => i + 1)}
                    className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-bold text-white backdrop-blur-md transition-[color,background-color,border-color,opacity,transform] hover:border-white/30 hover:bg-white/[0.12] motion-safe:active:scale-[0.98]"
                  >
                    <Shuffle className="h-4 w-4 text-white/80" />
                    {uiI18n.t('app.next_pick_52abeb5d')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="mx-auto py-8 text-center">
              <p className="text-sm text-white/70">{isError ? uiI18n.t('app.picks_couldn_t_load_please_try_again_0d653c76') : uiI18n.t('app.no_picks_match_those_filters_try_another_genre_o_f1df178a')}</p>
              <button
                onClick={() => {
                  if (isError) { void refetch(); return; }
                  genreTouched.current = false;
                  setGenre(topTasteGenre && genres.includes(topTasteGenre) ? topTasteGenre : "all");
                  setStatus("all");
                }}
                className="mt-3 rounded-full border border-white/15 bg-white/10 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20"
              >
                {isError ? uiI18n.t('app.retry_picks_686c0217') : uiI18n.t('app.reset_filters_56553100')}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
});
