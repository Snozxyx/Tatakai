import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Play } from "lucide-react";
import { groupHistoryByTitle } from "@/lib/favoritesEpisodes";
import type { LibraryEntry } from "@/lib/favoritesLibrary";

export default function FavoritesHistory({
  entries,
}: {
  entries: LibraryEntry[];
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-3">
      {groupHistoryByTitle(entries).map((group) => (
        <details
          key={group.key}
          className="group rounded-xl border border-border bg-card"
        >
          <summary className="flex min-h-20 cursor-pointer list-none items-center gap-4 rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            {group.poster && (
              <img
                src={group.poster}
                alt=""
                loading="lazy"
                className="h-16 w-11 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-medium">{group.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  group.kind === "anime"
                    ? "favoritesHub.historyEpisodes"
                    : "favoritesHub.historyReading",
                  { count: group.entries.length }
                )}{" "}
                · {new Date(group.updatedAt).toLocaleDateString(i18n.language)}
              </p>
            </div>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="border-t border-border p-4">
            <Link
              className="mb-3 inline-block text-xs text-primary hover:underline"
              to={group.titleHref}
            >
              {t("favoritesHub.openTitle")}
            </Link>
            <ul className="space-y-2">
              {group.entries.map((entry) => (
                <li key={entry.key}>
                  <Link
                    to={entry.href}
                    className="flex min-h-12 flex-wrap items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Play
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span className="min-w-24 flex-1 text-sm font-medium">
                      {entry.progress || entry.title}
                    </span>
                    {entry.kind === "anime" && (
                      <span className="text-xs text-muted-foreground">
                        {entry.source.completed
                          ? t("feedback.status.completed")
                          : t("favoritesHub.inProgress")}
                      </span>
                    )}
                    <time
                      dateTime={entry.updatedAt}
                      className="basis-full text-xs tabular-nums text-muted-foreground sm:basis-auto"
                    >
                      {new Date(entry.updatedAt).toLocaleString(i18n.language)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ))}
    </div>
  );
}
