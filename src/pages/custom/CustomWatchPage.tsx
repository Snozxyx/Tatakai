import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import {
  watchMainClass,
  WATCH_GRID_CLASS,
  watchPlayerColumnClass,
  watchPlayerFrameClass,
  WATCH_EPISODE_PANEL_CLASS,
  WATCH_EPISODE_NAV_CLASS,
} from "@/components/watch/watchLayout";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SourceLanguageTabs } from "@/components/watch/SourceLanguageTabs";
import { normalizeWatchLanguageKey } from "@/lib/languageUtils";
import { CustomCatalogComments } from "@/components/extensions/CustomCatalogPanel";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
import uiI18n from "@/lib/uiI18n";
import { SourceDebug } from "@/components/extensions/SourceDebug";
/**
 * Custom-source watch page (`kind: 'watch'`).
 *
 * Keeps bookmarks and progress in the device-local custom-source library.
 * It fetches `SourceResult[]` from the extension's
 * custom source and feeds the existing `VideoPlayer` (mapping to its
 * `PlaybackSource[]` contract), with prev/next episode navigation derived from
 * the source's own info entries.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Server,
  ListVideo,
  Search,
  RefreshCw,
  Play,
} from "lucide-react";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { MobileVideoPlayer } from "@/components/video/MobileVideoPlayer";
import { NativeTorrentPlayer } from "@/components/video/NativeTorrentPlayer";
import { EmbedPlayer } from "@/components/video/EmbedPlayer";
import type {
  PlaybackSource,
  ExternalSubtitle,
  PlaybackHeaders,
} from "@/components/video/VideoPlayer.types";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { cn } from "@/lib/utils";
import {
  useCustomWatch,
  useCustomInfo,
  useCustomSource,
} from "@/hooks/api/useCustomSource";
import type { SourceResult } from "@/core/extensions/sdk/types";
import { useIsMobileApp, useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { useExtensionTitleProgress } from "@/hooks/media/useExtensionLibrary";
import { useQuery } from "@tanstack/react-query";
import { extensionVideoKey } from "@/core/extensions/compatibility/downloads";
import { useCustomCatalog } from "@/hooks/media/useCustomCatalog";
import { useCustomTracker } from "@/hooks/media/useCustomTracker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  customSourceBase,
  orderedCustomEntries,
} from "@/core/content/custom-source-model";

/** One switchable server: a named bucket of quality rungs the extension returned. */
interface ServerGroup {
  key: string;
  label: string;
  sources: SourceResult[];
}

/**
 * Group `SourceResult[]` into servers by their `server` field (falling back to
 * `source`). An extension can expose several servers for one episode — each as
 * its own set of quality rungs — so the watch page renders a switcher and feeds
 * only the selected server's rungs to the player. Order is preserved.
 */
function groupByServer(sources: SourceResult[]): ServerGroup[] {
  const groups: ServerGroup[] = [];
  const byKey = new Map<string, ServerGroup>();
  sources.forEach((s, i) => {
    const label =
      (s.server || s.source || `Server ${i + 1}`).trim() ||
      uiI18n.t("app.server_i18n_value_0_0aa32107", { value0: i + 1 });
    const key = JSON.stringify([label, s.audioLanguage || ""]);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label, sources: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.sources.push(s);
  });
  return groups;
}

function toPlaybackSources(sources: SourceResult[]): PlaybackSource[] {
  return sources
    .filter(
      (s) =>
        s?.sourceType !== "custom" &&
        !(s as SourceResult & { isEmbed?: boolean }).isEmbed &&
        s?.url &&
        /^(https?:|mobile-proxy:|blob:|file:|\/)/i.test(String(s.url))
    )
    .map((s) => ({
      url: s.url,
      isM3U8: s.sourceType === "hls" || /\.m3u8/i.test(s.url),
      quality: s.quality,
      sourceType: s.sourceType,
      originalUrl: (s as SourceResult & { originalUrl?: string }).originalUrl,
      headers: s.headers,
    }));
}

