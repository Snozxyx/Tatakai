import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, X, CheckCircle2, Circle, Loader2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { MappedNovelChapter } from '@/types/novel';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import {
  downloadNovelChapter,
  downloadAllNovelChapters,
  isNovelChapterDownloaded,
} from '@/core/download/novelOffline';
import { markNovelCancelled } from '@/core/download/novel-download-monitor';

interface NovelDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  novelId: string;
  chapters: MappedNovelChapter[];
  anilistId: number;
  title: string;
  posterUrl?: string | null;
  preferredProvider?: string;
}

interface DownloadableRow {
  key: string;
  label: string;
  subtitle?: string;
  chapterNumber: number | null;
  chapter: MappedNovelChapter;
}

export const NovelDownloadModal = ({
  isOpen, onClose, novelId, chapters, anilistId, title, posterUrl, preferredProvider,
}: NovelDownloadModalProps) => {
  useUiTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const bulkCancelRef = useRef(false);

  const rows = useMemo<DownloadableRow[]>(() => {
    const ordered = [...chapters].sort((a, b) => a.canonicalOrder - b.canonicalOrder);
    const out: DownloadableRow[] = [];
    for (const ch of ordered) {
      if (!ch.sources?.length) continue;
      const numLabel = ch.chapterNumber != null ? uiI18n.t('app.ch_i18n_value_0_4d827531', { value0: ch.chapterNumber }) : uiI18n.t('app.chapter_46b00590');
      out.push({
        key: `${ch.canonicalOrder}:${ch.chapterNumber ?? ch.chapterTitle ?? '?'}`,
        label: numLabel,
        subtitle: ch.chapterTitle || undefined,
        chapterNumber: ch.chapterNumber,
        chapter: ch,
      });
    }
    return out;
  }, [chapters]);

  // Refresh downloaded state whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set());
    setBulkProgress(null);
    let cancelled = false;
    void (async () => {
      const done = new Set<string>();
      for (const row of rows) {
        const keys = (row.chapter.sources || []).map((s) => s.chapterKey);
        for (const key of keys) {
          if (await isNovelChapterDownloaded(anilistId, key).catch(() => false)) {
            done.add(row.key);
            break;
          }
        }
        if (cancelled) return;
      }
      if (!cancelled) setDownloaded(done);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, rows, anilistId]);

  useEffect(() => {
    if (!isOpen) return;
    const onUpdate = () => {
      void (async () => {
        const done = new Set<string>();
        for (const row of rows) {
          const keys = (row.chapter.sources || []).map((s) => s.chapterKey);
          for (const key of keys) {
            if (await isNovelChapterDownloaded(anilistId, key).catch(() => false)) {
              done.add(row.key);
              break;
            }
          }
        }
        setDownloaded(done);
      })();
    };
    window.addEventListener('tatakai:offline-novels-updated', onUpdate);
    return () => window.removeEventListener('tatakai:offline-novels-updated', onUpdate);
  }, [isOpen, rows, anilistId]);

  if (!isOpen) return null;

  const toggle = (key: string) => {
    void triggerHaptic('select');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    void triggerHaptic('select');
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.key)),
    );
  };

  const downloadOne = async (row: DownloadableRow) => {
    if (busy.has(row.key)) return;
    setBusy((prev) => new Set(prev).add(row.key));
    try {
      const ok = await downloadNovelChapter({
        novelId,
        anilistId,
        novelTitle: title,
        novelPoster: posterUrl,
        chapter: row.chapter,
      });
      if (ok) {
        setDownloaded((prev) => new Set(prev).add(row.key));
        toast.success(uiI18n.t('app.downloaded_i18n_value_0_a05eaf9c', { value0: row.label }));
      } else {
        toast.error(uiI18n.t('app.no_text_available_for_i18n_value_0_71a4c521', { value0: row.label }));
      }
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(row.key);
        return next;
      });
    }
  };

  const downloadSelected = async () => {
    const targets = rows.filter((r) => selected.has(r.key));
    if (targets.length === 0) {
      toast.error(uiI18n.t('app.select_at_least_one_chapter_8f3c5fc6'));
      return;
    }
    setBulkRunning(true);
    bulkCancelRef.current = false;
    setBulkProgress({ done: 0, total: targets.length });
    let ok = 0;
    let done = 0;
    for (const row of targets) {
      if (bulkCancelRef.current) break;
      const success = await downloadNovelChapter({
        novelId,
        anilistId,
        novelTitle: title,
        novelPoster: posterUrl,
        chapter: row.chapter,
      }).catch(() => false);
      if (success) {
        ok += 1;
        setDownloaded((prev) => new Set(prev).add(row.key));
      }
      done += 1;
      setBulkProgress({ done, total: targets.length });
    }
    const wasCancelled = bulkCancelRef.current;
    setBulkRunning(false);
    setBulkProgress(null);
    bulkCancelRef.current = false;
    if (wasCancelled) toast.message(uiI18n.t('app.stopped_downloaded_i18n_value_0_i18n_value_1_cha_fa29049a', { value0: ok, value1: targets.length }));
    else toast.success(uiI18n.t('app.downloaded_i18n_value_0_i18n_value_1_chapters_fo_3fd32f56', { value0: ok, value1: targets.length }));
  };

  const cancelBulk = () => {
    bulkCancelRef.current = true;
    // Mark in-flight monitor rows cancelled so the Island clears them.
    for (const row of rows) {
      const key = row.chapter.sources?.[0]?.chapterKey;
      if (key) markNovelCancelled(`novel:${anilistId}:${key}`);
    }
    setBulkRunning(false);
    setBulkProgress(null);
  };

  const downloadAll = async () => {
    setBulkRunning(true);
    bulkCancelRef.current = false;
    setBulkProgress({ done: 0, total: rows.length });
    const res = await downloadAllNovelChapters(
      novelId,
      anilistId,
      title,
      posterUrl,
      rows.map((r) => r.chapter),
      preferredProvider,
      (done, total) => setBulkProgress({ done, total }),
      () => bulkCancelRef.current,
    ).catch(() => ({ downloaded: 0, failed: rows.length, cancelled: 0, total: rows.length }));
    setBulkRunning(false);
    setBulkProgress(null);
    bulkCancelRef.current = false;
    if (res.cancelled > 0) toast.message(uiI18n.t('app.stopped_downloaded_i18n_value_0_i18n_value_1_cha_fa29049a', { value0: res.downloaded, value1: res.total }));
    else if (res.downloaded > 0) toast.success(uiI18n.t('app.downloaded_i18n_value_0_i18n_value_1_chapters_e117fbca', { value0: res.downloaded, value1: res.total }));
    else toast.error(uiI18n.t('app.no_chapters_could_be_downloaded_07f89dea'));
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <GlassPanel className="relative w-full max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black">{uiI18n.t('app.download_novel_76ab0d3c')}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {title} · {rows.length} {uiI18n.t('app.chapters_stored_on_this_device_d0fc118a')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={uiI18n.t('app.close_bbfa773e')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-5 py-3">
          <Button size="sm" variant="outline" onClick={toggleAll} className="h-8 rounded-lg text-xs font-bold">
            {selected.size === rows.length ? uiI18n.t('app.deselect_all_85cce1e1') : uiI18n.t('app.select_all_913afff1')}
          </Button>
          <Button
            size="sm"
            onClick={downloadSelected}
            disabled={bulkRunning || selected.size === 0}
            className="h-8 rounded-lg text-xs font-bold"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {uiI18n.t('app.download_selected_b44c351e')}{selected.size})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={downloadAll}
            disabled={bulkRunning || rows.length === 0}
            className="h-8 rounded-lg text-xs font-bold"
          >
            {bulkRunning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <BookOpen className="mr-1.5 h-3.5 w-3.5" />}
            {bulkProgress ? uiI18n.t('app.downloading_i18n_value_0_i18n_value_1_6c7cca00', { value0: bulkProgress.done, value1: bulkProgress.total }) : uiI18n.t('app.download_all_d69edf7c')}
          </Button>
          {bulkRunning && (
            <Button
              size="sm"
              variant="destructive"
              onClick={cancelBulk}
              className="h-8 rounded-lg text-xs font-bold"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              {uiI18n.t('app.stop_9e253470')}
            </Button>
          )}
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {downloaded.size}/{rows.length} {uiI18n.t('app.offline_d1ffda5d')}
          </span>
        </div>

        {bulkProgress && (
          <div className="h-1 w-full bg-white/5">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${bulkProgress.total > 0 ? Math.round((bulkProgress.done / bulkProgress.total) * 100) : 0}%` }}
            />
          </div>
        )}

        <ScrollArea className="max-h-[55vh] px-3 py-2">
          <div className="space-y-1 p-2">
            {rows.map((row) => {
              const isDone = downloaded.has(row.key);
              const isBusy = busy.has(row.key) || bulkRunning;
              const isSelected = selected.has(row.key);
              return (
                <div
                  key={row.key}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${isSelected ? 'border-primary/40 bg-primary/10' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                >
                  <button
                    onClick={() => toggle(row.key)}
                    aria-label={isSelected ? uiI18n.t('app.deselect_i18n_value_0_6a9a1c3d', { value0: row.label }) : uiI18n.t('app.select_i18n_value_0_ad7d83f4', { value0: row.label })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center"
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Circle className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{row.label}</p>
                    {row.subtitle && <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>}
                  </div>
                  {isDone && (
                    <span className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                      {uiI18n.t('app.offline_e01fa717')}
                    </span>
                  )}
                  <button
                    onClick={() => void downloadOne(row)}
                    disabled={isBusy}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50"
                    aria-label={uiI18n.t('app.download_i18n_value_0_741a37b3', { value0: row.label })}
                  >
                    {busy.has(row.key) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {uiI18n.t('app.no_downloadable_chapters_install_the_toko_novel__d40b0ed0')}
              </p>
            )}
          </div>
        </ScrollArea>
      </GlassPanel>
    </div>,
    document.body,
  );
};
