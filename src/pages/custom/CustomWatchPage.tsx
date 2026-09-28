/**
 * Custom-source watch page (`kind: 'watch'`).
 *
 * Fully isolated from the anime watchlist: it never reads or writes watch
 * history / continue-watching. It fetches `SourceResult[]` from the extension's
 * custom source and feeds the existing `VideoPlayer` (mapping to its
 * `PlaybackSource[]` contract), with prev/next episode navigation derived from
 * the source's own info entries.
 */

import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import type { PlaybackSource, ExternalSubtitle, PlaybackHeaders } from "@/components/video/VideoPlayer.types";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useCustomWatch, useCustomInfo, useCustomSource } from "@/hooks/api/useCustomSource";
import type { SourceResult } from "@/core/extensions/sdk/types";

function toPlaybackSources(sources: SourceResult[]): PlaybackSource[] {
  return sources
    .filter((s) => s?.url && /^(https?:|blob:|file:|\/)/i.test(String(s.url)))
    .map((s) => ({
      url: s.url,
      isM3U8: s.sourceType === "hls" || /\.m3u8/i.test(s.url),
      quality: s.quality,
      sourceType: s.sourceType,
    }));
}

function toSubtitles(sources: SourceResult[]): ExternalSubtitle[] {
  const first = sources.find((s) => Array.isArray(s.subtitles) && s.subtitles.length);
  if (!first) return [];
  return first.subtitles.map((t) => ({ lang: t.language, url: t.url, label: t.label }));
}

function toHeaders(sources: SourceResult[]): PlaybackHeaders | undefined {
  const h = sources.find((s) => s.headers && Object.keys(s.headers).length)?.headers;
  if (!h) return undefined;
  return { Referer: h.Referer || h.referer, "User-Agent": h["User-Agent"] || h["user-agent"] };
}

export default function CustomWatchPage() {
  const navigate = useNavigate();
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

  const sources = data?.sources ?? [];
  const playbackSources = useMemo(() => toPlaybackSources(sources), [sources]);
  const subtitles = useMemo(() => toSubtitles(sources), [sources]);
  const headers = useMemo(() => toHeaders(sources), [sources]);

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
        ) : playbackSources.length === 0 || isError || failed ? (
          <GlassPanel className="mx-auto max-w-xl border border-white/10 p-6">
            <h2 className="text-xl font-bold">Unable to load this episode</h2>
            <p className="mt-2 text-muted-foreground">
              The source returned no playable streams. Try another episode or check that the extension is running.
            </p>
          </GlassPanel>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
            <VideoPlayer
              sources={playbackSources}
              subtitles={subtitles}
              headers={headers}
              poster={info?.image}
              isLoading={isLoading}
              serverName={sources[0]?.source}
              onError={() => setFailed(true)}
              onEpisodeEnd={next ? () => goEntry(next.id) : undefined}
              onNextEpisode={next ? () => goEntry(next.id) : undefined}
              onPreviousEpisode={prev ? () => goEntry(prev.id) : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}
