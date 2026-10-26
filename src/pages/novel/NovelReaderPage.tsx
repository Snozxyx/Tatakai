import { useReadingViewTracker } from '@/hooks/user/useReadingViews';
import { readingViewId } from '@/lib/readingViewId';
import uiI18n from '@/lib/uiI18n';
import { useTVReader } from '@/core/tv/useTVReader';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
/**
 * NovelReaderPage — immersive text reader.
 *
 * Twin of MangaReaderPage for prose: chapter text (not pages), with
 * - typography from Novel Reader settings (font presets + custom fonts,
 *   size, line/paragraph spacing, measure, colours)
 * - continuous scroll (next chapter loads at the end)
 * - progress bar (percent read + chapter number), fullscreen, keep-awake
 * - WebNovel-style per-paragraph comment threads
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Settings2, Loader2, MessageSquare,
  Play, Pause, Square, Maximize, Minimize, List, Volume2, ChevronDown, ChevronUp,
  Languages,
} from 'lucide-react';
import { getNovelContentByKey } from '@/core/content/novel-client';
import { getOfflineNovelChapters } from '@/core/download/novelOffline';
import { useNovelReaderSettings, resolveFontStack } from '@/hooks/media/useNovelReaderSettings';
import { useNovelDetail, useNovelChapters } from '@/hooks/api/useNovelData';
import { useSaveNovelReadingProgress } from '@/hooks/user/useNovelReadlist';
import { useAuth } from '@/contexts/AuthContext';
import { Background } from '@/components/layout/Background';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ReaderPanel } from '@/components/settings/panels/ReaderPanel';
import { NovelReaderPanel } from '@/components/settings/panels/NovelReaderPanel';
import { Comments } from '@/components/comments/Comments';
import { NovelNarrator, narratorEngineLabel, type NarratorBackend } from '@/lib/novel/narrator';
import { loadTtsIntegrations } from '@/lib/novel/ttsIntegrations';
import { setReadingNovelRpc, clearDiscordRpc } from '@/lib/discordRpc';
import { ParagraphCommentButton, ParagraphThread } from '@/components/novel/ParagraphComments';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { useNovelTranslation, type NovelTranslationState } from '@/hooks/translation/useNovelTranslation';
import { useTranslationConfig } from '@/hooks/translation/useTranslationConfig';
import { cn } from '@/lib/utils';
import type { NovelChapterSource } from '@/types/novel';
import { toast } from 'sonner';
import { ReaderSelectionComment } from '@/components/novel/ReaderSelectionComment';
import type { CommentQuoteDraft } from '@/lib/commentQuotes';

export default function NovelReaderPage() {
  useUiTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isNative = useIsNativeApp();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { novelId } = useParams<{ novelId: string }>();
  const [searchParams] = useSearchParams();

  const { settings, updateSetting, customFonts } = useNovelReaderSettings();

  const chapterKey = searchParams.get('chapterKey') || '';
  const provider = searchParams.get('provider') || '';
  const providerChapterId = searchParams.get('providerChapterId') || '';
  const chapterNumberParam = searchParams.get('chapterNumber');
  const chapterTitleParam = searchParams.get('chapterTitle');
  const paragraphParam = Number(searchParams.get('paragraph') || '0');
  // Downloaded chapters stay readable with no backend — badge it so the
  // offline state is visible, not confusing.
  const isOfflineChapter = searchParams.get('offline') === 'true';

  const { data: chaptersResp } = useNovelChapters(novelId);
  const { data: offlineChapters } = useQuery({
    queryKey: ['offline-novel-chapters', novelId],
    queryFn: () => getOfflineNovelChapters(novelId || ''),
    enabled: isOfflineChapter && Boolean(novelId),
    networkMode: 'always',
  });
  const chapters = useMemo(() => {
    const list = isOfflineChapter ? offlineChapters ?? [] : chaptersResp?.mappedChapters ?? [];
    return [...list].sort((a, b) => (a.chapterNumber ?? a.canonicalOrder) - (b.chapterNumber ?? b.canonicalOrder));
  }, [chaptersResp, isOfflineChapter, offlineChapters]);

  const stateSources = useMemo<NovelChapterSource[]>(() => {
    const raw = (location.state as { sources?: NovelChapterSource[] } | null)?.sources;
    return Array.isArray(raw) ? raw : [];
  }, [location.state]);

  const matchedSources = useMemo<NovelChapterSource[]>(() => {
    if (!chapters.length) return [];
    const num = chapterNumberParam != null ? Number(chapterNumberParam) : NaN;
    const ch =
      (chapterKey ? chapters.find((c) => c.sources?.some((s) => s.chapterKey === chapterKey)) : undefined) ||
      (Number.isFinite(num) ? chapters.find((c) => c.chapterNumber === num) : undefined) ||
      null;
    return ch?.sources ?? [];
  }, [chapters, chapterKey, chapterNumberParam]);

  const alternatives = useMemo(() => {
    const merged: NovelChapterSource[] = [...stateSources];
    const seen = new Set(merged.map((s) => `${s.provider}::${s.chapterKey}`));
    for (const s of matchedSources) {
      const k = `${s.provider}::${s.chapterKey}`;
      if (!seen.has(k)) { seen.add(k); merged.push(s); }
    }
    return merged;
  }, [stateSources, matchedSources]);

  const altKey = useMemo(
    () => alternatives.map((s) => `${s.provider}::${s.chapterKey}`).sort().join('|'),
    [alternatives],
  );
  const [reloadNonce, setReloadNonce] = useState(0);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['novel-read', novelId, chapterKey, provider, providerChapterId, altKey, reloadNonce, isOfflineChapter],
    queryFn: () =>
      getNovelContentByKey(novelId || '', chapterKey, {
        provider: provider || undefined,
        providerChapterId: providerChapterId || undefined,
        alternatives: alternatives.length ? alternatives : undefined,
        offlineOnly: isOfflineChapter,
      }),
    enabled: Boolean(novelId && chapterKey),
    networkMode: isOfflineChapter ? 'always' : 'online',
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  useReadingViewTracker('novel',readingViewId(novelId),!!data&&!isLoading&&!error);

  useEffect(() => {
    if (isFetching || !data) return;
    if ((data.data?.paragraphs?.length ?? 0) > 0) return;
    void queryClient.removeQueries({
      queryKey: ['novel-read', novelId, chapterKey, provider, providerChapterId, altKey, reloadNonce, isOfflineChapter],
      exact: true,
    });
  }, [isFetching, data, queryClient, novelId, chapterKey, provider, providerChapterId, altKey, reloadNonce, isOfflineChapter]);

  const paragraphs = data?.data?.paragraphs ?? [];
  const total = paragraphs.length;
  const resolvedProvider = data?.data?.chapter?.provider || provider;

  const { data: detailResp } = useNovelDetail(novelId);
  const detail = (detailResp as any)?.detail;
  const novelTitle = detail?.canonicalTitle || detail?.title?.english || detail?.title?.romaji || uiI18n.t('app.novel_1a9fdb91');
  const novelPoster = detail?.coverImage ?? null;

  const resolvedNumber = useMemo(() => {
    const fromParam = chapterNumberParam != null ? Number(chapterNumberParam) : NaN;
    if (Number.isFinite(fromParam)) return fromParam;
    const fromData = data?.data?.chapter?.number;
    return typeof fromData === 'number' && Number.isFinite(fromData) ? fromData : null;
  }, [chapterNumberParam, data]);

  // Discord RPC — update whenever the chapter or title changes.
  useEffect(() => {
    if (!isNative || !novelTitle || novelTitle === 'Novel') return;
    setReadingNovelRpc({
      novelTitle,
      chapter: resolvedNumber,
      novelImageUrl: novelPoster,
      novelUrl: `https://tatakai.me/novel/${novelId}`,
    });
    return () => {
      clearDiscordRpc();
    };
  }, [isNative, novelTitle, novelPoster, resolvedNumber, novelId]);

  const title = chapterTitleParam || data?.data?.chapter?.title || (resolvedNumber != null ? uiI18n.t('app.chapter_i18n_value_0_e0f6e591', { value0: resolvedNumber }) : uiI18n.t('app.chapter_46b00590'));

  const currentIndex = useMemo(() => {
    if (!chapters.length) return -1;
    if (resolvedNumber != null) {
      const byNum = chapters.findIndex((c) => c.chapterNumber === resolvedNumber);
      if (byNum >= 0) return byNum;
    }
    return chapters.findIndex((c) => c.sources?.some((s) => s.chapterKey === chapterKey));
  }, [chapters, resolvedNumber, chapterKey]);

  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  const navToChapter = useCallback((ch: (typeof chapters)[number] | null, paragraph = 0) => {
    if (!ch || !novelId) return;
    const src = ch.sources?.find((s) => s.provider === resolvedProvider) || ch.sources?.[0];
    if (!src) return;
    const params = new URLSearchParams();
    params.set('chapterKey', src.chapterKey);
    if (src.provider) params.set('provider', src.provider);
    if (src.providerChapterId) params.set('providerChapterId', src.providerChapterId);
    if (ch.chapterNumber != null) params.set('chapterNumber', String(ch.chapterNumber));
    if (ch.chapterTitle) params.set('chapterTitle', ch.chapterTitle);
    params.set('paragraph', String(paragraph));
    // Carry the offline flag across chapter jumps so ProtectedRoute keeps the
    // reader reachable for the whole downloaded run.
    if (searchParams.get('offline') === 'true') params.set('offline', 'true');
    stopNarrationRef.current?.();
    navigate(`/novel/read/${encodeURIComponent(novelId)}?${params.toString()}`, { state: { sources: ch.sources } });
  }, [novelId, navigate, resolvedProvider, searchParams]);

  // ── Scroll + progress ──────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const discussionRef = useRef<HTMLDivElement | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<(CommentQuoteDraft & { chapterKey: string }) | undefined>();
  const quoteSequence = useRef(0);
  const [paraIndex, setParaIndex] = useState(() => (Number.isFinite(paragraphParam) && paragraphParam > 0 ? paragraphParam : 0));
  const [openThread, setOpenThread] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  useTVReader({
    next: () => scrollRef.current?.scrollBy({ top: scrollRef.current.clientHeight * .85, behavior: 'auto' }),
    previous: () => scrollRef.current?.scrollBy({ top: -scrollRef.current.clientHeight * .85, behavior: 'auto' }),
    controls: () => setShowSettings(true),
  });
  const [chapterSearch, setChapterSearch] = useState('');

  useEffect(() => {
    const start = Number.isFinite(paragraphParam) && paragraphParam > 0
      ? Math.min(paragraphParam, Math.max(total - 1, 0))
      : 0;
    setParaIndex(start);
    setOpenThread(null);
    setQuoteDraft(undefined);
    // Resume exactly where reading stopped: jump to the saved paragraph once
    // its element exists, otherwise start at the top.
    if (start > 0 && total > 0) {
      const t = window.setTimeout(() => {
        const el = scrollRef.current?.querySelector(`[data-para="${start}"]`);
        if (el && scrollRef.current) {
          const root = scrollRef.current;
          root.scrollTo({
            top: root.scrollTop + (el as HTMLElement).getBoundingClientRect().top - root.getBoundingClientRect().top - 80,
            behavior: 'auto',
          });
        } else {
          scrollRef.current?.scrollTo({ top: 0 });
        }
      }, 60);
      return () => window.clearTimeout(t);
    }
    scrollRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, chapterKey, provider, providerChapterId, total]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || total === 0) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-para]'));
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries
        .filter((e) => e.isIntersecting)
        .map((e) => Number(e.target.getAttribute('data-para')))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      if (vis.length) setParaIndex(Math.max(0, vis[0]));
    }, { root, threshold: 0.5 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [total, chapterKey]);

  // Continuous scroll: preload + append the next chapter at the end.
  const [appended, setAppended] = useState<{ number: number | null; title: string; paragraphs: { index: number; text: string }[] } | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  useEffect(() => { setAppended(null); }, [chapterKey]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!settings.continuousScroll || !nextChapter || appended || total === 0) return;
    const root = scrollRef.current;
    const el = bottomRef.current;
    if (!root || !el) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      const src = nextChapter.sources?.find((s) => s.provider === resolvedProvider) || nextChapter.sources?.[0];
      if (!src) return;
      setLoadingNext(true);
      getNovelContentByKey(novelId || '', src.chapterKey, {
        provider: src.provider,
        providerChapterId: src.providerChapterId,
        alternatives: nextChapter.sources,
        offlineOnly: isOfflineChapter,
      })
        .then((res) => {
          const paras = res.data?.paragraphs ?? [];
          if (paras.length > 0) {
            setAppended({
              number: nextChapter.chapterNumber,
              title: nextChapter.chapterTitle || `Chapter ${nextChapter.chapterNumber ?? ''}`,
              paragraphs: paras,
            });
          }
        })
        .catch(() => undefined)
        .finally(() => setLoadingNext(false));
    }, { root, rootMargin: '500px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [settings.continuousScroll, nextChapter, appended, total, novelId, resolvedProvider, isOfflineChapter]);

  // Translation (Settings → Translation applies per surface; the reader shows a
  // "Show original" toggle whenever the novel surface is enabled).
  const translationConfig = useTranslationConfig();
  const novelTranslationEnabled = translationConfig.enabled && translationConfig.translateNovels;
  const translatedParagraphs = useNovelTranslation(paragraphs);
  const translatedAppended = useNovelTranslation(appended?.paragraphs ?? []);
  const [novelShowOriginal, setNovelShowOriginal] = useState(false);
  const useTranslatedNovelTexts = novelTranslationEnabled && !novelShowOriginal;
  const novelText = (p: { index: number; text: string }, source: NovelTranslationState) =>
    useTranslatedNovelTexts ? source.map[p.index] ?? p.text : p.text;
  const showTranslationToggle =
    novelTranslationEnabled &&
    (translatedParagraphs.status !== 'idle' ||
      Object.keys(translatedParagraphs.map).length > 0);

  const percent = total > 0 ? Math.min(100, Math.round(((paraIndex + 1) / total) * 100)) : 0;

  // ── Progress persistence ───────────────────────────────────────────
  const saveProgress = useSaveNovelReadingProgress();
  const savedRef = useRef('');
  useEffect(() => {
    if (!user || !novelId || total === 0) return;
    const key = `${chapterKey}|${provider}|${providerChapterId}`;
    if (savedRef.current === key) return;
    savedRef.current = key;
    saveProgress.mutate({
      novelId, novelTitle, novelPoster,
      lastChapterKey: chapterKey,
      lastChapterNumber: resolvedNumber,
      lastChapterTitle: title,
      lastProvider: resolvedProvider || null,
      lastParagraphIndex: Math.max(0, Number.isFinite(paragraphParam) ? paragraphParam : 0),
      totalParagraphs: total,
      anilistId: typeof detail?.anilistId === 'number' ? detail.anilistId : null,
      malId: typeof detail?.malId === 'number' ? detail.malId : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, novelId, total, chapterKey, provider, providerChapterId]);

  useEffect(() => {
    if (!user || !novelId || total === 0) return;
    if (savedRef.current !== `${chapterKey}|${provider}|${providerChapterId}`) return;
    const t = setTimeout(() => {
      saveProgress.mutate({
        novelId, novelTitle, novelPoster,
        lastChapterKey: chapterKey,
        lastChapterNumber: resolvedNumber,
        lastChapterTitle: title,
        lastProvider: resolvedProvider || null,
        lastParagraphIndex: paraIndex,
        totalParagraphs: total,
        anilistId: typeof detail?.anilistId === 'number' ? detail.anilistId : null,
        malId: typeof detail?.malId === 'number' ? detail.malId : null,
      });
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paraIndex]);

  const narratorRef = useRef<NovelNarrator | null>(null);
  const stopNarrationRef = useRef<() => void>(() => undefined);
  const [narrating, setNarrating] = useState(false);
  const [narratorPaused, setNarratorPaused] = useState(false);
  const [narratorBackend, setNarratorBackend] = useState<string>('');
  const [narratorBuffering, setNarratorBuffering] = useState(false);
  const [activeUtterPara, setActiveUtterPara] = useState<number | null>(null);

  const stopNarration = useCallback(() => {
    narratorRef.current?.stop();
    narratorRef.current = null;
    setNarrating(false);
    setNarratorPaused(false);
    setNarratorBuffering(false);
    setActiveUtterPara(null);
  }, []);
  useEffect(() => { stopNarrationRef.current = stopNarration; }, [stopNarration]);
  useEffect(() => () => { narratorRef.current?.stop(); }, []);

  const toggleNarration = useCallback(() => {
    if (narrating) {
      const n = narratorRef.current;
      if (n?.getStatus() === 'paused') n.resume();
      else n?.pause();
      return;
    }
    if (total === 0) return;
    const texts = paragraphs.map((p) => p.text);
    const narrator = new NovelNarrator({
      onStatus: (s) => {
        if (s === 'playing') setNarratorBackend(narrator.getBackend());
        setNarrating(s === 'playing' || s === 'paused');
        setNarratorPaused(s === 'paused');
        if (s === 'ended') { setActiveUtterPara(null); narratorRef.current = null; }
        if (s === 'error') setNarratorBuffering(false);
      },
      onUtterance: (_i, para) => {
        setActiveUtterPara(para);
        setParaIndex(para);
      },
      onBuffering: (buffering) => setNarratorBuffering(buffering),
      onEnd: () => {
        // Auto-advance into the next chapter while narrating (continuous mode).
        if (settings.continuousScroll && nextChapter) navToChapter(nextChapter, 0);
      },
      onError: (message) => {
        setNarrating(false);
        setNarratorBuffering(false);
        if (message) toast.error(message);
      },
    });
    narratorRef.current = narrator;
    setNarratorBackend('');
    void narrator.speak(texts, {
      voice: settings.narratorVoice,
      kittenVoice: settings.kittenVoice,
      kittenBufferUnits: settings.kittenBufferUnits,
      localModel: settings.kittenLocalModel,
      engine: settings.narratorEngine,
      integration: loadTtsIntegrations(user?.id),
      rate: settings.narratorRate,
      fromParagraph: paraIndex,
    }).then(() => setNarratorBackend(narrator.getBackend()));
    if (!settings.textToSpeech) updateSetting('textToSpeech', true);
  }, [narrating, total, paragraphs, settings, paraIndex, nextChapter, navToChapter, updateSetting, user?.id]);

  const stopNarrationBtn = useCallback(() => {
    stopNarration();
  }, [stopNarration]);

  // ── Fullscreen / wake lock / scroll lock ───────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  // ── Fullscreen: OS-level in Electron (hides titlebar + sidebar + tray via
  // the `app-fullscreen` class, mirroring MangaReaderPage), DOM Fullscreen on
  // the web. The DOM-only path never worked in the desktop app, so Electron
  // must go through `window.electron.setFullscreen` like the manga reader. ──
  const [isFs, setIsFs] = useState(false);

  const electronBridge = () =>
    (window as unknown as { electron?: {
      setFullscreen?: (v: boolean) => Promise<unknown>;
      onFullscreenChanged?: (cb: (v: boolean) => void) => (() => void) | void;
    } }).electron;

  const enterFullscreen = useCallback(async () => {
    const bridge = electronBridge();
    try {
      if (bridge?.setFullscreen) {
        await bridge.setFullscreen(true);
        document.documentElement.classList.add('app-fullscreen');
      } else {
        if (!containerRef.current?.requestFullscreen) return;
        await containerRef.current.requestFullscreen();
      }
      setIsFs(true);
    } catch {
      document.documentElement.classList.remove('app-fullscreen');
      setIsFs(false);
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    const bridge = electronBridge();
    setIsFs(false);
    if (bridge?.setFullscreen) {
      document.documentElement.classList.remove('app-fullscreen');
      void bridge.setFullscreen(false).catch(() => {});
    } else if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFs) exitFullscreen();
    else void enterFullscreen();
  }, [isFs, enterFullscreen, exitFullscreen]);

  // Sync state when leaving fullscreen via Esc, F11 or native window chrome,
  // and always drop the CSS class on unmount so the app never gets stranded
  // fullscreen.
  useEffect(() => {
    const onFsChange = () => {
      if (!electronBridge()?.setFullscreen) setIsFs(document.fullscreenElement === containerRef.current);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitFullscreen();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('keydown', onKey);
    const unsub = electronBridge()?.onFullscreenChanged?.((full: boolean) => {
      if (!full) {
        document.documentElement.classList.remove('app-fullscreen');
        setIsFs(false);
      }
    });
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('keydown', onKey);
      if (typeof unsub === 'function') unsub();
      document.documentElement.classList.remove('app-fullscreen');
    };
  }, [exitFullscreen]);

  const autoFsRef = useRef(false);
  useEffect(() => {
    if (settings.enterFullscreen && !autoFsRef.current && total > 0) {
      autoFsRef.current = true;
      void enterFullscreen();
    }
  }, [settings.enterFullscreen, total, enterFullscreen]);

  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (!settings.keepScreenAwake || !('wakeLock' in navigator)) return;
    let lock: { release?: () => Promise<void> } | null = null;
    let released = false;
    const wl = (navigator as any).wakeLock;
    const acquire = () => {
      wl.request('screen').then((l: any) => { if (!released) lock = l; else void l.release?.(); }).catch(() => undefined);
    };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release?.().catch(() => undefined);
    };
  }, [settings.keepScreenAwake]);

  const fontStack = resolveFontStack(settings.font, customFonts);
  const filteredChapters = useMemo(() => {
    const q = chapterSearch.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter((c) =>
      String(c.chapterNumber ?? '').includes(q) ||
      String(c.chapterTitle ?? '').toLowerCase().includes(q),
    );
  }, [chapterSearch, chapters]);

  const jumpToParagraph = (idx: number) => {
    const el = scrollRef.current?.querySelector(`[data-para="${idx}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div ref={containerRef} className="novel-reader-shell relative flex flex-col overflow-hidden text-foreground" style={{ background: settings.background }}>
      {!isNative && <Background />}
      {/* Top bar */}
      <div className="relative z-30 shrink-0 border-b border-border" style={{ background: settings.background }}>
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-3">
          <button type="button" onClick={() => setControlsOpen(value => !value)} aria-expanded={controlsOpen} aria-controls="novel-reader-controls" className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {controlsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {controlsOpen ? uiI18n.t('app.hide_reader_controls_97fb1781') : uiI18n.t('app.reader_controls_f3849915')}
          </button>
          <span aria-live="polite" className="truncate text-xs text-muted-foreground">{narratorPaused ? uiI18n.t('app.narration_paused_7c404973') : narratorBuffering ? uiI18n.t('app.preparing_audio_63cde625') : narrating ? uiI18n.t('app.narration_active_353b296f') : settings.showPercentRead ? uiI18n.t('app.i18n_value_0_read_f936320f', { value0: percent }) : ''}</span>
        </div>
        <div id="novel-reader-controls" hidden={!controlsOpen}>
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-2 px-3 pb-2.5">
          <button onClick={() => { stopNarration(); navigate(novelId ? `/novel/${encodeURIComponent(novelId)}` : '/novel'); }}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10" aria-label={uiI18n.t('app.back_to_novel_e943a5d2')}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{novelTitle}</p>
            <h1 className="truncate text-sm font-black">
              {settings.showChapterNumber && resolvedNumber != null ? uiI18n.t('app.ch_i18n_value_0_fc0c35f8', { value0: resolvedNumber }) : ''}{title}
              {isOfflineChapter && (
                <span className="ml-2 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                  {uiI18n.t('app.offline_e01fa717')}
                </span>
              )}
            </h1>
          </div>
          <button onClick={toggleNarration} title={narratorPaused ? uiI18n.t('app.resume_narration_94036c2d') : narrating ? uiI18n.t('app.pause_narration_837bb7c0') : uiI18n.t('app.read_aloud_562107b8')}
            disabled={narratorBuffering && !narrating}
            className={cn('flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
              narrating ? 'border-primary/50 bg-primary text-primary-foreground' : 'border-white/10 bg-white/5 hover:bg-white/10')}>
            {narrating && !narratorPaused ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          {(narrating || narratorBuffering) && (
            <button onClick={stopNarrationBtn} title={uiI18n.t('app.stop_narration_b9e9b8c4')}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setShowChapters(true)} title={uiI18n.t('app.chapters_034e2733')}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
            <List className="w-4 h-4" />
          </button>
          {showTranslationToggle && (
            <button onClick={() => setNovelShowOriginal(value => !value)}
              title={novelShowOriginal ? uiI18n.t('translation.comment.showTranslation') : uiI18n.t('translation.comment.showOriginal')}
              className={cn('flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
                !novelShowOriginal ? 'border-primary/50 bg-primary/15 text-primary' : 'border-white/10 bg-white/5 hover:bg-white/10',
                translatedParagraphs.status === 'translating' && 'opacity-75')}>
              {translatedParagraphs.status === 'translating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
            </button>
          )}
          <button onClick={() => setShowSettings(true)} title={uiI18n.t('app.reader_settings_bf922fa5')}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
            <Settings2 className="w-4 h-4" />
          </button>
          <button onClick={toggleFullscreen} title={uiI18n.t('app.fullscreen_bb08d10b')}
            className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10">
            {isFs ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
        </div>
        {settings.showProgressBar && (
          <div className="h-1 w-full bg-white/5">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      {/* Body */}
      <div ref={scrollRef} className="mx-auto min-h-0 w-full flex-1 overflow-y-auto px-4 pb-32 pt-6">
        <article
          ref={articleRef}
          className="mx-auto"
          style={{
            maxWidth: settings.textWidth,
            fontFamily: fontStack,
            fontSize: settings.textSize,
            lineHeight: settings.lineSpacing,
            color: settings.textColour,
          }}
        >
          {isLoading ? (
            <div className="space-y-4 animate-pulse pt-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-5 rounded bg-white/10" style={{ width: `${92 - (i % 3) * 12}%` }} />
              ))}
              <p className="flex items-center gap-2 text-sm text-muted-foreground pt-4">
                <Loader2 className="w-4 h-4 animate-spin" /> {uiI18n.t('app.loading_chapter_text_7c19bc32')}
              </p>
            </div>
          ) : error || paragraphs.length === 0 ? (
            <div className="py-20 text-center">
              <p className="font-bold">{uiI18n.t('app.no_text_for_this_chapter_yet_faaadff4')}</p>
              <p className="mt-2 text-sm text-muted-foreground">{uiI18n.t('app.try_another_translator_or_reload_8856619a')}</p>
              <button onClick={() => setReloadNonce((n) => n + 1)}
                className="mt-4 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">
                {uiI18n.t('app.retry_9f5cd8a2')}
              </button>
            </div>
          ) : (
            <>
              <header className="mb-8">
                <h2 className="text-2xl font-black tracking-tight" style={{ fontSize: settings.textSize + 8 }}>{title}</h2>
                <p className="mt-1 text-xs opacity-60">
                  {resolvedProvider}{settings.showPercentRead ? uiI18n.t('app.i18n_value_0_read_aabffb32', { value0: percent }) : ''}
                  {narratorBackend ? uiI18n.t('app.i18n_value_0_92e4cd32', { value0: narratorEngineLabel(narratorBackend as NarratorBackend) }) : ''}
                </p>
              </header>
              {paragraphs.map((p) => (
                <div key={p.index}>
                  <div className="group relative">
                    <p
                      data-para={p.index}
                      data-reader-text
                      data-quote-chapter={chapterKey}
                      onClick={() => setParaIndex(p.index)}
                      className={cn('rounded-lg px-2 -mx-2 transition-colors')}
                      style={{
                        marginBottom: `${settings.paragraphSpacing}em`,
                        background: activeUtterPara === p.index ? 'rgba(255,255,255,0.06)' : undefined,
                      }}
                    >
                      {novelText(p, translatedParagraphs)}
                    </p>
                    {settings.showParagraphComments && novelId && (
                      <div className="absolute -right-1 top-0 translate-x-full hidden md:block opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity pl-2">
                        <ParagraphCommentButton novelId={novelId} paragraphIndex={p.index} onOpen={() => setOpenThread(openThread === p.index ? null : p.index)} />
                      </div>
                    )}
                    {settings.showParagraphComments && novelId && isMobile && (
                      <div className="flex justify-end -mt-1 mb-2">
                        <ParagraphCommentButton novelId={novelId} paragraphIndex={p.index} onOpen={() => setOpenThread(openThread === p.index ? null : p.index)} />
                      </div>
                    )}
                  </div>
                  {openThread === p.index && novelId && (
                    <ParagraphThread novelId={novelId} paragraphIndex={p.index} paragraphText={p.text} onClose={() => setOpenThread(null)} />
                  )}
                </div>
              ))}
              {appended && (
                <>
                  <div className="mx-auto my-8 flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider opacity-60">
                    <span className="h-px flex-1 bg-current" />
                    <span>{appended.number != null ? uiI18n.t('app.chapter_i18n_value_0_e0f6e591', { value0: appended.number }) : ''} · {appended.title}</span>
                    <span className="h-px flex-1 bg-current" />
                  </div>
                  {appended.paragraphs.map((p, i) => (
                    <p key={`next-${i}`} data-reader-text data-quote-chapter={nextChapter?.sources?.find(s => s.provider === resolvedProvider)?.chapterKey || nextChapter?.sources?.[0]?.chapterKey} style={{ marginBottom: `${settings.paragraphSpacing}em` }}>{novelText(p, translatedAppended)}</p>
                  ))}
                  {nextChapter && (
                    <button onClick={() => navToChapter(nextChapter, 0)}
                      className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm font-bold hover:bg-white/10">
                      {uiI18n.t('app.open_chapter_dd0f79f9')} {nextChapter.chapterNumber ?? ''} {uiI18n.t('app.properly_19e4d5d0')}
                    </button>
                  )}
                </>
              )}
              <div ref={bottomRef} className="h-4" />
              {loadingNext && (
                <p className="flex items-center gap-2 text-xs opacity-60 py-4"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {uiI18n.t('app.loading_next_chapter_3f34ab50')}</p>
              )}
            </>
          )}
        </article>

        {/* Prev / next */}
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 pt-8" style={{ maxWidth: settings.textWidth }}>
          <button disabled={!prevChapter} onClick={() => navToChapter(prevChapter, 0)}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold disabled:opacity-30 hover:bg-white/10">
            <ChevronLeft className="w-4 h-4" /> {uiI18n.t('app.prev_e96fea52')}
          </button>
          <button onClick={() => jumpToParagraph(Math.min(total - 1, paraIndex + 5))}
            className="text-xs font-bold uppercase tracking-wider opacity-60">
            {settings.showPercentRead ? uiI18n.t('app.i18n_value_0_cac4fa79', { value0: percent }) : uiI18n.t('app.i18n_value_0_i18n_value_1_68ff458e', { value0: paraIndex + 1, value1: total })}
          </button>
          <button disabled={!nextChapter && !appended} onClick={() => navToChapter(nextChapter, 0)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-30 hover:brightness-110">
            {uiI18n.t('app.next_bc981983')} <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Chapter discussion */}
        {novelId && (
          <div ref={discussionRef} className="mx-auto pt-10" style={{ maxWidth: settings.textWidth }}>
            <button onClick={() => setShowComments((v) => !v)}
              className="flex items-center gap-2 text-sm font-bold opacity-80 hover:opacity-100">
              <MessageSquare className="w-4 h-4" /> {uiI18n.t('app.chapter_discussion_04f6597b')}
            </button>
            {showComments && (
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4">
                <Comments sourceKind="novel" entityType="manga" entityId={`${novelId}:${quoteDraft?.chapterKey || chapterKey}`} entityName={quoteDraft?.chapterKey && quoteDraft.chapterKey !== chapterKey ? appended?.title : title} quoteDraft={quoteDraft} />
              </div>
            )}
          </div>
        )}
      </div>

      <ReaderSelectionComment rootRef={articleRef} chapterKey={chapterKey} onQuote={(text, selectedChapter) => {
        setQuoteDraft({ id: `${chapterKey}:${++quoteSequence.current}`, text, chapterKey: selectedChapter });
        setShowComments(true);
        window.setTimeout(() => discussionRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }), 0);
      }} />

      {/* Settings sheet */}
      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent side="right" className="w-[380px] max-w-[92vw] overflow-y-auto">
          <SheetHeader><SheetTitle>{uiI18n.t('app.novel_reader_settings_391b370d')}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-6">
            <NovelReaderPanel />
            <div>
              <h3 className="mb-2 text-sm font-black">{uiI18n.t('app.manga_reader_layout_shared_ec25e2e2')}</h3>
              <ReaderPanel />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Chapter list sheet */}
      <Sheet open={showChapters} onOpenChange={setShowChapters}>
        <SheetContent side="right" className="w-[360px] max-w-[92vw] overflow-y-auto">
          <SheetHeader><SheetTitle>{uiI18n.t('app.chapters_034e2733')}</SheetTitle></SheetHeader>
          <input value={chapterSearch} onChange={(e) => setChapterSearch(e.target.value)} placeholder={uiI18n.t('app.search_f54fbca1')}
            className="mt-3 h-9 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm outline-none" />
          <div className="mt-3 space-y-1">
            {filteredChapters.map((ch) => (
              <button key={`${ch.chapterNumber}-${ch.canonicalOrder}`}
                onClick={() => { setShowChapters(false); navToChapter(ch, 0); }}
                className="w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/5 flex items-center gap-2">
                <span className="w-12 shrink-0 font-black tabular-nums opacity-60">#{ch.chapterNumber ?? '—'}</span>
                <span className="flex-1 truncate">{ch.chapterTitle || uiI18n.t('app.chapter_i18n_value_0_e0f6e591', { value0: ch.chapterNumber ?? '' })}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Narrator mini-bar */}
      {narrating && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/80 px-4 py-2 backdrop-blur-xl text-xs font-bold">
            {narratorBuffering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-primary" />
            )}
            <span>
              {narratorBuffering ? uiI18n.t('app.synthesizing_03754fa4') : uiI18n.t('app.narrating_f86ad44a')}
              {activeUtterPara != null ? uiI18n.t('app.i18n_value_0_0d6e2989', { value0: activeUtterPara + 1 }) : ''}
            </span>
            <button onClick={toggleNarration} className="ml-1 rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/20">{uiI18n.t('app.pause_781961bc')}</button>
            <button onClick={stopNarrationBtn} className="rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/20">{uiI18n.t('app.stop_9e253470')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
