import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Link2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  searchCustomCatalog,
  catalogRoute,
  catalogEntityId,
  catalogCommentTarget,
  type CatalogMedia,
  type CustomCatalogLink,
} from "@/core/content/custom-catalog";
import type { CustomSourceEntry } from "@/core/content/custom-source-runtime";
import type { useCustomCatalog } from "@/hooks/media/useCustomCatalog";
import { WatchlistButton } from "@/components/anime/WatchlistButton";
import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";
import { useUpsertMangaReadlist } from "@/hooks/user/useMangaReadlist";
import { getProxiedImageUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
const Comments = lazy(() =>
  import("@/components/comments/Comments").then((module) => ({
    default: module.Comments,
  }))
);

function MappedReadlist({ media }: { media: CatalogMedia }) {
  const save = useUpsertMangaReadlist();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" disabled={save.isPending}>
          Add to readlist
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          {(
            [
              "plan_to_read",
              "reading",
              "completed",
              "on_hold",
              "dropped",
            ] as const
          ).map((status) => (
            <DropdownMenuItem
              key={status}
              onClick={() =>
                save.mutate({
                  mangaId: catalogEntityId(media),
                  mangaTitle: media.title,
                  mangaPoster: media.image,
                  anilistId: media.anilistId,
                  malId: media.malId,
                  format:
                    media.kind === "novel"
                      ? "novel"
                      : media.format.toLowerCase(),
                  status,
                })
              }
            >
              {status.replace(/_/g, " ")}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function CustomCatalogActions({ link, compact = false }: { link: CustomCatalogLink; compact?: boolean }) {
  const media = link.media,
    id = catalogEntityId(media);
  if (!id) return null;
  return (
    <div className="flex flex-wrap gap-2" data-mapped-catalog-actions>
      {media.kind === "anime" ? (
        <WatchlistButton
          animeId={id}
          animeName={media.title}
          animePoster={media.image}
          anilistId={media.anilistId}
          malId={media.malId}
          variant={compact ? 'icon' : 'default'}
        />
      ) : (
        <MappedReadlist media={media} />
      )}
      <AddToPlaylistButton
        animeId={id}
        animeName={media.title}
        animePoster={media.image}
        mediaType={media.kind === "anime" ? "anime" : "manga"}
        mediaFormat={media.kind}
        variant={compact ? 'icon' : 'default'}
      />
      {!compact && <Button variant="outline" asChild>
        <Link to={catalogRoute(media)}>Tatakai details</Link>
      </Button>}
    </div>
  );
}

export function CustomCatalogPanel({
  catalog,
  title,
  showActions = true,
}: {
  catalog: ReturnType<typeof useCustomCatalog>;
  title: string;
  showActions?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(title),
    [submitted, setSubmitted] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const search = useQuery({
    queryKey: ["custom-catalog-search", catalog.kind, submitted],
    enabled: open && !!submitted && !!catalog.kind,
    retry: false,
    queryFn: ({ signal }) =>
      searchCustomCatalog(catalog.kind!, submitted, signal),
    staleTime: 60000,
  });
  if (!catalog.kind) return null;
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not save catalogue link";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/60 bg-card/50 p-4"
      aria-label="Catalogue connection"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link2 className="size-4 shrink-0 text-primary" />
          <p className="text-sm font-semibold">
            {catalog.link
              ? `Linked to ${catalog.link.media.title}`
              : "Connect to Tatakai"}
          </p>
          {catalog.link?.media.anilistId && (
            <Badge variant="secondary">
              AniList {catalog.link.media.anilistId}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setQuery(title);
            setError("");
            setOpen(true);
          }}
        >
          {catalog.link ? "Change link" : "Find catalogue title"}
        </Button>
      </div>
      {catalog.isFetching && (
        <p role="status" className="text-xs text-muted-foreground">
          Checking catalogue identity…
        </p>
      )}
      {!catalog.link && (
        <p className="text-sm text-muted-foreground">
          Link an exact title to use its watchlist or readlist and playlists.
          Shared comments require a verified AniList ID.
        </p>
      )}
      {catalog.error && !catalog.link && (
        <p className="text-sm text-muted-foreground">
          Catalogue matching is unavailable right now. Source browsing and local
          progress still work.
        </p>
      )}
      {catalog.link && (
        <>
          {showActions && <CustomCatalogActions link={catalog.link} />}
          {catalog.link.media.anilistId && (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="custom-catalog-sync">
                  Track completed{" "}
                  {catalog.kind === "anime" ? "episodes" : "chapters"}
                </FieldLabel>
                <FieldDescription>
                  Enable after checking that this source uses the same numbering
                  as the linked title. Syncs to your connected trackers; local
                  progress is always saved.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="custom-catalog-sync"
                checked={catalog.link.syncEnabled}
                disabled={busy}
                onCheckedChange={(value) =>
                  void act(() => catalog.setSync(value))
                }
              />
            </Field>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={busy}
            onClick={() => void act(catalog.unlink)}
          >
            Disconnect catalogue link
          </Button>
        </>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link the exact {catalog.kind} title</DialogTitle>
            <DialogDescription>
              Check the title, format and year, including its season. Ambiguous
              titles stay separate until their identity is verified.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(query.trim());
            }}
          >
            <Input
              aria-label="Catalogue title or ID"
              placeholder="Title, AniList ID / URL, or tatakai:ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button type="submit" disabled={!query.trim() || busy}>
              <Search data-icon="inline-start" />
              Search
            </Button>
          </form>
          {(error || search.error) && (
            <Alert variant="destructive">
              <AlertDescription>
                {error || search.error?.message}
              </AlertDescription>
            </Alert>
          )}
          {search.isFetching && <p role="status">Searching catalogue…</p>}
          {search.isSuccess && !search.data.length && (
            <p>
              No supported catalogue titles found. This title will keep its
              local extension library and progress.
            </p>
          )}
          <div className="flex flex-col gap-3">
            {search.data?.map((media) => (
              <div
                key={catalogEntityId(media)}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3"
              >
                <img
                  src={
                    media.image
                      ? getProxiedImageUrl(media.image)
                      : "/placeholder.svg"
                  }
                  alt=""
                  loading="lazy"
                  className="aspect-[2/3] w-12 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{media.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {media.format} · {media.year || "Year unknown"} ·{" "}
                    {media.anilistId
                      ? `AniList ${media.anilistId}`
                      : `Tatakai ${media.tatakaiId}`}
                  </p>
                </div>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await catalog.confirm(media);
                      setOpen(false);
                    })
                  }
                >
                  Confirm
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function CustomCatalogComments({
  catalog,
  source,
}: {
  catalog: ReturnType<typeof useCustomCatalog>;
  source?: CustomSourceEntry;
}) {
  const target = catalogCommentTarget(source, catalog.identity, catalog.link);
  if (!target) return null;
  return (
    <section data-linked-comments={target.entityId}>
      <Suspense fallback={<p role="status">Loading comments…</p>}>
        <Comments key={`${target.entityType}:${target.entityId}`} {...target} />
      </Suspense>
    </section>
  );
}
