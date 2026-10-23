import uiI18n from "@/lib/uiI18n";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
/**
 * Custom-source info page (`/x/:namespace/:sourceId/info/:id`).
 *
 * Mirrors the anime/manga detail layout (poster hero + description + a list of
 * entries) but is fully isolated: entries route to `/x/<ns>/<sid>/watch|read/...`
 * by the source's `kind`, and nothing here reads or writes the watchlist/readlist.
 */

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BookOpen,
  BookmarkPlus,
  Film,
  Check,
  Download,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { useIsNativeApp, useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { getProxiedImageUrl } from "@/lib/api";
import { useCustomInfo, useCustomSource } from "@/hooks/api/useCustomSource";
import { ExtensionSlot } from "@/core/extensions/ExtensionSlot";
import { isCapacitor } from "@/lib/platform/platform";
import { registerMobileSource } from "@/core/extensions/mobile/mobileProxy";
import { useExtensionTitleProgress } from "@/hooks/media/useExtensionLibrary";
import {
  updateExtensionLibrary,
  extensionTitleRoute,
} from "@/core/extensions/compatibility/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { VideoBackground } from "@/components/anime/VideoBackground";
import {
  AnimeDetailHero,
  AnimeDetailPoster,
  AnimeDetailContent,
  AnimeDetailTitle,
  AnimeDetailDescription,
  AnimeDetailFacts,
  AnimeDetailActions,
  AnimeDetailPrimaryAction,
} from "@/components/anime/AnimeDetailLayout";
import { CustomProviderToolbar } from "@/components/extensions/CustomProviderToolbar";
import {
  CustomCatalogPanel,
  CustomCatalogActions,
  CustomCatalogComments,
} from "@/components/extensions/CustomCatalogPanel";
import { useCustomCatalog } from "@/hooks/media/useCustomCatalog";
import { useCustomTracker } from "@/hooks/media/useCustomTracker";
import {
  customSourceBase,
  orderedCustomEntries,
} from "@/core/content/custom-source-model";
import {
  extensionChapterKey,
  extensionDownloadIdentity,
} from "@/core/extensions/compatibility/downloads";
import { isCompatibilityNamespace } from "@/core/extensions/compatibility/client";
import { useMangaDownload } from "@/hooks/media/useMangaDownload";

const AnimeInfo = lazy(() => import("@/pages/watch/AnimePage"));
const MangaInfo = lazy(() => import("@/pages/manga/MangaPage"));
const NovelInfo = lazy(() => import("@/pages/novel/NovelPage"));

export default function CustomInfoPage() {
  useUiTranslation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isMobile = useIsMobile();
  const { namespace, sourceId, id } = useParams<{
    namespace: string;
    sourceId: string;
    id: string;
  }>();
  const { source } = useCustomSource(namespace, sourceId);
  const {
    data: info,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useCustomInfo(namespace, sourceId, id);
  const [query, setQuery] = useState(""),
    [descending, setDescending] = useState(false),
    [entryPage, setEntryPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false),
    [actionError, setActionError] = useState(""),
    [busyEntry, setBusyEntry] = useState<string>();
  const { enqueueChapter, isEnabled: downloadsEnabled } = useMangaDownload();
  const catalog = useCustomCatalog(source, id, info);
  const [catalogUnavailable, setCatalogUnavailable] = useState("");
  const titleKey = JSON.stringify([namespace, sourceId, id]);
  const useCatalogLayout = !!catalog.link && catalogUnavailable !== titleKey;

  const kind = source?.kind === "read" ? "read" : "watch";
  const base = customSourceBase({
    namespace: namespace || "",
    id: sourceId || "",
  });
  const entries = info?.entries ?? [];
  const libraryTitle =
    info && namespace && sourceId && id
      ? {
          namespace,
          sourceId,
          id,
          kind: kind as "watch" | "read",
          title: info.title,
          image: info.image,
          sourceName: source?.name,
          catalog: entries,
        }
      : undefined;
  const library = useExtensionTitleProgress(libraryTitle);
  const tracker = useCustomTracker(catalog, entries, library.row);
  const ordered = useMemo(() => orderedCustomEntries(entries), [entries]);
  const filtered = useMemo(
    () =>
      orderedCustomEntries(entries, descending).filter(
        (entry) =>
          (!unreadOnly || !library.row?.entries[entry.id]?.completed) &&
          entry.label.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [entries, descending, unreadOnly, query, library.row]
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 60));
  useEffect(
    () => setEntryPage(1),
    [query, descending, unreadOnly, namespace, sourceId, id]
  );
  const visible = filtered.slice(
    (Math.min(entryPage, pageCount) - 1) * 60,
    Math.min(entryPage, pageCount) * 60
  );
  const meta = info?.meta ?? {};
  const imageUrl = useMemo(() => {
    const image = String(catalog.link?.media.image || info?.image || "");
    if (!image) return "";
    return isCapacitor() && /^https?:/i.test(image)
      ? registerMobileSource({ url: image })
      : getProxiedImageUrl(image);
  }, [info?.image, catalog.link?.media.image]);

  const openEntry = (entryId: string) =>
    navigate(
      `${base}/${kind}/${encodeURIComponent(id || "")}/${encodeURIComponent(
        entryId
      )}`
    );
  async function saveAction(action: () => Promise<unknown>, entryId?: string) {
    setActionError("");
    setBusyEntry(entryId || "library");
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not save changes"
      );
    } finally {
      setBusyEntry(undefined);
    }
  }
  async function download(entry: (typeof entries)[number]) {
    if (!libraryTitle || !sourceId) return;
    const downloadId = await extensionDownloadIdentity(libraryTitle);
    await updateExtensionLibrary(library.profile, libraryTitle, {
      saved: true,
    });
    const result = await enqueueChapter(
      {
        anilistId: downloadId,
        title: libraryTitle.title,
        posterUrl: libraryTitle.image,
      },
      {
        chapterKey: await extensionChapterKey(sourceId, entry.id),
        provider: sourceId,
        providerChapterId: entry.id,
        chapterNumber: entry.number,
      }
    );
    if (!result.ok)
      throw Error(
        "reason" in result
          ? String(result.reason)
          : "Could not queue chapter download"
      );
  }

  const sourceEntries = (
    <div className="mb-16" data-custom-source-entries>
      {info && !isError && (
        <>
          {(actionError || tracker.error) && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>
                {actionError || tracker.error}
                {tracker.error && (
                  <Button variant="outline" size="sm" onClick={tracker.retry}>
                    Retry tracker sync
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <CustomCatalogPanel
            key={`${namespace}:${sourceId}:${id}`}
            catalog={catalog}
            title={info.title}
            showActions={false}
          />

          <section className="mt-10">
            <h2 className="mb-4 font-display text-xl font-semibold tracking-tight">
              {kind === "read"
                ? t("animeDetail.chapters")
                : t("animeDetail.episodes")}{" "}
              <span className="text-muted-foreground">({entries.length})</span>
            </h2>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Input
                aria-label={
                  kind === "read" ? "Filter chapters" : "Filter episodes"
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  kind === "read" ? "Find a chapter" : "Find an episode"
                }
                className="min-w-0 sm:max-w-xs"
              />
              <Button
                variant="outline"
                onClick={() => setDescending((value) => !value)}
              >
                {descending ? "Newest first" : "Oldest first"}
              </Button>
              <Button
                variant={unreadOnly ? "secondary" : "outline"}
                aria-pressed={unreadOnly}
                onClick={() => setUnreadOnly((value) => !value)}
              >
                Unfinished only
              </Button>
              <span className="text-xs text-muted-foreground">
                {filtered.length} entries
              </span>
            </div>
            {entries.length > 0 ? (
              filtered.length ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex min-w-0 flex-col rounded-xl border border-border/60 bg-card/50"
                    >
                      <button
                        key={entry.id}
                        onClick={() => openEntry(entry.id)}
                        className="flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-accent"
                      >
                        {entry.number != null ? (
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
                            {entry.number}
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {entry.label}
                        </span>
                        {library.row?.entries[entry.id]?.completed && (
                          <Check
                            className="size-4 shrink-0 text-primary"
                            aria-label="Completed"
                          />
                        )}
                        {kind === "read" ? (
                          <BookOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <Play className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!!busyEntry || !library.ready}
                          aria-label={`${
                            library.row?.entries[entry.id]?.completed
                              ? "Mark unfinished"
                              : "Mark completed"
                          }: ${entry.label}`}
                          onClick={() =>
                            libraryTitle &&
                            void saveAction(
                              () =>
                                updateExtensionLibrary(
                                  library.profile,
                                  libraryTitle,
                                  {
                                    progress: {
                                      id: entry.id,
                                      label: entry.label,
                                      position:
                                        library.row?.entries[entry.id]
                                          ?.position || 0,
                                      duration:
                                        library.row?.entries[entry.id]
                                          ?.duration || 0,
                                      completed:
                                        !library.row?.entries[entry.id]
                                          ?.completed,
                                      updatedAt: new Date().toISOString(),
                                    },
                                  }
                                ),
                              entry.id
                            )
                          }
                        >
                          {library.row?.entries[entry.id]?.completed
                            ? "Mark unfinished"
                            : "Mark completed"}
                        </Button>
                        {kind === "read" &&
                          downloadsEnabled &&
                          namespace &&
                          isCompatibilityNamespace(namespace) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!!busyEntry}
                              aria-label={`Download ${entry.label}`}
                              onClick={() =>
                                void saveAction(() => download(entry), entry.id)
                              }
                            >
                              <Download data-icon="inline-start" />
                              Download
                            </Button>
                          )}
                        {library.row?.entries[entry.id] &&
                          !library.row.entries[entry.id].completed && (
                            <span className="text-xs text-muted-foreground">
                              {kind === "read"
                                ? `Page ${
                                    Math.floor(
                                      library.row.entries[entry.id].position
                                    ) + 1
                                  }`
                                : `${Math.floor(
                                    library.row.entries[entry.id].position / 60
                                  )} min saved`}
                            </span>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-muted-foreground">
                  No entries match these filters.
                </p>
              )
            ) : (
              <GlassPanel className="border border-white/10 p-6">
                <p className="text-sm text-muted-foreground">
                  {t("discover.noEntries")}
                </p>
              </GlassPanel>
            )}
          </section>
          {pageCount > 1 && (
            <nav
              className="my-6 flex items-center justify-center gap-4"
              aria-label="Entry pages"
            >
              <Button
                variant="outline"
                disabled={entryPage <= 1}
                onClick={() => setEntryPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {entryPage} / {pageCount}
              </span>
              <Button
                variant="outline"
                disabled={entryPage >= pageCount}
                onClick={() => setEntryPage((value) => value + 1)}
              >
                Next
              </Button>
            </nav>
          )}
          <div className="mt-12">
            {!useCatalogLayout && (
              <CustomCatalogComments catalog={catalog} source={source} />
            )}
          </div>
        </>
      )}
    </div>
  );
  const providerHeader = (
    <Header
      providerSearch={{
        name: source?.name || "provider",
        query: "",
        onSearch: (term) =>
          navigate(base + (term ? `?q=${encodeURIComponent(term)}` : "")),
      }}
      providerControls={
        <CustomProviderToolbar source={source} title={info?.title} compact />
      }
    />
  );
  if (useCatalogLayout && catalog.link) {
    const DetailPage =
      catalog.link.media.kind === "anime"
        ? AnimeInfo
        : catalog.link.media.kind === "novel"
        ? NovelInfo
        : MangaInfo;
    return (
      <Suspense
        fallback={
          <div role="status" className="p-8 text-muted-foreground">
            Loading title details…
          </div>
        }
      >
        <DetailPage
          catalogId={String(
            catalog.link.media.anilistId || catalog.link.media.tatakaiId
          )}
          sourceContext={{
            header: providerHeader,
            entries: sourceEntries,
            canOpen: !!ordered.length,
            resume: !!library.row?.latest,
            actions: libraryTitle && <Button variant="outline" size="icon" className="size-12 rounded-full sm:size-14" disabled={!!busyEntry || !library.ready} aria-label={library.row?.saved ? 'Remove local bookmark' : 'Save local bookmark'} onClick={() => void saveAction(() => updateExtensionLibrary(library.profile, libraryTitle, { saved: !library.row?.saved }))}>{library.row?.saved ? <Check /> : <BookmarkPlus />}</Button>,
            open: () =>
              library.row?.latest
                ? navigate(extensionTitleRoute(library.row))
                : ordered[0] && openEntry(ordered[0].id),
            onUnavailable: () => setCatalogUnavailable(titleKey),
          }}
        />
      </Suspense>
    );
  }
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      {!isNative && <Background />}
      {!isMobile && <Sidebar />}

      <VideoBackground
        animeId={
          catalog.link?.media.anilistId
            ? String(catalog.link.media.anilistId)
            : ""
        }
        poster={
          info?.banner ||
          catalog.link?.media.banner ||
          imageUrl ||
          "/placeholder.svg"
        }
        anilistId={kind === "watch" ? catalog.link?.media.anilistId : undefined}
      >
        <main
          className={cn(
            "app-page relative z-10 mx-auto max-w-[1800px] py-6 pr-6 pb-28 md:pb-6",
            isDesktopApp ? "pl-6" : "pl-6 md:pl-32"
          )}
        >
          {providerHeader}
          <button
            onClick={() => navigate(base)}
            className="mb-8 inline-flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {source?.name || "Back to provider"}
          </button>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> {t("common.loading")}
            </div>
          ) : !info || isError ? (
            <GlassPanel className="mx-auto max-w-xl border border-white/10 p-6">
              <h2 className="text-xl font-bold">
                {t("discover.unableToLoadTitle")}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {t("discover.unableToLoadTitleDesc")}
              </p>
              {error && (
                <p role="alert" className="mt-3 text-sm text-muted-foreground">
                  {error.message}
                </p>
              )}
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => void refetch()}
              >
                Try again
              </Button>
            </GlassPanel>
          ) : (
            <>
              <AnimeDetailHero data-custom-detail-hero>
                <AnimeDetailPoster>
                  <img
                    src={imageUrl || "/placeholder.svg"}
                    alt={info.title}
                    className="w-full aspect-[2/3] object-cover"
                    loading="eager"
                    decoding="async"
                    onError={(event) => {
                      if (!event.currentTarget.dataset.fallback) {
                        event.currentTarget.dataset.fallback = "true";
                        event.currentTarget.src = "/placeholder.svg";
                      }
                    }}
                  />
                </AnimeDetailPoster>
                <AnimeDetailContent>
                  <div>
                    <AnimeDetailTitle>{info.title}</AnimeDetailTitle>
                    <ExtensionSlot
                      slotId="custom-info-after-title"
                      props={{ namespace, sourceId, id, kind, info }}
                    />
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {source?.description ||
                          source?.name ||
                          "Local extension"}
                      </Badge>
                      {catalog.link?.media.anilistId && (
                        <Badge variant="outline">
                          AniList {catalog.link.media.anilistId}
                        </Badge>
                      )}
                    </div>
                    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                      <span className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
                        {kind === "read" ? (
                          <BookOpen className="size-4" />
                        ) : (
                          <Film className="size-4" />
                        )}
                        {kind === "read" ? "Manga" : "Anime"}
                      </span>
                      <span className="flex items-center gap-2 rounded-lg bg-primary/20 px-3 py-1.5 text-primary">
                        {entries.length}{" "}
                        {kind === "read" ? "chapters" : "episodes"}
                      </span>
                    </div>
                    {!!(meta.Genres || meta.genres) && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {String(meta.Genres || meta.genres)
                          .split(/[,|]/)
                          .map((genre) => genre.trim())
                          .filter(Boolean)
                          .map((genre) => (
                            <span
                              key={genre}
                              className="rounded-full border border-border px-3 py-1 text-sm"
                            >
                              {genre}
                            </span>
                          ))}
                      </div>
                    )}
                    {info.description && (
                      <AnimeDetailDescription>
                        {info.description}
                      </AnimeDetailDescription>
                    )}
                  </div>
                  <AnimeDetailFacts>
                    <div>
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">
                        Provider
                      </span>
                      <p className="mt-1 font-medium">
                        {source?.name || "Custom source"}
                      </p>
                    </div>
                    {Object.entries(meta)
                      .filter(([key]) => key.toLowerCase() !== "genres")
                      .map(([key, value]) => (
                        <div key={key}>
                          <span className="text-xs uppercase tracking-wider text-muted-foreground">
                            {key}
                          </span>
                          <p className="mt-1 break-words font-medium">
                            {String(value)}
                          </p>
                        </div>
                      ))}
                  </AnimeDetailFacts>
                  <AnimeDetailActions>
                    {!!entries.length && (
                      <AnimeDetailPrimaryAction
                        onClick={() =>
                          library.row?.latest
                            ? navigate(extensionTitleRoute(library.row))
                            : openEntry(ordered[0].id)
                        }
                      >
                        {kind === "read" ? (
                          <BookOpen className="size-4 sm:size-5" />
                        ) : (
                          <Play className="size-4 fill-background sm:size-5" />
                        )}
                        {library.row?.latest
                          ? "Resume"
                          : kind === "read"
                          ? "Read now"
                          : "Watch now"}
                      </AnimeDetailPrimaryAction>
                    )}
                    {catalog.link && (
                      <CustomCatalogActions link={catalog.link} compact />
                    )}
                    {libraryTitle && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-12 rounded-full sm:size-14"
                        disabled={!!busyEntry || !library.ready}
                        aria-label={
                          library.row?.saved
                            ? "Remove local bookmark"
                            : "Save local bookmark"
                        }
                        title={
                          library.row?.saved
                            ? "Remove local bookmark"
                            : "Save local bookmark"
                        }
                        onClick={() =>
                          void saveAction(() =>
                            updateExtensionLibrary(
                              library.profile,
                              libraryTitle,
                              { saved: !library.row?.saved }
                            )
                          )
                        }
                      >
                        {library.row?.saved ? <Check /> : <BookmarkPlus />}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-12 rounded-full sm:size-14"
                      disabled={isFetching}
                      aria-label="Refresh title"
                      title="Refresh title"
                      onClick={() => void refetch()}
                    >
                      <RefreshCw />
                    </Button>
                  </AnimeDetailActions>
                </AnimeDetailContent>
              </AnimeDetailHero>
            </>
          )}
        </main>
      </VideoBackground>
      <main
        className={cn(
          "relative z-10 mx-auto max-w-[1800px] pr-6 pb-28 md:pb-6",
          isDesktopApp ? "pl-6" : "pl-6 md:pl-32"
        )}
      >
        {sourceEntries}
      </main>

      {/* MobileNav hides itself above `md` and on auth/error routes. */}
      <MobileNav />
    </div>
  );
}
