import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X, CheckCircle2, Circle, FolderOpen, Loader2, Play, BookOpen, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useMangaDownload } from '@/hooks/media/useMangaDownload';
import { mangaJobId } from '@/core/download/manga-download-monitor';
import type { MappedMangaChapter, MangaChapterSource } from '@/types/manga';
import type { MangaDownloadChapter, MangaKind } from '@/types/electron-bridge';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';

// Same reliability order the reader uses for cross-source fallback (mirrors
// MangaPage's MANGA_PROVIDER_RELIABILITY). Deterministic mappers first,
// best-effort/CF-gated sources last, so the primary source we download is the
// most trustworthy and the alternatives cascade sensibly in the main process.
const MANGA_PROVIDER_RELIABILITY = [
  'mangadex', 'mangapill', 'mangakatana', 'weebcentral',
  'nelomanga', 'comick', 'atsu', 'webtoons', 'demonicscans',
];
function reliabilityRank(provider?: string | null): number {
  const idx = MANGA_PROVIDER_RELIABILITY.indexOf(String(provider || '').toLowerCase());
  return idx === -1 ? MANGA_PROVIDER_RELIABILITY.length : idx;
}
function sortedSources(chapter: MappedMangaChapter): MangaChapterSource[] {
  return [...(chapter.sources || [])].sort(
    (a, b) => reliabilityRank(a.provider) - reliabilityRank(b.provider),
  );
}

interface MangaDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: MappedMangaChapter[];
  anilistId: number;
  title: string;
  posterUrl?: string | null;
  /** manga | manhwa | manhua — for the Dynamic Island badge. */
  kind?: MangaKind;
}

/** A row we can actually download: a mapped chapter that has ≥1 source. */
interface DownloadableRow {
  key: string;               // best source chapterKey — the selection id + jobId seed
  jobId: string;
  label: string;             // "Ch. 12" / "Vol 2 · Ch. 12"
  subtitle?: string;
  chapterNumber: number | null;
  payload: MangaDownloadChapter;
}

