import { Link } from "react-router-dom";
import { BookOpen, Play } from "lucide-react";
import { useExtensionLibrary } from "@/hooks/media/useExtensionLibrary";
import {
  extensionTitleRoute,
  extensionContinueEntry,
  type ExtensionLibraryItem,
} from "@/core/extensions/compatibility/library";
import { getProxiedImageUrl } from "@/lib/api";
import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";
import { Progress } from "@/components/ui/progress";

export function ExtensionContinue({
  kind,
  namespace,
  sourceIds,
  saved = false,
}: {
  kind: "watch" | "read";
  namespace?: string;
  sourceIds?: string[];
  saved?: boolean;
}) {
  const { data = [] } = useExtensionLibrary();
  const items = data
    .filter(
      (item) =>
        item.kind === kind &&
        (!namespace || item.namespace === namespace) &&
        (!sourceIds || sourceIds.includes(item.sourceId)) &&
        (saved ? item.saved : extensionContinueEntry(item))
    )
    .slice(0, 20);
  if (!items.length) return null;
  return (
    <section
      className="min-w-0"
      data-extension-continue={saved ? "saved" : kind}
    >
      <HomeSectionHeading
        title={
          saved
            ? "Saved from this provider"
            : kind === "watch"
            ? "Continue watching · Extensions"
            : "Continue reading · Extensions"
        }
        icon={
          kind === "read" ? (
            <BookOpen className="size-5 text-primary" />
          ) : (
            <Play className="size-5 text-primary" />
          )
        }
      />
      <div className="flex snap-x gap-4 overflow-x-auto pb-3">
        {items.map((item) => {
          const entry = saved ? null : extensionContinueEntry(item);
          const progress = entry && item.entries[entry.id];
          const percent =
            progress && progress.duration > 0
              ? Math.min(100, (progress.position / progress.duration) * 100)
              : 0;
          const route = entry
            ? extensionTitleRoute({
                ...item,
                latest: entry.id,
              } as ExtensionLibraryItem)
            : extensionTitleRoute(item, false);
          return (
            <Link
              key={JSON.stringify([item.namespace, item.sourceId, item.id])}
              to={route}
              className="flex w-72 shrink-0 snap-start gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={
                  item.image
                    ? getProxiedImageUrl(item.image)
                    : "/placeholder.svg"
                }
                alt=""
                loading="lazy"
                className="aspect-[2/3] w-16 shrink-0 rounded-xl object-cover"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/placeholder.svg";
                }}
              />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                <p className="line-clamp-2 font-semibold">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.sourceName}
                </p>
                {entry && (
                  <p className="truncate text-xs">
                    {entry.label}
                    {progress && !progress.completed
                      ? kind === "read"
                        ? ` · Page ${Math.floor(progress.position) + 1}`
                        : ` · ${Math.floor(progress.position / 60)} min`
                      : ""}
                  </p>
                )}
                {!!percent && (
                  <Progress
                    value={percent}
                    aria-label="Saved progress"
                    className="h-1"
                  />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
