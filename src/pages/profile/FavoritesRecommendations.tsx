import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useGenrePreferences,
  usePersonalizedRecommendations,
} from "@/hooks/api/useRecommendations";
import {
  useMLRecommendations,
  useTasteProfile,
} from "@/hooks/api/useMLRecommendations";
import { useSmartFavorites } from "@/hooks/user/useSmartFavorites";
import { useAddToWatchlist, useWatchlist } from "@/hooks/user/useWatchlist";
import { fetchAniListDiscover } from "@/lib/externalIntegrations";
import {
  buildExternalAnimeRouteId,
  parseExternalAnimeId,
} from "@/lib/animeIdMapping";
import { PosterCard } from "@/components/anime/discover/PosterCard";
import {
  PosterGridSkeleton,
  POSTER_GRID_CLASS,
} from "@/components/anime/discover/DiscoverPosterGrid";
import {
  animeCardToPosterItem,
  type PosterItem,
} from "@/components/anime/discover/types";
import { MangaPicksSection } from "@/components/manga/MangaPicksSection";

/** Presentation only. Recommendation engines, hooks and feedback flows are unchanged. */
export default function FavoritesRecommendations() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const personalized = usePersonalizedRecommendations(24);
  const ml = useMLRecommendations(30);
  const taste = useTasteProfile();
  const genres = useGenrePreferences();
  const smart = useSmartFavorites(6);
  const watchlist = useWatchlist();
  const add = useAddToWatchlist();
  const popular = useQuery({
    queryKey: ["anilist-favorites-favorites-page"],
    queryFn: () =>
      fetchAniListDiscover({ perPage: 18, sort: "FAVOURITES_DESC" }),
    staleTime: 600000,
  });
  const mode = params.get("recommendations") === "ai" ? "ai" : "personalized";
  const saved = new Set((watchlist.data || []).map((row) => row.anime_id));
  const addButton = (id: string, name: string, poster?: string | null) => (
    <button
      type="button"
      className="mt-2 min-h-10 w-full rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-60"
      disabled={saved.has(id) || add.isPending}
      onClick={() =>
        add.mutate({
          animeId: id,
          animeName: name,
          animePoster: poster || undefined,
          status: "plan_to_watch",
        })
      }
    >
      {saved.has(id) ? t("favoritesHub.saved") : t("favoritesHub.add")}
    </button>
  );
  const suggestionItem = (
    id: string,
    title: string,
    poster?: string | null
  ): PosterItem => {
    const external = parseExternalAnimeId(id);
    return {
      key: id,
      title,
      poster: poster || "",
      href: `/anime/${encodeURIComponent(id)}`,
      anilistId: external?.provider === "anilist" ? external.id : undefined,
    };
  };
  const entries =
    mode === "ai"
      ? (ml.data || []).map((row, i) => ({
          item: animeCardToPosterItem(row.anime, i),
          note: [`${Math.round(row.score)}%`, row.reasons?.[0]]
            .filter(Boolean)
            .join(" · "),
        }))
      : (personalized.data || []).map((row, i) => ({
          item: animeCardToPosterItem(row.anime, i),
          note: row.reason,
        }));
  const loading = mode === "ai" ? ml.isLoading : personalized.isLoading;
  const failed = mode === "ai" ? false : personalized.isError;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex gap-2"
          role="group"
          aria-label={t("favoritesHub.recommendations")}
        >
          {(["personalized", "ai"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              className={`min-h-11 rounded-lg border px-4 text-sm ${
                mode === value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border hover:bg-muted"
              }`}
              onClick={() =>
                setParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.set("recommendations", value);
                  return next;
                })
              }
            >
              {t(`favoritesHub.${value}`)}
            </button>
          ))}
        </div>
        <Link
          className="text-sm text-primary underline-offset-4 hover:underline"
          to="/recommendations"
        >
          {t("favoritesHub.fullRecommendations")}
        </Link>
      </div>
      {mode === "ai" && taste.data && (
        <p className="text-sm text-muted-foreground">
          {taste.data.preferredGenres
            .slice(0, 5)
            .map((item) => item.genre)
            .join(" · ")}
        </p>
      )}
      {loading ? (
        <PosterGridSkeleton count={12} />
      ) : failed ? (
        <p role="alert">{t("favoritesHub.unavailable")}</p>
      ) : entries.length ? (
        <div className={POSTER_GRID_CLASS}>
          {entries.map(({ item, note }, index) => (
            <PosterCard
              key={item.key}
              item={item}
              preview
              eager={index < 6}
              footer={
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {note}
                </p>
              }
            />
          ))}
        </div>
      ) : (
        <p className="py-8 text-sm text-muted-foreground">
          {t("favoritesHub.noRecommendations")}
        </p>
      )}
      {(smart.data || []).length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">{t("favoritesHub.unsaved")}</h2>
          <div className={POSTER_GRID_CLASS}>
            {smart.data!.map((row) => (
              <PosterCard
                key={row.animeId}
                item={suggestionItem(
                  row.animeId,
                  row.animeName,
                  row.animePoster
                )}
                preview
                footer={
                  <>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {row.reason}
                    </p>
                    {addButton(row.animeId, row.animeName, row.animePoster)}
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}
      <section className="space-y-4">
        <h2 className="text-lg font-medium">
          {t("favoritesHub.fanFavorites")}
        </h2>
        {popular.isLoading ? (
          <PosterGridSkeleton count={12} />
        ) : popular.isError ? (
          <p role="alert">{t("favoritesHub.unavailable")}</p>
        ) : (
          <div className={POSTER_GRID_CLASS}>
            {(popular.data || []).slice(0, 12).map((row) => {
              const id =
                buildExternalAnimeRouteId(row.idMal, row.id) || String(row.id);
              const title =
                row.title?.english ||
                row.title?.romaji ||
                row.title?.native ||
                `AniList #${row.id}`;
              const poster = row.coverImage?.large || row.coverImage?.medium;
              return (
                <PosterCard
                  key={id}
                  item={{
                    ...suggestionItem(id, title, poster),
                    anilistId: row.id,
                  }}
                  preview
                  footer={addButton(id, title, poster)}
                />
              );
            })}
          </div>
        )}
      </section>
      <MangaPicksSection genres={(genres.data || []).map((row) => row.genre)} />
    </div>
  );
}