export const MangaDownloadModal = ({
  isOpen, onClose, chapters, anilistId, title, posterUrl, kind,
}: MangaDownloadModalProps) => {
  const { isEnabled, downloadStates, enqueueAll } = useMangaDownload();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isStarting, setIsStarting] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [downloadPath, setDownloadPath] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('tatakai_download_path') : '';
    setDownloadPath(saved || '');
  }, [isOpen]);

  // Build downloadable rows: skip chapters with no sources, map best source →
  // primary payload, remaining reliability-sorted sources → alternatives.
  const rows = useMemo<DownloadableRow[]>(() => {
    const ordered = [...chapters].sort((a, b) => a.canonicalOrder - b.canonicalOrder);
    const out: DownloadableRow[] = [];
    for (const ch of ordered) {
      const srcs = sortedSources(ch);
      if (!srcs.length) continue;
      const [best, ...rest] = srcs;
      const numLabel = ch.chapterNumber != null ? `Ch. ${ch.chapterNumber}` : 'Chapter';
      const volLabel = ch.volume != null ? `Vol ${ch.volume} · ` : '';
      out.push({
        key: best.chapterKey,
        jobId: mangaJobId(anilistId, best.chapterKey),
        label: `${volLabel}${numLabel}`,
        subtitle: ch.chapterTitle || undefined,
        chapterNumber: ch.chapterNumber,
        payload: {
          chapterKey: best.chapterKey,
          provider: best.provider,
          providerChapterId: best.providerChapterId,
          chapterNumber: ch.chapterNumber,
          volume: ch.volume,
          language: best.language ?? undefined,
          alternatives: rest.map((s) => ({
            provider: s.provider,
            chapterKey: s.chapterKey,
            providerChapterId: s.providerChapterId,
          })),
        },
      });
    }
    return out;
  }, [chapters, anilistId]);

  const toggle = (key: string) => {
    void triggerHaptic('select');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    void triggerHaptic('select');
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.key))));
  };

  // Apply a from–to chapter-number range as an additive selection.
  const applyRange = () => {
    const from = parseFloat(rangeFrom);
    const to = parseFloat(rangeTo);
    if (!Number.isFinite(from) && !Number.isFinite(to)) return;
    void triggerHaptic('select');
    const lo = Number.isFinite(from) ? from : -Infinity;
    const hi = Number.isFinite(to) ? to : Infinity;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (r.chapterNumber != null && r.chapterNumber >= lo && r.chapterNumber <= hi) next.add(r.key);
      }
      return next;
    });
  };

  const handleDownload = async () => {
    const picked = rows.filter((r) => selected.has(r.key));
    if (!picked.length) return;
    void triggerHaptic('medium');
    setIsStarting(true);
    try {
      const res = await enqueueAll(
        { anilistId, title, posterUrl, kind, downloadPath: downloadPath || undefined },
        picked.map((r) => r.payload),
      );
      if (res.ok) {
        void triggerHaptic('success');
        toast.success(`Queued ${picked.length} chapter${picked.length > 1 ? 's' : ''} for download`);
      } else if (res.reason === 'not_desktop') {
        toast.error('Manga downloads require the Tatakai desktop app');
      } else if (res.reason === 'feature_disabled') {
        toast.error('Manga downloads are disabled');
      } else {
        void triggerHaptic('error');
        toast.error('Failed to queue downloads', {
          description: typeof res.error === 'string' ? res.error : undefined,
        });
      }
    } finally {
      setIsStarting(false);
    }
  };

  if (!isOpen) return null;

  // Portal to <body>: page trees contain transformed ancestors (animations,
  // parallax) that turn `position: fixed` into page-relative positioning —
  // the sheet would land mid-page instead of on the visible screen.
  const sheet = (
    <div className="fixed z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in inset-0 sm:p-4 p-0">
      <div className="w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <GlassPanel className="p-4 sm:p-6 space-y-4 sm:space-y-5 max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Download className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              Download chapters
            </h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {!isEnabled && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Manga downloads require the Tatakai native app.
            </div>
          )}

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <BookOpen className="w-10 h-10 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground text-sm">No downloadable chapters found.</p>
            </div>
          ) : (
            <>
              {/* Selection controls */}
              <div className="flex items-center justify-between px-0.5">
                <span className="text-xs text-muted-foreground">
                  {selected.size > 0 ? `${selected.size}/${rows.length} selected` : 'Select chapters to download'}
                </span>
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-primary hover:text-primary/80 text-xs h-7 px-2">
                  {selected.size === rows.length ? 'Deselect all' : 'Select all'}
                </Button>
              </div>

              {/* Range picker */}
              <div className="flex items-end gap-2 rounded-xl bg-white/[0.03] border border-white/10 p-3">
                <div className="flex-1">
                  <label className="text-[11px] text-muted-foreground block mb-1">From ch.</label>
                  <Input
                    type="number" inputMode="decimal" value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    placeholder="1" className="h-9"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-muted-foreground block mb-1">To ch.</label>
                  <Input
                    type="number" inputMode="decimal" value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    placeholder="20" className="h-9"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={applyRange} className="h-9">
                  Add range
                </Button>
              </div>

              {/* Chapter list — taller on mobile bottom-sheet so fewer scrolls */}
              <ScrollArea className="h-[38dvh] sm:h-[300px] min-h-[220px] rounded-xl border border-white/10 bg-white/[0.03]">
                <div className="grid grid-cols-1 gap-1.5 p-1.5">
                  {rows.map((r) => {
                    const state = downloadStates[r.jobId];
                    const isSelected = selected.has(r.key);
                    const busy = state?.status === 'downloading' || state?.status === 'queued';
                    return (
                      <div
                        key={r.key}
                        onClick={() => !busy && toggle(r.key)}
                        className={`flex items-center justify-between p-2 sm:p-2.5 rounded-lg border transition-colors cursor-pointer ${
                          isSelected ? 'bg-primary/10 border-primary/30' : 'bg-white/[0.02] border-transparent hover:border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          {isSelected
                            ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
                            : <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />}
                          <div className="min-w-0">
                            <span className="font-bold text-sm sm:text-base">{r.label}</span>
                            {r.subtitle && <span className="text-xs text-muted-foreground block truncate max-w-[150px] sm:max-w-[300px]">{r.subtitle}</span>}
                          </div>
                        </div>
                        {state && (
                          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                            {state.status === 'downloading' && (
                              <div className="text-right">
                                <span className="text-[10px] sm:text-xs font-mono text-primary">{state.progress > 0 ? `${state.progress.toFixed(0)}%` : '...'}</span>
                                <div className="w-12 sm:w-20 h-1 bg-muted rounded-full overflow-hidden mt-1">
                                  <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${state.progress}%` }} />
                                </div>
                              </div>
                            )}
                            {state.status === 'queued' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                            {state.status === 'completed' && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />}
                            {(state.status === 'failed' || state.status === 'cancelled') && <X className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex items-center text-[10px] sm:text-xs text-muted-foreground px-1">
                <FolderOpen className="w-3 h-3 flex-shrink-0 mr-1" />
                <span className="truncate">{downloadPath || 'Default library folder'}</span>
              </div>

              <Button
                onClick={handleDownload}
                disabled={selected.size === 0 || isStarting || !isEnabled}
                className="sticky bottom-[max(0px,env(safe-area-inset-bottom))] z-20 w-full h-14 sm:h-16 rounded-xl sm:rounded-2xl font-bold glow-primary flex-col gap-0.5 shadow-[0_-18px_36px_hsl(var(--background))]"
              >
                {isStarting ? (
                  <span className="flex items-center text-base sm:text-lg"><Loader2 className="w-5 h-5 mr-2 animate-spin" />Queuing…</span>
                ) : (
                  <span className="flex items-center text-base sm:text-lg">
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    {selected.size > 0 ? `Download ${selected.size} chapter${selected.size > 1 ? 's' : ''}` : 'Select chapters'}
                  </span>
                )}
              </Button>
            </>
          )}
        </GlassPanel>
      </div>
    </div>
  );
  if (typeof document === 'undefined') return sheet;
  return createPortal(sheet, document.body);
};
