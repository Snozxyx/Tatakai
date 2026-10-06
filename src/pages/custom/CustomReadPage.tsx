/**
 * Custom-source read page (`kind: 'read'`).
 *
 * Fully isolated from the manga readlist: it never reads or writes reading
 * progress / continue-reading. It fetches `CustomReadPage[]` from the extension's
 * custom source and renders them through the shared `ReaderImage` strip (the same
 * blob/proxy component the manga reader uses), reusing `useReaderSettings` for
 * width/gap/mode so a user's reader prefs carry over. Prev/next chapter navigation
 * is derived from the source's own info entries.
 */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { ReaderImage } from "@/components/reader/ReaderImage";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useReaderSettings } from "@/hooks/media/useReaderSettings";
import { getProfileKnobs } from "@/lib/memoryProfile";
import { readerPageRenderKey } from "@/lib/reader/imageLifecycle";
import { useCustomRead, useCustomInfo, useCustomSource } from "@/hooks/api/useCustomSource";

export default function CustomReadPage() {
  const navigate = useNavigate();
  const { namespace, sourceId, id, chapterId } = useParams<{
    namespace: string;
    sourceId: string;
    id: string;
    chapterId: string;
  }>();
  const { source } = useCustomSource(namespace, sourceId);
  const { data: info } = useCustomInfo(namespace, sourceId, id);
  const { data, isLoading, isError } = useCustomRead(namespace, sourceId, id, chapterId);
  const { settings } = useReaderSettings();

  const pages = data?.pages ?? [];
  const total = pages.length;
  const [pageIndex, setPageIndex] = useState(0);

  // Reset to first page whenever the chapter changes.
  useEffect(() => setPageIndex(0), [chapterId]);

  const entries = info?.entries ?? [];
  const currentIdx = entries.findIndex((e) => e.id === chapterId);
  const prev = currentIdx > 0 ? entries[currentIdx - 1] : null;
  const next = currentIdx >= 0 && currentIdx < entries.length - 1 ? entries[currentIdx + 1] : null;
  const currentLabel = currentIdx >= 0 ? entries[currentIdx].label : chapterId;

  const base = `/x/${namespace}/${sourceId}`;
  const goEntry = (entryId: string) => navigate(`${base}/read/${id}/${encodeURIComponent(entryId)}`);

  const widthStyle: CSSProperties = useMemo(
    () =>
      settings.sizing === "natural"
        ? { width: "auto", maxWidth: "100%" }
        : { width: `${settings.widthPercent}%`, maxWidth: "100%" },
    [settings.sizing, settings.widthPercent],
  );

  const eagerFor = (idx: number) => {
    // 'partial' is the reader default; when untouched, the active memory profile
    // picks the preload window (none on Low, full on Unlimited).
    const effectivePreloading =
      settings.preloading === "partial" ? getProfileKnobs().readerPreload : settings.preloading;
    if (settings.loadingStrategy === "eager" || effectivePreloading === "full") return true;
    const win = effectivePreloading === "none" ? 1 : 3;
    return Math.abs(idx - pageIndex) <= win;
  };

  const goNextPage = () => setPageIndex((i) => Math.min(total - 1, i + 1));
  const goPrevPage = () => setPageIndex((i) => Math.max(0, i - 1));
  const progressPct = total ? ((pageIndex + 1) / total) * 100 : 0;
  const progressLabel = `${Math.min(pageIndex + 1, total || 1)} / ${total || "…"}`;

  return (
    <div className="relative min-h-screen text-foreground" style={{ backgroundColor: settings.backgroundColor }}>
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
          <span className="w-full truncate text-sm font-bold">{info?.title || source?.name || "Read"}</span>
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

      <div className="mx-auto w-full max-w-5xl px-3 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading pages…
          </div>
        ) : total === 0 || isError ? (
          <GlassPanel className="mx-auto max-w-xl border border-white/10 p-6">
            <h2 className="text-xl font-bold">Unable to load this chapter</h2>
            <p className="mt-2 text-muted-foreground">
              The source returned no pages. Try another chapter or check that the extension is running.
            </p>
          </GlassPanel>
        ) : settings.readingMode === "vertical" ? (
          <div className="flex flex-col items-center" style={{ gap: `${settings.gap}px` }}>
            {pages.map((page, idx) => (
              <ReaderImage
                key={readerPageRenderKey(chapterId || "", page)}
                page={page}
                mode={settings.loadingMethod}
                style={widthStyle}
                eager={eagerFor(idx)}
              />
            ))}
          </div>
        ) : (
          <div className="relative flex min-h-full items-center justify-center">
            {pages[pageIndex] ? (
              <ReaderImage key={readerPageRenderKey(chapterId || "", pages[pageIndex])} page={pages[pageIndex]} mode={settings.loadingMethod} style={widthStyle} eager />
            ) : null}
            {settings.clickToTurn ? (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Previous page"
                  onClick={(e) => {
                    goPrevPage();
                    // Keep the invisible tap zone from holding focus and
                    // painting a focus ring over the page on keyboard use.
                    e.currentTarget.blur();
                  }}
                  className="absolute left-0 top-0 h-full w-1/3 cursor-w-resize bg-transparent outline-none focus:outline-none focus-visible:outline-none"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label="Next page"
                  onClick={(e) => {
                    goNextPage();
                    e.currentTarget.blur();
                  }}
                  className="absolute right-0 top-0 h-full w-1/3 cursor-e-resize bg-transparent outline-none focus:outline-none focus-visible:outline-none"
                />
              </>
            ) : null}
          </div>
        )}
      </div>

      {total > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
          {settings.showProgressBar ? (
            <div className="h-1 w-full bg-white/10">
              <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          ) : null}
          <div className="flex justify-center py-2">
            <span className="pointer-events-auto rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              {progressLabel}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
