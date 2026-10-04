/**
 * Custom-source watch page (`kind: 'watch'`).
 *
 * Fully isolated from the anime watchlist: it never reads or writes watch
 * history / continue-watching. It fetches `SourceResult[]` from the extension's
 * custom source and feeds the existing `VideoPlayer` (mapping to its
 * `PlaybackSource[]` contract), with prev/next episode navigation derived from
 * the source's own info entries.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Server } from "lucide-react";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { MobileVideoPlayer } from "@/components/video/MobileVideoPlayer";
import { EmbedPlayer } from "@/components/video/EmbedPlayer";
import type { PlaybackSource, ExternalSubtitle, PlaybackHeaders } from "@/components/video/VideoPlayer.types";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { cn } from "@/lib/utils";
import { useCustomWatch, useCustomInfo, useCustomSource } from "@/hooks/api/useCustomSource";
import type { SourceResult } from "@/core/extensions/sdk/types";
import { useIsMobileApp } from "@/hooks/ui/useIsNativeApp";

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
    const label = (s.server || s.source || `Server ${i + 1}`).trim() || `Server ${i + 1}`;
    let group = byKey.get(label);
    if (!group) {
      group = { key: label, label, sources: [] };
      byKey.set(label, group);
      groups.push(group);
    }
    group.sources.push(s);
  });
  return groups;
}

function toPlaybackSources(sources: SourceResult[]): PlaybackSource[] {
  return sources
    .filter((s) => s?.sourceType !== 'custom' && !(s as SourceResult & { isEmbed?: boolean }).isEmbed && s?.url && /^(https?:|mobile-proxy:|blob:|file:|\/)/i.test(String(s.url)))
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
  const first = sources.find((s) => Array.isArray(s.subtitles) && s.subtitles.length);
  if (!first) return [];
  return first.subtitles.map((t) => ({
    lang: t.language,
    url: t.url,
    label: t.label,
    originalUrl: (t as typeof t & { originalUrl?: string }).originalUrl,
    headers: (t as typeof t & { headers?: Record<string, string> }).headers || first.headers,
  }));
}

function toHeaders(sources: SourceResult[]): PlaybackHeaders | undefined {
  const h = sources.find((s) => s.headers && Object.keys(s.headers).length)?.headers;
  if (!h) return undefined;
  return { Referer: h.Referer || h.referer, "User-Agent": h["User-Agent"] || h["user-agent"] };
}

export default function CustomWatchPage() {
  const navigate = useNavigate();
  const isMobileApp = useIsMobileApp();
  const { namespace, sourceId, id, episodeId } = useParams<{
    namespace: string;
    sourceId: string;
    id: string;
    episodeId: string;
  }>();
  const { source } = useCustomSource(namespace, sourceId);
  const { data: info } = useCustomInfo(namespace, sourceId, id);
  const { data, isLoading, isError } = useCustomWatch(namespace, sourceId, id, episodeId);
  const [failed, setFailed] = useState(false);

  const sources = useMemo(() => data?.sources ?? [], [data?.sources]);
  const servers = useMemo(() => groupByServer(sources), [sources]);
  const [serverIdx, setServerIdx] = useState(0);

  // Reset to the first server whenever the episode (hence the source set) changes.
  useEffect(() => {
    setServerIdx(0);
    setFailed(false);
  }, [episodeId, servers.length]);

  const activeServer = servers[serverIdx] ?? servers[0];
  const activeSources = useMemo(() => activeServer?.sources ?? [], [activeServer]);
  const activeEmbed = activeSources.find((source) => (
    source.sourceType === 'custom' || (source as SourceResult & { isEmbed?: boolean }).isEmbed
  ));
  const playbackSources = useMemo(() => toPlaybackSources(activeSources), [activeSources]);
  const subtitles = useMemo(() => toSubtitles(activeSources), [activeSources]);
  const headers = useMemo(() => toHeaders(activeSources), [activeSources]);

  const selectServer = (idx: number) => {
    if (idx === serverIdx) return;
    setServerIdx(idx);
    setFailed(false);
  };
  // "Try another server" from the player's error overlay: advance (wrapping).
  const onServerSwitch =
    servers.length > 1 ? () => selectServer((serverIdx + 1) % servers.length) : undefined;

  const entries = info?.entries ?? [];
  const currentIdx = entries.findIndex((e) => e.id === episodeId);
  const prev = currentIdx > 0 ? entries[currentIdx - 1] : null;
  const next = currentIdx >= 0 && currentIdx < entries.length - 1 ? entries[currentIdx + 1] : null;
  const currentLabel = currentIdx >= 0 ? entries[currentIdx].label : episodeId;

  const base = `/x/${namespace}/${sourceId}`;
  const goEntry = (entryId: string) => navigate(`${base}/watch/${id}/${encodeURIComponent(entryId)}`);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-white/10 bg-black/50 px-3 py-2 backdrop-blur">
        <button
          onClick={() => navigate(`${base}/info/${encodeURIComponent(id || "")}`)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-sm font-semibold hover:bg-white/10"
          title="Back to info"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          disabled={!prev}
          onClick={() => prev && goEntry(prev.id)}
          className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center px-2 text-center">
          <span className="w-full truncate text-sm font-bold">{info?.title || source?.name || "Watch"}</span>
          <span className="w-full truncate text-xs text-muted-foreground">{currentLabel}</span>
        </div>
        <button
          disabled={!next}
          onClick={() => next && goEntry(next.id)}
          className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-40"
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-auto w-full max-w-6xl px-3 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading sources…
          </div>
        ) : (!activeEmbed && playbackSources.length === 0) || isError || failed ? (
          <GlassPanel className="mx-auto max-w-xl border border-white/10 p-6">
            <h2 className="text-xl font-bold">Unable to load this episode</h2>
            <p className="mt-2 text-muted-foreground">
              {servers.length > 1
                ? "This server returned no playable stream. Try another server below, or a different episode."
                : "The source returned no playable streams. Try another episode or check that the extension is running."}
            </p>
            {servers.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {servers.map((srv, idx) => (
                  <button
                    key={srv.key}
                    onClick={() => selectServer(idx)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition active:scale-95",
                      idx === serverIdx
                        ? "border-primary/60 bg-primary/20 text-foreground"
                        : "border-white/15 bg-white/5 text-muted-foreground hover:bg-white/10",
                    )}
                  >
                    <Server className="h-4 w-4" />
                    <span className="truncate">{srv.label}</span>
                  </button>
                ))}
              </div>
            )}
          </GlassPanel>
        ) : (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
              {activeEmbed ? (
                <EmbedPlayer
                  key={`${activeServer?.key || "server"}:embed`}
                  url={activeEmbed.url}
                  poster={info?.image}
                  language={activeEmbed.audioLanguage}
                  referer={activeEmbed.headers?.Referer || activeEmbed.headers?.referer}
                  onError={() => setFailed(true)}
                />
              ) : isMobileApp ? (
                <MobileVideoPlayer
                  key={activeServer?.key || "server"}
                  sources={playbackSources}
                  subtitles={subtitles}
                  headers={headers}
                  poster={info?.image}
                  isLoading={isLoading}
                  serverName={activeServer?.label}
                  onServerSwitch={onServerSwitch}
                  onError={() => setFailed(true)}
                  onEpisodeEnd={next ? () => goEntry(next.id) : undefined}
                  onBack={() => navigate(`${base}/info/${encodeURIComponent(id || "")}`)}
                  episodeTitle={currentLabel}
                />
              ) : (
                <VideoPlayer
                  key={activeServer?.key || "server"}
                  sources={playbackSources}
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
            </div>

            {servers.length > 1 && (
              <GlassPanel className="border border-white/10 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Server className="h-4 w-4" /> Servers
                </div>
                <div className="flex flex-wrap gap-2">
                  {servers.map((srv, idx) => (
                    <button
                      key={srv.key}
                      onClick={() => selectServer(idx)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition active:scale-95",
                        idx === serverIdx
                          ? "border-primary/60 bg-primary/20 text-foreground"
                          : "border-white/15 bg-white/5 text-muted-foreground hover:bg-white/10",
                      )}
                    >
                      <span className="truncate">{srv.label}</span>
                      <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-[11px] font-medium">
                        {srv.sources.length}
                      </span>
                    </button>
                  ))}
                </div>
              </GlassPanel>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