function toSubtitles(sources: SourceResult[]): ExternalSubtitle[] {
  const seen = new Set<string>();
  return sources
    .flatMap((source) =>
      (source.subtitles || []).map((track) => ({
        lang: track.language || "und",
        url: track.url,
        label: track.label,
        originalUrl: (track as typeof track & { originalUrl?: string })
          .originalUrl,
        headers:
          (track as typeof track & { headers?: Record<string, string> })
            .headers || source.headers,
      }))
    )
    .filter((track) => {
      const key = track.originalUrl || track.url;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function toHeaders(sources: SourceResult[]): PlaybackHeaders | undefined {
  const h = sources.find(
    (s) => s.headers && Object.keys(s.headers).length
  )?.headers;
  if (!h) return undefined;
  return {
    Referer: h.Referer || h.referer,
    "User-Agent": h["User-Agent"] || h["user-agent"],
  };
}

export default function CustomWatchPage() {
  useUiTranslation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobileApp = useIsMobileApp();
  const desktop = useIsDesktopApp(),
    compact = useIsMobile();
  const [episodeQuery, setEpisodeQuery] = useState(""),
    [episodePage, setEpisodePage] = useState(0),
    [language, setLanguage] = useState("all");
  const { namespace, sourceId, id, episodeId } = useParams<{
    namespace: string;
    sourceId: string;
    id: string;
    episodeId: string;
  }>();
  const { source } = useCustomSource(namespace, sourceId);
  const { data: info } = useCustomInfo(namespace, sourceId, id);
  const { data, isLoading, isError, refetch, isFetching, error } =
    useCustomWatch(namespace, sourceId, id, episodeId);
  const [failed, setFailed] = useState(false);

  const sources = useMemo(() => data?.sources ?? [], [data?.sources]);
  const servers = useMemo(() => groupByServer(sources), [sources]);
  const [serverIdx, setServerIdx] = useState(0);

  // Reset to the first server whenever the episode (hence the source set) changes.
  useEffect(() => {
    setServerIdx(0);
    setFailed(false);
    setLanguage("all");
  }, [episodeId, servers.length]);

  const activeServer = servers[serverIdx] ?? servers[0];
  const activeSources = useMemo(
    () => activeServer?.sources ?? [],
    [activeServer]
  );
  const activeEmbed = activeSources.find(
    (source) =>
      source.sourceType === "custom" ||
      (source as SourceResult & { isEmbed?: boolean }).isEmbed
  );
  const playbackSources = useMemo(
    () => toPlaybackSources(activeSources),
    [activeSources]
  );
  const subtitles = useMemo(() => toSubtitles(activeSources), [activeSources]);
  const headers = useMemo(() => toHeaders(activeSources), [activeSources]);

  const selectServer = (idx: number) => {
    if (idx === serverIdx) return;
    setServerIdx(idx);
    setFailed(false);
  };
  // "Try another server" from the player's error overlay: advance (wrapping).
  const onServerSwitch =
    servers.length > 1
      ? () => selectServer((serverIdx + 1) % servers.length)
      : undefined;

  const entries = useMemo(
    () => orderedCustomEntries(info?.entries ?? []),
    [info?.entries]
  );
  const currentIdx = entries.findIndex((e) => e.id === episodeId);
  const prev = currentIdx > 0 ? entries[currentIdx - 1] : null;
  const next =
    currentIdx >= 0 && currentIdx < entries.length - 1
      ? entries[currentIdx + 1]
      : null;
  const currentLabel = currentIdx >= 0 ? entries[currentIdx].label : episodeId;
  const progress = useExtensionTitleProgress(
    info && namespace && sourceId && id
      ? {
          namespace,
          sourceId,
          id,
          kind: "watch",
          title: info.title,
          image: info.image,
          sourceName: source?.name,
          catalog: entries,
        }
      : undefined,
    episodeId,
    currentLabel
  );
  const catalog = useCustomCatalog(source, id, info);
  const tracker = useCustomTracker(catalog, entries, progress.row);
  useEffect(() => {
    if (
      activeEmbed &&
      progress.ready &&
      info &&
      episodeId &&
      !progress.row?.entries[episodeId]
    )
      progress.save(0, 0, false, true);
  }, [activeEmbed?.url, progress.ready, info?.title, episodeId, progress.save]);
  const downloadIdentity = useQuery({
    queryKey: ["extension-video-id", namespace, sourceId, id, episodeId],
    enabled: !!(namespace && sourceId && id && episodeId),
    queryFn: () => extensionVideoKey(namespace!, sourceId!, id!, episodeId!),
    staleTime: Infinity,
  });

  const base = customSourceBase({
    namespace: namespace || "",
    id: sourceId || "",
  });
  const goEntry = (entryId: string) =>
    navigate(
      `${base}/watch/${encodeURIComponent(id || "")}/${encodeURIComponent(
        entryId
      )}`
    );

  useEffect(() => {
    setEpisodeQuery("");
    setEpisodePage(Math.max(0, Math.floor(currentIdx / 50)));
  }, [id, episodeId, currentIdx]);
  const filteredEntries = entries.filter((entry) =>
    [entry.label, entry.number]
      .join(" ")
      .toLocaleLowerCase()
      .includes(episodeQuery.trim().toLocaleLowerCase())
  );
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / 50));
  const visibleEntries = filteredEntries.slice(
    Math.min(episodePage, pageCount - 1) * 50,
    (Math.min(episodePage, pageCount - 1) + 1) * 50
  );
  const retry = () => {
    setFailed(false);
    void refetch();
  };
  const player = isLoading ? (
    <div
      role="status"
      className="flex aspect-video items-center justify-center gap-2 bg-black text-muted-foreground"
    >
      <Loader2 className="size-5 animate-spin" />
      {t("discover.loadingSources")}
    </div>
  ) : (!activeEmbed && !playbackSources.length) || isError || failed ? (
    <div
      role="alert"
      className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h2 className="font-display text-xl font-bold">
        {t("discover.unableToLoadEpisode")}
      </h2>
      <p className="max-w-lg text-sm text-muted-foreground">
        {error?.message ||
          (failed
            ? t("migration.streamFailed")
            : t("discover.unableToLoadEpisodeDesc"))}
      </p>
      <Button onClick={retry}>
        <RefreshCw className="mr-2 size-4" />
        {t("migration.retryPlayback")}
      </Button>
    </div>
  ) : (
    <>
      {" "}
      {activeEmbed ? (
        <EmbedPlayer
          key={`${activeServer?.key || "server"}:embed`}
          url={activeEmbed.url}
          poster={info?.image}
          language={activeEmbed.audioLanguage}
          referer={activeEmbed.headers?.Referer || activeEmbed.headers?.referer}
          onError={() => setFailed(true)}
        />
      ) : isMobileApp &&
        (activeSources[0]?.sourceType === "debrid" ||
          activeSources[0]?.sourceType === "torrent" ||
          /\.mkv(?:$|[?#])/i.test(
            playbackSources[0]?.originalUrl || playbackSources[0]?.url || ""
          )) ? (
        <NativeTorrentPlayer
          key={activeServer?.key || "native-server"}
          url={playbackSources[0].url}
          streamKind={
            activeSources[0]?.sourceType === "torrent" ? "torrent" : "debrid"
          }
          title={info?.title}
          poster={info?.image}
          subtitles={subtitles}
          headers={activeSources[0]?.headers}
          initialSeekSeconds={progress.initialPosition}
          onProgressUpdate={progress.save}
          onEpisodeEnd={next ? () => goEntry(next.id) : undefined}
          onBack={() =>
            navigate(`${base}/info/${encodeURIComponent(id || "")}`)
          }
          onError={() => setFailed(true)}
        />
      ) : isMobileApp ? (
        <MobileVideoPlayer
          key={activeServer?.key || "server"}
          sources={playbackSources}
          initialSeekSeconds={progress.initialPosition}
          onProgressUpdate={progress.save}
          episodeId={downloadIdentity.data}
          animeName={info?.title}
          episodeNumber={entries[currentIdx]?.number}
          subtitles={subtitles}
          headers={headers}
          poster={info?.image}
          isLoading={isLoading}
          serverName={activeServer?.label}
          onServerSwitch={onServerSwitch}
          onError={() => setFailed(true)}
          onEpisodeEnd={next ? () => goEntry(next.id) : undefined}
          onBack={() =>
            navigate(`${base}/info/${encodeURIComponent(id || "")}`)
          }
          episodeTitle={currentLabel}
        />
      ) : (
        <VideoPlayer
          key={activeServer?.key || "server"}
          sources={playbackSources}
          initialSeekSeconds={progress.initialPosition}
          onProgressUpdate={progress.save}
          episodeId={downloadIdentity.data}
          animeName={info?.title}
          episodeNumber={entries[currentIdx]?.number}
          subtitles={subtitles}
          headers={headers}
          poster={info?.image}
          isLoading={isLoading}
          serverName={activeServer?.label}
          onServerSwitch={onServerSwitch}
          onError={() => setFailed(true)}
          onEpisodeEnd={next ? () => goEntry(next.id) : undefined}
          onNextEpisode={next ? () => goEntry(next.id) : undefined}
          onPreviousEpisode={prev ? () => goEntry(prev.id) : undefined}
        />
      )}
    </>
  );
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Background />
      {!compact && <Sidebar />}
      <main className={watchMainClass(desktop)}>
        <div className="mb-4 flex min-w-0 items-center justify-between gap-3 md:mb-6">
          <button
            onClick={() =>
              navigate(`${base}/info/${encodeURIComponent(id || "")}`)
            }
            aria-label={t("animeDetail.backToInfo")}
            className="flex min-h-11 shrink-0 items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
            <span className="hidden sm:inline">{t("common.back")}</span>
          </button>
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate text-sm font-medium md:text-base">
              {info?.title || source?.name || t("animeDetail.watch")}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {source?.name}
            </p>
          </div>
        </div>
        {tracker.error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              {tracker.error}
              <Button variant="outline" size="sm" onClick={tracker.retry}>
                Retry sync
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div className={cn(WATCH_GRID_CLASS, "xl:grid xl:grid-cols-12")}>
          <div className={watchPlayerColumnClass()}>
            <div className={watchPlayerFrameClass(isMobileApp)}>{player}</div>
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <h1 className="font-display text-lg font-bold md:text-2xl">
                  {entries[currentIdx]?.number != null
                    ? `Episode ${entries[currentIdx].number}`
                    : currentLabel || t("animeDetail.watch")}
                </h1>
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                  {currentLabel}
                </p>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button
                  disabled={!prev}
                  onClick={() => prev && goEntry(prev.id)}
                  className={cn(
                    WATCH_EPISODE_NAV_CLASS,
                    "bg-muted hover:bg-muted/80"
                  )}
                >
                  <ChevronLeft className="size-4" />
                  {t("common.previous")}
                </button>
                <button
                  disabled={!next}
                  onClick={() => next && goEntry(next.id)}
                  className={cn(
                    WATCH_EPISODE_NAV_CLASS,
                    "bg-primary text-primary-foreground hover:bg-primary/80"
                  )}
                >
                  {t("common.next")}
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
            <GlassPanel className="p-4 md:p-5">
              <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Server className="size-4" />
                  {t("migration.servers")}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Refresh sources"
                    disabled={isFetching}
                    onClick={retry}
                  >
                    <RefreshCw
                      className={cn("size-4", isFetching && "animate-spin")}
                    />
                  </Button>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {servers.length} sources
                </span>
              </div>
              <SourceLanguageTabs
                sources={sources}
                activeLanguage={language}
                onLanguageChange={setLanguage}
              />
              <TooltipProvider>
                <div className="flex flex-wrap gap-2">
                  {servers.map((server, index) =>
                    language === "all" ||
                    server.sources.some(
                      (item) =>
                        normalizeWatchLanguageKey(item.audioLanguage) ===
                        language
                    ) ? (
                      <Tooltip key={server.key}>
                        <TooltipTrigger asChild>
                          <button
                            aria-pressed={index === serverIdx}
                            onClick={() => selectServer(index)}
                            className={cn(
                              "flex min-h-10 max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                              index === serverIdx
                                ? "border-primary/60 bg-primary/15 text-primary"
                                : "border-border bg-muted/50 hover:bg-muted"
                            )}
                          >
                            <Server className="size-3.5 shrink-0" />
                            <span className="truncate">{server.label}</span>
                            {server.sources[0]?.quality && (
                              <span className="text-xs opacity-70">
                                {server.sources[0].quality}
                              </span>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-semibold">
                            {source?.description || namespace}
                          </p>
                          <p>
                            {source?.name} ·{" "}
                            {source?.language || "All languages"}
                          </p>
                          <p>
                            {server.label} · {server.sources.length} qualities
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : null
                  )}
                </div>
              </TooltipProvider>
              {!isLoading && !servers.length && (
                <p className="text-sm text-muted-foreground">
                  No sources returned. Refresh to try again.
                </p>
              )}
              <SourceDebug
                kind="custom"
                sources={sources.map((item) => ({
                  providerKey: namespace,
                  providerName: item.source || source?.name,
                }))}
              />
            </GlassPanel>
            <CustomCatalogComments catalog={catalog} source={source} />
          </div>
          <aside className="min-w-0 xl:col-span-3">
            <GlassPanel className={WATCH_EPISODE_PANEL_CLASS}>
              <div className="mb-4 flex items-center gap-3">
                <ListVideo className="size-5 text-primary" />
                <h2 className="font-display text-base font-semibold md:text-lg">
                  {t("animeDetail.episodes")}
                </h2>
                <span className="ml-auto text-sm text-muted-foreground">
                  {entries.length}
                </span>
              </div>
              {entries.length > 10 && (
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    aria-label="Search episodes"
                    value={episodeQuery}
                    onChange={(event) => {
                      setEpisodeQuery(event.target.value);
                      setEpisodePage(0);
                    }}
                    placeholder="Search episodes"
                    className="h-9 w-full rounded-lg border border-border bg-muted/50 pl-9 pr-3 text-sm"
                  />
                </div>
              )}
              <div className="flex-1 space-y-2 overflow-y-auto pr-2 scrollbar-thin">
                {visibleEntries.map((entry) => (
                  <button
                    key={entry.id}
                    aria-current={entry.id === episodeId ? "true" : undefined}
                    onClick={() => goEntry(entry.id)}
                    className={cn(
                      "w-full rounded-xl p-2.5 text-left text-sm transition-colors md:p-3",
                      entry.id === episodeId
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold">
                        {entry.number != null
                          ? `Ep ${entry.number}`
                          : entry.label}
                      </span>
                      {entry.id === episodeId && (
                        <Play className="size-3.5 shrink-0 fill-current" />
                      )}
                    </div>
                    {entry.number != null && (
                      <p
                        className={cn(
                          "mt-1 truncate text-xs",
                          entry.id === episodeId
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground"
                        )}
                      >
                        {entry.label}
                      </p>
                    )}
                  </button>
                ))}
                {!visibleEntries.length && (
                  <p className="py-8 text-sm text-muted-foreground">
                    No episodes match.
                  </p>
                )}
              </div>
              {pageCount > 1 && (
                <nav
                  aria-label="Episode list pages"
                  className="mt-3 flex items-center justify-between gap-2"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous episode page"
                    disabled={episodePage <= 0}
                    onClick={() => setEpisodePage((value) => value - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {Math.min(episodePage + 1, pageCount)} / {pageCount}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next episode page"
                    disabled={episodePage >= pageCount - 1}
                    onClick={() => setEpisodePage((value) => value + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </nav>
              )}
            </GlassPanel>
          </aside>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
