import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEpisodes } from "@/hooks/api/useAnimeData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  latestAnimeActivity,
  watchEpisodeHref,
  type AnimeActivity,
} from "@/lib/favoritesEpisodes";

export default function FavoritesWatchControls({
  anime,
  history,
}: {
  anime: {
    anime_id: string;
    anime_name: string;
    anilist_id?: number;
    mal_id?: number;
  };
  history: AnimeActivity[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Fetch the episode catalog only when the user opens the picker.
  const episodes = useEpisodes(open ? anime.anime_id : undefined);
  const latest = latestAnimeActivity(history, anime);
  const rows = useMemo(() => {
    const catalog = [
      ...(episodes.data?.episodes || []),
      ...(episodes.data?.specials || []),
    ];
    const merged = new Map(catalog.map((row) => [row.episodeId, row]));
    for (const row of history) {
      if (
        !row.episode_id ||
        !latestAnimeActivity([row], anime) ||
        merged.has(row.episode_id)
      )
        continue;
      // History stays navigable if the catalog provider is temporarily unavailable.
      if (catalog.some((episode) => episode.number === row.episode_number))
        continue;
      merged.set(row.episode_id, {
        episodeId: row.episode_id,
        number: row.episode_number || 0,
        title: t("app.episode_i18n_value_0_f05acda8", {
          value0: row.episode_number,
        }),
        isFiller: false,
      });
    }
    return [...merged.values()]
      .sort((a, b) => a.number - b.number)
      .filter(
        (row) =>
          !search.trim() ||
          `${row.number} ${row.title}`
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase())
      );
  }, [episodes.data, history, anime, search, t]);
  return (
    <div className="space-y-2">
      {latest?.episode_id && (
        <Link
          className="block text-xs font-medium text-primary hover:underline"
          to={watchEpisodeHref(latest.episode_id)}
        >
          {t(
            latest.completed
              ? "favoritesHub.replayEpisode"
              : "favoritesHub.resumeEpisode",
            { number: latest.episode_number }
          )}
        </Link>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10 w-full"
        onClick={() => {
          setSearch("");
          setOpen(true);
        }}
      >
        {t("favoritesHub.chooseEpisode")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{anime.anime_name}</DialogTitle>
            <DialogDescription>
              {t("favoritesHub.chooseEpisode")}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={t("favoritesHub.searchEpisodes")}
            placeholder={t("favoritesHub.searchEpisodes")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {episodes.isLoading ? (
            <p role="status">{t("favoritesHub.loading")}</p>
          ) : (
            <>
              {episodes.isError && (
                <p role="alert" className="text-sm text-muted-foreground">
                  {t("favoritesHub.unavailable")}{" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => void episodes.refetch()}
                  >
                    {t("favoritesHub.retry")}
                  </button>
                </p>
              )}
              <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
                {rows.map((row) =>
                  row.hasAired === false ? (
                    <div
                      key={row.episodeId}
                      className="rounded-lg border border-border p-3 text-sm text-muted-foreground"
                      aria-disabled="true"
                    >
                      {t("favoritesHub.episode")} {row.number} · {row.title} ·{" "}
                      {t("calendarView.upcoming")}
                    </div>
                  ) : (
                    <Link
                      key={row.episodeId}
                      to={watchEpisodeHref(row.episodeId)}
                      onClick={() => setOpen(false)}
                      className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="shrink-0 font-medium tabular-nums">
                        {t("favoritesHub.episode")} {row.number}
                      </span>
                      <span className="min-w-0 truncate text-muted-foreground">
                        {row.title}
                      </span>
                    </Link>
                  )
                )}
                {!rows.length && (
                  <p className="py-6 text-sm text-muted-foreground">
                    {t("favoritesHub.noEpisodes")}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
