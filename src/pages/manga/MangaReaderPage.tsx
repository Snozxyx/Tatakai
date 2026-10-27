import { useReadingViewTracker } from '@/hooks/user/useReadingViews';
import { ReaderPageRail } from '@/components/reader/ReaderPageRail';
import { MangaSourceStatus } from '@/components/manga/MangaSourceStatus';
import { readingViewId } from '@/lib/readingViewId';
import { readerImageStyles, readerPageIsEager } from "@/components/reader/readerImageStyles";
import { useReaderFullscreen } from "@/hooks/media/useReaderFullscreen";
import { ReaderToolButton as ToolBtn, ReaderTopbar, ReaderToolbar, ReaderSettingsSheet, ReaderNavigationSheet } from "@/components/reader/ReaderChrome";
import { ThemedSelect } from '@/components/ui/themed-select';
import { useReaderPinchZoom } from '@/pages/manga/hooks/useReaderPinchZoom';
import uiI18n from '@/lib/uiI18n';
import { useTVReader } from '@/core/tv/useTVReader';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Info,
  Home,
  Camera,
  MessageSquare,
  RefreshCw,
  Maximize,
  Minimize,
  Settings2,
  Loader2,
  Puzzle,
  List,
  Search,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  Lock,
  Unlock,
} from "lucide-react";
import { getMangaReadByKey } from "@/core/content/manga-client";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { useReaderSettings, DEFAULT_READER_SETTINGS } from "@/hooks/media/useReaderSettings";
import { getProfileKnobs } from "@/lib/memoryProfile";
import { useReaderKeybinds } from "@/hooks/media/useReaderKeybinds";
import { useReaderKeyboard } from "@/pages/manga/hooks/useReaderKeyboard";
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import { clampReaderPageIndex, useReaderResume } from '@/pages/manga/hooks/useReaderResume';
import { useContinuousReader } from "@/pages/manga/hooks/useContinuousReader";
import type { ReaderSegment } from "@/pages/manga/hooks/useContinuousReader";
import { useMangaChapters, useMangaDetail } from "@/hooks/api/useMangaData";
import { useSaveMangaReadingProgress } from "@/hooks/user/useMangaReadlist";
import { useAuth } from "@/contexts/AuthContext";
import { Background } from "@/components/layout/Background";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReaderPanel } from "@/components/settings/panels/ReaderPanel";
import { Comments } from "@/components/comments/Comments";
import type { MangaChapterSource, MangaPage, MappedMangaChapter } from "@/types/manga";
import { ReaderImage } from "@/components/reader/ReaderImage";
import { fetchViaMobileProxy, isMobileProxyUrl } from "@/core/extensions/mobile/mobileProxy";
import { getEffectiveMemoryProfile } from "@/lib/mobile/dataSaver";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { triggerHaptic } from "@/lib/haptics";
import { setReadingMangaRpc, clearDiscordRpc } from "@/lib/discordRpc";
import { readerPageRenderKey } from "@/lib/reader/imageLifecycle";
import { TranslateChapterButton } from '@/components/translate/TranslateChapterButton';
import {
  nextMangaChapterSource,
  pickMangaChapterSource,
  sortMangaChapterSources,
} from "@/lib/reader/mangaSourceSelection";

function ChapterDivider({ label, sub }: { label: string; sub?: string | null }) {
  useUiTranslation();
  return (
    <div className="mx-auto my-6 flex w-full max-w-3xl items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="h-px flex-1 bg-white/10" />
      <span>{label}{sub ? uiI18n.t('app.i18n_value_0_92e4cd32', { value0: sub }) : ""}</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function ProviderFallbackNotice({
  requested,
  active,
  onChange,
}: {
  requested: string;
  active: string;
  onChange: () => void;
}) {
  useUiTranslation();
  return (
    <div className="mx-auto mb-4 flex w-[calc(100%-1rem)] max-w-3xl items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-foreground">
      <span>
        {requested} {uiI18n.t('app.was_unavailable_for_this_chapter_using_18ff5c07')} {active} {uiI18n.t('app.instead_6568964b')}
      </span>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 rounded-lg border border-amber-200/25 px-2.5 py-1 font-semibold hover:bg-amber-100/10"
      >
        {uiI18n.t('app.change_provider_85169368')}
      </button>
    </div>
  );
}

export default function MangaReaderPage() {
  useUiTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isNative = useIsNativeApp();
  const reducedMotion = useMotionPreference();
  const compactReader = useIsMobile();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { mangaId } = useParams<{ mangaId: string }>();
  const [searchParams] = useSearchParams();

  const { settings, updateSetting } = useReaderSettings();
  const { keybinds } = useReaderKeybinds();

  const chapterKey = searchParams.get("chapterKey") || searchParams.get("chapter") || "";
  const provider = searchParams.get("provider") || "";
  const lockedProvider = searchParams.get("lockedProvider") || "";
  const [blockedChapter, setBlockedChapter] = useState<MappedMangaChapter | null>(null);
  // Resume links (home/profile history) persist the public chapter key but do
  // not always have the provider's private chapter id. Do not invent one from
  // `chapterKey`: once the chapter list arrives, its source alternative carries
  // the real id and the runtime can retry that exact source.
  const providerChapterId = searchParams.get("providerChapterId") || "";
  const chapterNumberParam = searchParams.get("chapterNumber");
  const chapterTitleParam = searchParams.get("chapterTitle");
  const pageParam = Number(searchParams.get("page") || "0");
  // Downloaded chapters stay readable with no backend (see ProtectedRoute's
  // offline gate) — badge it so the offline state is visible, not confusing.
  const isOfflineChapter = searchParams.get("offline") === "true";

  const { data: chaptersResp, isFetching: fetchingChapterSources } = useMangaChapters(mangaId);
  const chapters = useMemo<MappedMangaChapter[]>(() => {
    const list = chaptersResp?.mappedChapters ?? [];
    return [...list].sort((a, b) => a.canonicalOrder - b.canonicalOrder);
  }, [chaptersResp]);

  // Sources threaded from the click that opened the reader (MangaPage /
  // navToChapter), reliability-ordered. Absent on a refresh or deep link.
  const stateAlternatives = useMemo<MangaChapterSource[]>(() => {
    const raw = (location.state as { sources?: MangaChapterSource[] } | null)?.sources;
    return Array.isArray(raw) ? sortMangaChapterSources(raw) : [];
  }, [location.state]);

  // The chapter's full source list, recovered from the loaded chapter list by
  // matching the URL's chapterKey (then chapter number). This is what lets a dead
  // source fall back to the same chapter from another scanlator/provider even
  // when `location.state` is gone — so refresh and deep-link paths recover too.
  const matchedSources = useMemo<MangaChapterSource[]>(() => {
    if (!chapters.length) return [];
    const num = chapterNumberParam != null ? Number(chapterNumberParam) : NaN;
    const ch =
      (chapterKey ? chapters.find((c) => c.sources?.some((s) => s.chapterKey === chapterKey)) : undefined) ||
      (Number.isFinite(num) ? chapters.find((c) => c.chapterNumber === num) : undefined) ||
      null;
    return sortMangaChapterSources(ch?.sources);
  }, [chapters, chapterKey, chapterNumberParam]);

  // Full fallback set: router state leads (reliability-ordered), then any other
  // sources from the chapter list not already present.
  const alternatives = useMemo<MangaChapterSource[]>(() => {
    const merged: MangaChapterSource[] = [...stateAlternatives];
    const seen = new Set(merged.map((s) => `${s.provider}::${s.chapterKey}::${s.providerChapterId || ""}`));
    for (const s of matchedSources) {
      const k = `${s.provider}::${s.chapterKey}::${s.providerChapterId || ""}`;
      if (!seen.has(k)) { seen.add(k); merged.push(s); }
    }
    return merged.filter((source) => !lockedProvider || source.provider === lockedProvider);
  }, [stateAlternatives, matchedSources, lockedProvider]);

  // Alternatives fingerprint in the query key. Without it, the prefetch below
  // (primary-only, no alternatives) and the main query (with alternatives)
  // shared one key — a prefetch failure poisoned the cache for 10min and the
  // ch1→ch2 navigation instantly rendered the cached failure while a direct
  // load (no prefetch) went to network and succeeded.
  const alternativesKey = useMemo(
    () => alternatives.map((s) => `${s.provider}::${s.chapterKey}::${s.providerChapterId || ""}`).sort().join('|'),
    [alternatives],
  );

  const [reloadNonce, setReloadNonce] = useState(0);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: [
      "manga-read", mangaId, chapterKey, provider, providerChapterId, alternativesKey, reloadNonce,
    ],
    queryFn: () =>
      getMangaReadByKey(mangaId || "", chapterKey, {
        provider: provider || undefined,
        providerChapterId: providerChapterId || undefined,
        alternatives: alternatives.length ? alternatives : undefined,
      }),
    enabled: Boolean(mangaId && chapterKey),
    // Pages are immutable — keep them cached so back/forward is instant and a
    // remount doesn't refetch on mobile radio. One retry for flaky mobile nets.
    // Failures (empty pages) are evicted below so they never poison the cache.
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  // Never cache an empty read: a failure cached for 10min is what made ch2
  // unloadable after navigating from ch1 (prefetch stored the failure, the
  // navigation hit the same key). Evict empties immediately.
  useReadingViewTracker('manga',readingViewId(mangaId),!!data&&!isLoading&&!error);

  useEffect(() => {
    if (isFetching || !data) return;
    if ((data.data?.pages?.length ?? 0) > 0) return;
    void queryClient.removeQueries({
      queryKey: ["manga-read", mangaId, chapterKey, provider, providerChapterId, alternativesKey, reloadNonce],
      exact: true,
    });
  }, [isFetching, data, queryClient, mangaId, chapterKey, provider, providerChapterId, alternativesKey, reloadNonce]);

  // If a read came back with no pages (e.g. the URL's source 404'd) and the
  // chapter list has since supplied sources that router state didn't, retry once
  // so the read call can fall back to the same chapter from another scanlator.
  // Keyed on the full chapter identity (not just chapterKey) so switching
  // provider on the same chapter retries instead of showing a stale failure.
  const retriedForRef = useRef<string>("");
  // Declared early: the chapter-reset effect below clears it on same-route
  // navigation (no remount), and effects run after the full render pass.
  const savedRef = useRef<string>("");
  useEffect(() => {
    if (isFetching || !data) return;
    if ((data.data?.pages?.length ?? 0) > 0) return;
    if (matchedSources.length === 0) return;
    const retryKey = `${chapterKey}|${provider}|${providerChapterId}|${alternativesKey}`;
    if (retriedForRef.current === retryKey) return; // one retry per chapter identity
    retriedForRef.current = retryKey;
    setReloadNonce((n) => n + 1);
  }, [isFetching, data, matchedSources, stateAlternatives, chapterKey, provider, providerChapterId, alternativesKey]);

  const pages = data?.data?.pages ?? [];
  const total = pages.length;
  const resolvedProvider = data?.data?.chapter?.provider || provider;

  const { data: detailResp } = useMangaDetail(mangaId);
  const detail = detailResp?.detail;
  const mangaTitle =
    detail?.title?.english || detail?.title?.romaji || detail?.canonicalTitle || uiI18n.t('app.manga_87db0f99');
  const mangaPoster = detail?.coverImage ?? null;
  const mangaFormat = detail?.format ?? null;

  // Prefer the number threaded through the URL (provider-independent); fall back
  // to the pages response, then null. Never surfaces the raw provider:key string.
  const resolvedNumber = useMemo(() => {
    const fromParam = chapterNumberParam != null ? Number(chapterNumberParam) : NaN;
    if (Number.isFinite(fromParam)) return fromParam;
    const fromData = data?.data?.chapter?.number;
    return typeof fromData === "number" && Number.isFinite(fromData) ? fromData : null;
  }, [chapterNumberParam, data]);

  // Discord RPC — update whenever the chapter or title changes.
  useEffect(() => {
    if (!isNative || !mangaTitle || mangaTitle === "Manga") return;
    setReadingMangaRpc({
      mangaTitle,
      chapter: resolvedNumber,
      mangaImageUrl: mangaPoster,
      mangaUrl: `https://tatakai.me/manga/${mangaId}`,
    });
    return () => {
      clearDiscordRpc();
    };
  }, [isNative, mangaTitle, mangaPoster, resolvedNumber, mangaId]);

  const title = useMemo(() => {
    if (chapterTitleParam) return chapterTitleParam;
    const t = data?.data?.chapter?.title;
    if (t) return t;
    return resolvedNumber != null ? `Chapter ${resolvedNumber}` : "Chapter";
  }, [chapterTitleParam, data, resolvedNumber]);

  const currentIndex = useMemo(() => {
    if (!chapters.length) return -1;
    if (resolvedNumber != null) {
      const byNum = chapters.findIndex((c) => c.chapterNumber === resolvedNumber);
      if (byNum >= 0) return byNum;
    }
    return chapters.findIndex((c) => c.sources?.some((s) => s.chapterKey === chapterKey));
  }, [chapters, resolvedNumber, chapterKey]);

  // ── Cross-chapter continuous scroll (vertical mode) ──────────────────────────
  // When on, the reader streams adjacent chapters onto the same scroll surface:
  // the next chapter loads as you near the end, the previous one prepends when you
  // scroll back past the top. The active (top-most visible) chapter drives the
  // header, nav buttons and progress so everything tracks what you're reading.
  const continuous = settings.continuousScroll && settings.readingMode === "vertical";
  const {
    before, after, appendNext, prependPrev, loadingNext, loadingPrev, hasNext, hasPrev, blockedIndex,
  } = useContinuousReader({
    enabled: continuous,
    mangaId: mangaId || "",
    chapters,
    entryIndex: currentIndex,
    preferProvider: resolvedProvider,
    lockedProvider,
  });

  const [activeIndex, setActiveIndex] = useState(-1);
  useEffect(() => {
    setActiveIndex(currentIndex);
  }, [currentIndex]);

  const navIndex = continuous && activeIndex >= 0 ? activeIndex : currentIndex;

  // Per-chapter display metadata (number/title/provider/total) for the entry plus
  // every streamed segment — the header and progress read the *active* chapter's.
  // Also carries the resume-fidelity coordinates (chapterKey, scanlation group,
  // provider chapter id, extension namespace) so progress saves target the exact
  // source being read even after the stream has scrolled into another chapter.
  const entryScanlator = useMemo(() => {
    const src = chapters[currentIndex]?.sources || [];
    const match =
      src.find((s) => s.chapterKey === chapterKey) ||
      src.find((s) => s.provider === resolvedProvider) ||
      src[0];
    return match?.scanlator ?? null;
  }, [chapters, currentIndex, chapterKey, resolvedProvider]);
  const entryExtensionId = data?.data?.readMeta?.provider ?? null;

  const chapterMetaByIndex = useMemo(() => {
    const m = new Map<
      number,
      {
        number: number | null;
        title: string;
        provider: string;
        total: number;
        key: string;
        scanlator: string | null;
        providerChapterId: string | null;
        extensionId: string | null;
      }
    >();
    if (currentIndex >= 0)
      m.set(currentIndex, {
        number: resolvedNumber, title, provider: resolvedProvider, total,
        key: chapterKey, scanlator: entryScanlator,
        providerChapterId, extensionId: entryExtensionId,
      });
    before.forEach((s) => m.set(s.index, {
      number: s.number, title: s.title, provider: s.provider, total: s.pages.length,
      key: s.key, scanlator: s.scanlator, providerChapterId: s.providerChapterId, extensionId: s.extensionId,
    }));
    after.forEach((s) => m.set(s.index, {
      number: s.number, title: s.title, provider: s.provider, total: s.pages.length,
      key: s.key, scanlator: s.scanlator, providerChapterId: s.providerChapterId, extensionId: s.extensionId,
    }));
    return m;
  }, [currentIndex, resolvedNumber, title, resolvedProvider, total, chapterKey, entryScanlator, providerChapterId, entryExtensionId, before, after]);

  const activeMeta = (continuous && chapterMetaByIndex.get(navIndex)) || null;
  const displayNumber = activeMeta ? activeMeta.number : resolvedNumber;
  const displayTitle = activeMeta ? activeMeta.title : title;
  const displayProvider = activeMeta ? activeMeta.provider : resolvedProvider;
  const [chapterNotification, setChapterNotification] = useState<string | null>(null);
  const notifiedChapterRef = useRef<string | null>(null);
  const notificationChapterKey = activeMeta?.key || chapterKey;
  useEffect(() => {
    if (!notificationChapterKey || total === 0 || isLoading) return;
    const previous = notifiedChapterRef.current;
    notifiedChapterRef.current = notificationChapterKey;
    if (!settings.showNotifications) { setChapterNotification(null); return; }
    if (!previous || previous === notificationChapterKey) return;
    setChapterNotification(displayTitle || `Chapter ${displayNumber ?? navIndex + 1}`);
    const timer = setTimeout(() => setChapterNotification(null), 3000);
    return () => { clearTimeout(timer); setChapterNotification(null); };
  }, [notificationChapterKey, total, isLoading, settings.showNotifications, displayTitle, displayNumber, navIndex]);

  const prevChapter = navIndex > 0 ? chapters[navIndex - 1] : null;
  const nextChapter =
    navIndex >= 0 && navIndex < chapters.length - 1 ? chapters[navIndex + 1] : null;

  const navToChapter = useCallback((chapter: MappedMangaChapter | null) => {
    if (!chapter || !mangaId) return;
    const src = sortMangaChapterSources(chapter.sources);
    // Prefer staying on the provider that actually served the current chapter,
    // but only when the target chapter HAS that provider — pinning to the
    // previous fallback winner when the next chapter lacks it forced a dead
    // source (ch1 fallback allmanga → ch2 forced allmanga even when dead).
    // Otherwise fall back to the chapter's first (reliability-ordered) source.
    const source = pickMangaChapterSource(src, lockedProvider || displayProvider, Boolean(lockedProvider));
    if (!source) {
      if (lockedProvider) setBlockedChapter(chapter);
      return;
    }
    setBlockedChapter(null);
    const params = new URLSearchParams();
    if (lockedProvider) params.set("lockedProvider", lockedProvider);
    params.set("chapterKey", source.chapterKey);
    if (source.provider) params.set("provider", source.provider);
    if (source.providerChapterId) params.set("providerChapterId", source.providerChapterId);
    if (chapter.chapterNumber != null) params.set("chapterNumber", String(chapter.chapterNumber));
    if (chapter.chapterTitle) params.set("chapterTitle", chapter.chapterTitle);
    params.set("page", "0");
    // Carry the offline flag across chapter jumps so ProtectedRoute keeps the
    // reader reachable for the whole downloaded run (ban / maintenance / down).
    if (searchParams.get("offline") === "true") params.set("offline", "true");
    navigate(`/manga/read/${mangaId}?${params.toString()}`, { state: { sources: src } });
  }, [mangaId, navigate, displayProvider, lockedProvider, searchParams]);

  const switchProvider = useCallback((
    source: MangaChapterSource,
    targetChapter?: MappedMangaChapter | null,
  ) => {
    if (!mangaId) return;
    const params = new URLSearchParams(searchParams);
    params.set("chapterKey", source.chapterKey);
    params.set("provider", source.provider);
    if (lockedProvider) params.set("lockedProvider", source.provider);
    setBlockedChapter(null);
    if (source.providerChapterId) params.set("providerChapterId", source.providerChapterId);
    else params.delete("providerChapterId");
    if (targetChapter?.chapterNumber != null) {
      params.set("chapterNumber", String(targetChapter.chapterNumber));
    } else if (targetChapter) params.delete("chapterNumber");
    if (targetChapter?.chapterTitle) params.set("chapterTitle", targetChapter.chapterTitle);
    else if (targetChapter) params.delete("chapterTitle");
    params.set("page", "0");
    const targetSources = targetChapter
      ? sortMangaChapterSources(targetChapter.sources)
      : alternatives;
    navigate(`/manga/read/${mangaId}?${params.toString()}`, { state: { sources: targetSources } });
    void triggerHaptic('select');
  }, [mangaId, alternatives, navigate, searchParams, lockedProvider]);

  const retryChapterPages = useCallback(() => {
    const currentProvider = resolvedProvider || provider;
    const currentChapterKey = data?.data?.chapter?.chapterKey || chapterKey;
    const currentProviderChapterId = data?.data?.chapter?.providerChapterId || providerChapterId;
    const fallback = nextMangaChapterSource(alternatives, {
      provider: currentProvider,
      chapterKey: currentChapterKey,
      providerChapterId: currentProviderChapterId,
    });
    if (
      fallback &&
      (fallback.provider !== currentProvider ||
        fallback.chapterKey !== currentChapterKey ||
        (fallback.providerChapterId || "") !== (currentProviderChapterId || ""))
    ) {
      switchProvider(fallback);
      return;
    }
    // One-source chapter: evict every nonce variant and request fresh signed
    // image URLs from the extension before retrying the image itself.
    void queryClient.removeQueries({
      queryKey: ["manga-read", mangaId, chapterKey],
      exact: false,
    });
    setReloadNonce((n) => n + 1);
  }, [alternatives, provider, chapterKey, providerChapterId, resolvedProvider, data, switchProvider, queryClient, mangaId]);

  const retryStreamedChapter = useCallback((seg: ReaderSegment) => {
    const chapter = chapters[seg.index];
    if (!chapter) return;
    const fallback = nextMangaChapterSource(chapter.sources.filter((s) => !lockedProvider || s.provider === lockedProvider), {
      provider: seg.provider,
      chapterKey: seg.key,
      providerChapterId: seg.providerChapterId,
    });
    if (
      fallback &&
      (fallback.provider !== seg.provider ||
        fallback.chapterKey !== seg.key ||
        (fallback.providerChapterId || "") !== (seg.providerChapterId || ""))
    ) {
      switchProvider(fallback, chapter);
      return;
    }
    navToChapter(chapter);
  }, [chapters, navToChapter, switchProvider, lockedProvider]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  // Prepend (loading the previous chapter) only after the reader has actually been
  // scrolled — otherwise the top sentinel, visible on mount, would eagerly pull the
  // previous chapter before the user ever scrolls up.
  const interactedRef = useRef(false);
  // Snapshot of scroll geometry captured when a prepend starts, so we can keep the
  // viewport pinned to the same page after the previous chapter is inserted above.
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const beforeLenRef = useRef(0);
  const [pageIndex, setPageIndex] = useState(0);
  const restoringPage = useReaderResume({ rootRef: scrollRef,
    identity: [mangaId, chapterKey, provider, providerChapterId].join('|'),
    page: pageParam, currentPage: pageIndex, total, vertical: settings.readingMode === 'vertical', onPage: setPageIndex });
  // The reader is a full-window takeover, but MainLayout pushes it down 32px for
  // the desktop titlebar (pt-8). The inner scroll area used to be hard-coded to
  // calc(100vh - 49px) — 32px too tall — so the page overflowed and the *window*
  // scrolled too: two scrollbars fighting the wheel. We lock the document scroll
  // and size the scroll area to what's actually left below the nav (measured, so
  // it tracks the titlebar offset and fullscreen automatically).
  const [scrollH, setScrollH] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerHeight : 0,
  );

  // Same-route navigation (ch1 → ch2) does NOT remount: reset every
  // per-chapter guard so the new chapter retries, saves progress, and starts
  // at page 0 instead of inheriting ch1's "already retried/saved" state.
  // Deps include the full chapter identity — chapterKey alone misses
  // provider switches on the same chapter.
  useEffect(() => {
    setPageIndex(clampReaderPageIndex(pageParam, total));
    if (!Number.isFinite(pageParam) || pageParam <= 0) scrollRef.current?.scrollTo({ top: 0 });
    retriedForRef.current = "";
    savedRef.current = "";
    setReloadNonce(0);
    setActiveIndex(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mangaId, chapterKey, provider, providerChapterId, pageParam]);

  // Prefetch the next chapter's pages when the user is near the end (last 3
  // pages) so navigating forward is instant. Uses the same query key shape as
  // the main read query (including the alternatives fingerprint) so it becomes
  // a cache hit when navToChapter fires — and passes the same alternatives so
  // a dead primary falls back instead of caching a failure that poisons the
  // navigation. Failures are never cached (throw => prefetch stays uncached).
  // Placed after the pageIndex state — effects may not read it before init.
  useEffect(() => {
    if (!nextChapter || total === 0 || pageIndex < total - 3) return;
    const orderedNextSources = sortMangaChapterSources(nextChapter.sources).filter((s) => !lockedProvider || s.provider === lockedProvider);
    const src = pickMangaChapterSource(orderedNextSources, resolvedProvider);
    if (!src) return;
    const nextAlternatives = orderedNextSources;
    const nextAltKey = nextAlternatives
      .map((s) => `${s.provider}::${s.chapterKey}::${s.providerChapterId || ""}`)
      .sort()
      .join('|');
    void queryClient.prefetchQuery({
      queryKey: [
        "manga-read", mangaId, src.chapterKey, src.provider,
        src.providerChapterId || "", nextAltKey, 0,
      ],
      queryFn: async () => {
        const res = await getMangaReadByKey(mangaId || "", src.chapterKey, {
          provider: src.provider,
          providerChapterId: src.providerChapterId || undefined,
          alternatives: nextAlternatives.length ? nextAlternatives : undefined,
        });
        // Don't poison the cache: empty reads throw so prefetch stores nothing
        // and the real navigation fetches fresh with its own fallbacks.
        if (!res?.data?.pages?.length) throw new Error(uiI18n.t('app.prefetch_no_pages_yet_e6de1d7b'));
        return res;
      },
      staleTime: 10 * 60 * 1000,
    }).catch(() => {});
  }, [pageIndex, total, nextChapter, mangaId, resolvedProvider, queryClient, lockedProvider]);

  // Vertical mode (single chapter): track the top-most visible page for progress.
  useEffect(() => {
    if (continuous || settings.readingMode !== "vertical" || total === 0) return;
    const root = scrollRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries
        .filter((e) => e.isIntersecting)
        .map((e) => Number(e.target.getAttribute("data-page")))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      if (vis.length && !restoringPage.current) setPageIndex(Math.max(0, vis[0] - 1));
    }, { root, threshold: 0.4 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [continuous, settings.readingMode, total, chapterKey, restoringPage]);

  // Continuous mode: track the top-most visible page across ALL streamed chapters
  // (each page's chapter is read from its `[data-ch]` wrapper) to drive the active
  // chapter (header/nav) and the in-chapter page index (progress).
  useEffect(() => {
    if (!continuous || total === 0) return;
    const root = scrollRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-page]"));
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries
        .filter((e) => e.isIntersecting)
        .map((e) => ({
          ch: Number((e.target as HTMLElement).closest("[data-ch]")?.getAttribute("data-ch")),
          pg: Number(e.target.getAttribute("data-page")),
          top: e.boundingClientRect.top,
        }))
        .filter((v) => Number.isFinite(v.ch) && Number.isFinite(v.pg))
        .sort((a, b) => a.top - b.top);
      if (!vis.length || restoringPage.current) return;
      setActiveIndex(vis[0].ch);
      setPageIndex(Math.max(0, vis[0].pg - 1));
    }, { root, threshold: 0.2 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [continuous, total, chapterKey, before.length, after.length, restoringPage]);

  // Bottom sentinel → load the next chapter as it comes into range.
  useEffect(() => {
    if (!continuous || !hasNext) return;
    const root = scrollRef.current;
    const el = bottomSentinelRef.current;
    if (!root || !el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void appendNext();
    }, { root, rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [continuous, total, hasNext, appendNext, before.length, after.length]);

  // Top sentinel → prepend the previous chapter (once the reader's been scrolled),
  // snapshotting scroll geometry so the layout effect below can pin the viewport.
  useEffect(() => {
    if (!continuous || !hasPrev) return;
    const root = scrollRef.current;
    const el = topSentinelRef.current;
    if (!root || !el) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      if (!interactedRef.current) return;
      prependAnchorRef.current = { height: root.scrollHeight, top: root.scrollTop };
      void prependPrev();
    }, { root, rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [continuous, total, hasPrev, prependPrev, before.length, after.length]);

  // After a previous chapter is prepended, restore the scroll offset by the height
  // that was inserted above, so the reader stays on the same page (no jump).
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    if (before.length > beforeLenRef.current && prependAnchorRef.current) {
      const delta = root.scrollHeight - prependAnchorRef.current.height;
      if (delta > 0) root.scrollTop = prependAnchorRef.current.top + delta;
      prependAnchorRef.current = null;
    }
    beforeLenRef.current = before.length;
  }, [before]);

  // ── Reading-progress persistence (Supabase; auto-syncs to AniList/MAL). ──
  const saveProgress = useSaveMangaReadingProgress();
  const pendingProgress = useRef<(() => void) | null>(null);
  useEffect(() => {
    const flush = () => { const pending = pendingProgress.current; pendingProgress.current = null; pending?.(); };
    window.addEventListener('pagehide', flush);
    return () => { flush(); window.removeEventListener('pagehide', flush); };
  }, [mangaId, chapterKey, provider, providerChapterId]);

  useEffect(() => {
    if (!user || !mangaId || total === 0) return;
    const key = `${chapterKey}|${provider}|${providerChapterId}`;
    if (savedRef.current === key) return;
    savedRef.current = key;
    saveProgress.mutate({
      mangaId, mangaTitle, mangaPoster, format: mangaFormat,
      lastChapterKey: chapterKey, lastChapterNumber: resolvedNumber, lastChapterTitle: title,
      lastProvider: resolvedProvider || null, lastLanguage: data?.data?.chapter?.language ?? null,
      lastPageIndex: clampReaderPageIndex(pageParam, total), totalPages: total,
      lastExtensionId: entryExtensionId, lastScanlator: entryScanlator, lastPageId: String(clampReaderPageIndex(pageParam, total) + 1),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mangaId, total, chapterKey, provider, providerChapterId]);

  // Debounced page/chapter tracker. In continuous mode this targets the ACTIVE
  // chapter (whichever segment is on screen) so resume returns to the exact page
  // of the exact group/extension being read, not the entry chapter.
  useEffect(() => {
    if (!user || !mangaId || total === 0) return;
    if (savedRef.current !== `${chapterKey}|${provider}|${providerChapterId}`) return;
    pendingProgress.current = () => {
      saveProgress.mutate({
        mangaId, mangaTitle, mangaPoster, format: mangaFormat,
        lastChapterKey: activeMeta ? activeMeta.key : chapterKey,
        lastChapterNumber: displayNumber,
        lastChapterTitle: displayTitle,
        lastProvider: displayProvider || null,
        lastExtensionId: activeMeta ? activeMeta.extensionId : entryExtensionId,
        lastScanlator: activeMeta ? activeMeta.scanlator : entryScanlator,
        lastPageIndex: pageIndex,
        lastPageId: String(pageIndex + 1),
        totalPages: activeMeta ? activeMeta.total : total,
      });
    };
    const t = setTimeout(() => { const pending = pendingProgress.current; pendingProgress.current = null; pending?.(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, navIndex]);

  // ── Fullscreen: OS-level in Electron (hides titlebar + sidebar + tray via the
  // `app-fullscreen` class, mirroring EmbedPlayer), DOM Fullscreen on the web. ──
  const { isFs, enterFullscreen, exitFullscreen, toggleFullscreen, fullscreenExitVisible } = useReaderFullscreen(containerRef, settings.autoFullscreen, total);
  const chromeVisible = !isFs || !settings.hideChromeInFullscreen;

  // ── Keep the screen awake while reading. Native shells use the KeepAwake
  // plugin (the Web Wake Lock API doesn't exist in the Capacitor WebView);
  // web falls back to Wake Lock, re-acquiring on tab focus. ──
  useEffect(() => {
    if (!settings.keepScreenAwake) return;
    if (isNative) {
      void KeepAwake.keepAwake();
      return () => {
        void KeepAwake.allowSleep();
      };
    }
    let lock: { release?: () => Promise<void> } | null = null;
    let released = false;
    const wl = (navigator as unknown as {
      wakeLock?: { request: (t: string) => Promise<{ release?: () => Promise<void> }> };
    }).wakeLock;
    if (!wl) return;
    const acquire = () => {
      wl.request("screen")
        .then((l) => { if (!released) lock = l; else void l.release?.(); })
        .catch(() => {});
    };
    acquire();
    const onVis = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release?.().catch(() => {});
    };
  }, [settings.keepScreenAwake, isNative]);

  // Lock the window scroll while the reader is mounted — the reader owns its own
  // scroll container, so the document must never scroll (that's the 2nd scrollbar).
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    document.body.classList.add("manga-reader-open");
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
      document.body.classList.remove("manga-reader-open");
    };
  }, []);

  // Size the scroll area to the space left below the nav (viewport height minus
  // the scroll container's top offset), so it never overflows into a 2nd scrollbar.
  useEffect(() => {
    const measure = () => {
      const top = scrollRef.current?.getBoundingClientRect().top ?? 0;
      setScrollH(Math.max(0, window.innerHeight - top));
    };
    measure();
    const raf = requestAnimationFrame(measure); // after layout settles
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [isFs, chromeVisible, isLoading, total]);

  const [showSettings, setShowSettings] = useState(false);
  const [showCommentsDrawer, setShowCommentsDrawer] = useState(false);
  const [showInlineComments, setShowInlineComments] = useState(false);
  const [showReaderNavigator, setShowReaderNavigator] = useState(false);
  const [chapterSearch, setChapterSearch] = useState("");
  useEffect(() => {
    if (!isFs) return;
    setShowSettings(false);
    setShowCommentsDrawer(false);
    setShowReaderNavigator(false);
    setShowInlineComments(false);
  }, [isFs]);
  const filteredChapters = useMemo(() => {
    const query = chapterSearch.trim().toLowerCase();
    if (!query) return chapters;
    return chapters.filter((chapter) =>
      String(chapter.chapterNumber ?? "").includes(query) ||
      String(chapter.chapterTitle ?? "").toLowerCase().includes(query) ||
      chapter.sources?.some((source) =>
        String(source.providerName || source.provider || "").toLowerCase().includes(query) ||
        String(source.scanlator ?? "").toLowerCase().includes(query),
      ),
    );
  }, [chapterSearch, chapters]);
  const unavailableChapter = blockedChapter || (blockedIndex != null ? chapters[blockedIndex] : null);
  const navigatorChapter = unavailableChapter || (navIndex >= 0 ? chapters[navIndex] ?? null : null);
  const navigatorSources = useMemo(
    () => sortMangaChapterSources(navigatorChapter?.sources),
    [navigatorChapter],
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const updateRef = useRef(updateSetting);
  updateRef.current = updateSetting;
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const lastReaderTapRef = useRef<{ at: number; x: number; y: number } | null>(null);
  const pinchGesture = useReaderPinchZoom(scrollRef, settings.zoom, (zoom) => updateRef.current('zoom', zoom), settings.zoomWithWheel);

  const handleReaderPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    if (settingsRef.current.autoScroll) updateRef.current('autoScroll', false);
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointersRef.current.size > 1) lastReaderTapRef.current = null;
  }, []);

  const handleReaderPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const wasPinching = pinchGesture.current;
    activePointersRef.current.delete(event.pointerId);

    if (wasPinching) return;
    const previous = lastReaderTapRef.current;
    const current = { at: Date.now(), x: event.clientX, y: event.clientY };
    lastReaderTapRef.current = current;
    if (!previous) return;
    const closeInTime = current.at - previous.at < 320;
    const closeInSpace = Math.hypot(current.x - previous.x, current.y - previous.y) < 32;
    if (closeInTime && closeInSpace) {
      // Familiar reader gesture: double-tap toggles between edge-to-edge and
      // a comfortably enlarged view. Pinch remains continuous from 50–300%.
      if (isFs) exitFullscreen();
      else updateRef.current('zoom', settingsRef.current.zoom > 115 ? 100 : 175);
      void triggerHaptic('light');
      lastReaderTapRef.current = null;
    }
  }, [isFs, exitFullscreen, pinchGesture]);

  const handleReaderPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
  }, []);

  const goNextPage = useCallback(() => {
    void triggerHaptic("tap");
    if (settings.readingMode === "paged") {
      const step = settings.doublePage ? 2 : 1;
      setPageIndex((i) => Math.min(total - 1, i + step));
    } else scrollRef.current?.scrollBy({ top: (scrollRef.current?.clientHeight ?? 0) * 0.9, behavior: "smooth" });
  }, [settings.readingMode, settings.doublePage, total]);

  const goPrevPage = useCallback(() => {
    void triggerHaptic("tap");
    if (settings.readingMode === "paged") {
      const step = settings.doublePage ? 2 : 1;
      setPageIndex((i) => Math.max(0, i - step));
    } else scrollRef.current?.scrollBy({ top: -(scrollRef.current?.clientHeight ?? 0) * 0.9, behavior: "smooth" });
  }, [settings.readingMode, settings.doublePage]);

  const zoomIn = useCallback(
    () => updateSetting("zoom", Math.min(300, settings.zoom + 10)),
    [settings.zoom, updateSetting],
  );
  const zoomOut = useCallback(
    () => updateSetting("zoom", Math.max(50, settings.zoom - 10)),
    [settings.zoom, updateSetting],
  );

  const jumpToPage = useCallback((index: number) => {
    const next = clampReaderPageIndex(index, activeMeta?.total || total);
    interactedRef.current = true;
    setPageIndex(next);
    if (settings.readingMode === 'vertical') {
      const entry = scrollRef.current?.querySelector(`[data-ch="${navIndex}"]`) ?? scrollRef.current;
      const page = entry?.querySelectorAll<HTMLElement>('[data-page]')[next];
      if (page && scrollRef.current) {
        const root = scrollRef.current;
        root.scrollTo({ top: root.scrollTop + page.getBoundingClientRect().top - root.getBoundingClientRect().top, behavior: 'auto' });
      }
    }
  }, [total, activeMeta?.total, navIndex, settings.readingMode]);

  const scrollReader = (direction: number) => {
    interactedRef.current = true;
    if (settings.autoScroll) updateSetting('autoScroll', false);
    scrollRef.current?.scrollBy({ top: direction * 120, behavior: reducedMotion ? 'instant' : 'smooth' });
  };

  // Auto-scroll (vertical mode): advance the scroll position continuously.
  useEffect(() => {
    if (!settings.autoScroll || settings.readingMode !== "vertical" || total === 0 || showSettings || showReaderNavigator || showCommentsDrawer) return;
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    let previous = 0;
    const advance = (time: number) => {
      if (previous && !document.hidden) el.scrollBy({ top: settings.autoScrollSpeed * Math.min(32, time - previous) / 16, behavior: 'auto' });
      previous = time;
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [settings.autoScroll, settings.autoScrollSpeed, settings.readingMode, total, showSettings, showReaderNavigator, showCommentsDrawer]);
  const toggleDirection = useCallback(
    () => updateSetting("readingMode", settings.readingMode === "vertical" ? "paged" : "vertical"),
    [settings.readingMode, updateSetting],
  );

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);
  const toggleComments = useCallback(() => setShowCommentsDrawer((v) => !v), []);

  const capture = useCallback(async () => {
    const page = pages[pageIndex] || pages[0];
    if (!page) return;
    try {
      const target = page.proxiedImageUrl || page.imageUrl;
      let blob: Blob;
      if (isMobileProxyUrl(target)) {
        // In-app proxy page: resolve natively with header replay (WebView
        // fetch can neither send the CDN Referer nor read the token URL).
        const res = await fetchViaMobileProxy(target, {
          originalUrl: (page as { originalUrl?: string }).originalUrl || page.imageUrl,
          headers: (page as { headers?: unknown }).headers,
          responseType: "arraybuffer",
        });
        if (!res.ok || !res.data) return;
        blob = new Blob([res.data], {
          type: res.contentType.split(";")[0].trim() || "image/jpeg",
        });
      } else {
        const res = await fetch(target);
        blob = await res.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mangaTitle}-ch${resolvedNumber ?? ""}-p${page.pageNumber}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore capture failures */ }
  }, [pages, pageIndex, mangaTitle, resolvedNumber]);

  useReaderKeyboard(keybinds, {
    nextPage: goNextPage, prevPage: goPrevPage,
    scrollDown: () => scrollReader(1), scrollUp: () => scrollReader(-1),
    nextChapter: () => navToChapter(nextChapter), prevChapter: () => navToChapter(prevChapter),
    toggleFullscreen, toggleDirection, zoomIn, zoomOut, toggleComments: isFs ? undefined : toggleComments, reload,
  }, !showSettings && !showReaderNavigator && !showCommentsDrawer);
  useTVReader({ next: goNextPage, previous: goPrevPage, controls: () => setShowSettings(true) });

  const isCoarsePointer = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches,
    [],
  );

  const { vertical: widthStyle, paged: pagedStyle } = readerImageStyles(settings, isCoarsePointer || isNative);

  const eagerFor = (idx: number) => readerPageIsEager(settings, idx, pageIndex, isCoarsePointer || isNative);

  // Streamed (non-entry) chapters can't use the entry's page-index window; eager-load
  // their first couple of pages so the boundary is seamless, lazy-load the rest.
  const segEager = (idx: number) => {
    const effectivePreloading =
      settings.preloading === "partial"
        ? getProfileKnobs(getEffectiveMemoryProfile()).readerPreload
        : settings.preloading;
    // Mobile: eager-load a deeper boundary window for seamless chapter joins.
    const boundary = isCoarsePointer || isNative ? 5 : 2;
    return settings.loadingStrategy === "eager" || effectivePreloading === "full" || idx < boundary;
  };

  // Warm the native blob cache for pages just ahead of the viewport so the
  // image element finds them already resolved (parallel, bounded, best-effort).
  // This is what makes mobile vertical scroll feel instant after the first pages.
  useEffect(() => {
    if (!pages.length) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      void import("@/core/extensions/mobile/mobileProxy").then((m) => {
        if (cancelled || typeof m.prefetchMobileReaderImages !== "function") return;
        const ahead = pages.slice(pageIndex, pageIndex + 8);
        m.prefetchMobileReaderImages(ahead, { concurrency: 3 });
      }).catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [pages, pageIndex, chapterKey]);


  return (
    <div ref={containerRef} data-reader-fullscreen={isFs || undefined} className="relative min-h-screen text-foreground" style={{ backgroundColor: settings.backgroundColor }}>
      {chapterNotification && settings.showNotifications && <div role="status" className="pointer-events-none fixed left-1/2 top-20 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-border bg-background/95 px-4 py-3 text-sm shadow-lg">{chapterNotification}</div>}
      {/* The title and page counter open navigation; the back arrow opens manga info. */}
      {chromeVisible && <ReaderTopbar>
        <button
          onClick={() => navigate(mangaId ? `/manga/${mangaId}` : "/manga")}
          className="ui-button inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm font-semibold hover:bg-muted active:scale-95"
          aria-label={uiI18n.t('app.back_to_manga_74b30d6b')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          disabled={!prevChapter}
          onClick={() => navToChapter(prevChapter)}
          className="ui-button inline-flex min-h-11 shrink-0 items-center gap-0.5 sm:gap-1 rounded-lg border border-border px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm font-semibold hover:bg-muted active:scale-95 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /><span className="hidden min-[380px]:inline">{uiI18n.t('app.prev_e96fea52')}</span>
        </button>
        <button
          onClick={() => setShowReaderNavigator(true)}
          className="flex min-h-11 min-w-0 flex-1 flex-col items-center px-1 sm:px-2 text-center"
          title={uiI18n.t('app.open_chapter_and_provider_navigator_cb69d7c3')}
          aria-label={uiI18n.t('app.open_chapter_and_provider_navigator_cb69d7c3')}
        >
          <span className="w-full truncate text-xs sm:text-sm font-bold">
            {mangaTitle}
            {isOfflineChapter ? (
              <span className="ml-1.5 inline-block rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                {uiI18n.t('app.offline_e01fa717')}
              </span>
            ) : null}
          </span>
          <span className="w-full truncate text-[11px] sm:text-xs text-muted-foreground">
            {displayTitle}{displayProvider ? uiI18n.t('app.i18n_value_0_92e4cd32', { value0: alternatives.find(s => s.provider === displayProvider)?.providerName || displayProvider }) : ""}{total > 0 ? settings.progressIndicator === 'chapter' ? uiI18n.t('app.chapter_i18n_value_0_26b035da', { value0: displayNumber ?? navIndex + 1 }) : uiI18n.t('app.page_i18n_value_0_i18n_value_1_dd00d973', { value0: pageIndex + 1, value1: activeMeta?.total || total }) : ""}
          </span>
        </button>
        <button
          onClick={() => { setShowReaderNavigator(true); void triggerHaptic('open'); }}
          className="ui-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-muted active:scale-95"
          aria-label={uiI18n.t('app.open_chapter_and_provider_navigator_cb69d7c3')}
        >
          <span className="sr-only">{uiI18n.t('app.chapter_navigation_d3eff174')}</span><List className="h-4 w-4" />
        </button>
        <button
          disabled={!nextChapter}
          onClick={() => navToChapter(nextChapter)}
          className="ui-button inline-flex min-h-11 shrink-0 items-center gap-0.5 sm:gap-1 rounded-lg border border-border px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm font-semibold hover:bg-muted active:scale-95 disabled:opacity-40"
        >
          <span className="hidden min-[380px]:inline">{uiI18n.t('app.next_bc981983')}</span> <ChevronRight className="h-4 w-4" />
        </button>
      </ReaderTopbar>}

      {settings.showProgressBar && total > 0 && (
        <div role="progressbar" aria-label={uiI18n.t('app.chapter_reading_progress_ad38d32c')} aria-valuemin={0} aria-valuemax={activeMeta?.total || total} aria-valuenow={pageIndex + 1} className="pointer-events-none fixed inset-x-0 bottom-0 z-50 h-1 bg-muted/40">
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, (pageIndex + 1) / (activeMeta?.total || total) * 100)}%` }} />
        </div>
      )}

      {/* Right vertical toolbar — slimmer + lower on mobile so it never covers pages */}
      <ReaderToolbar visible={chromeVisible || fullscreenExitVisible}>
        {chromeVisible && <TranslateChapterButton anilistId={Number(mangaId)} chapterKey={activeMeta?.key || chapterKey} title={mangaTitle} chapterLabel={displayTitle} provider={displayProvider || undefined} providerChapterId={providerChapterId || undefined} chapterNumber={resolvedNumber ?? undefined} />}
        {chromeVisible && <ToolBtn label={uiI18n.t('app.settings_c7f73bb5')} onClick={() => setShowSettings(true)}><Settings2 className="h-5 w-5" /></ToolBtn>}
        <ToolBtn label={isFs ? uiI18n.t('app.exit_fullscreen_1302df0b') : uiI18n.t('app.fullscreen_bb08d10b')} onClick={toggleFullscreen} active={isFs}>
          {isFs ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </ToolBtn>
        {chromeVisible && <>
        <ToolBtn label={uiI18n.t('app.reading_tools_74769f12')} onClick={() => setShowReaderNavigator(true)}><List className="h-5 w-5" /></ToolBtn>
        <ToolBtn label={uiI18n.t('app.manga_info_087808bc')} onClick={() => navigate(`/manga/${mangaId}`)}><Info className="h-5 w-5" /></ToolBtn>
        <ToolBtn label={uiI18n.t('app.home_70f8bb9a')} onClick={() => navigate("/")}><Home className="h-5 w-5" /></ToolBtn>
        {settings.showCaptureButton && <ToolBtn label={uiI18n.t('app.capture_page_b4c28650')} onClick={capture}><Camera className="h-5 w-5" /></ToolBtn>}
        {settings.showComments && <ToolBtn label={uiI18n.t('app.comments_fce06e20')} onClick={toggleComments} active={showCommentsDrawer}><MessageSquare className="h-5 w-5" /></ToolBtn>}
        {settings.showReloadButton && <ToolBtn label={uiI18n.t('app.reload_cce71553')} onClick={reload}><RefreshCw className={`h-5 w-5 ${isFetching ? "animate-spin" : ""}`} /></ToolBtn>}
        </>}
      </ReaderToolbar>

      <div className="relative">
      {chromeVisible && <ReaderPageRail page={pageIndex} total={activeMeta?.total || total} onPage={jumpToPage} />}
      <div
        ref={scrollRef}
        data-reader-scroll
        onScroll={(event) => {
          interactedRef.current = true;
          // At high zoom the narrow sentinel can be outside the horizontal
          // viewport. Vertical proximity must still advance the chapter.
          const root = event.currentTarget;
          if (continuous && hasNext && root.scrollHeight - root.scrollTop - root.clientHeight < 400) {
            void appendNext();
          }
        }}
        onDoubleClick={(event) => {
          const capabilities = (event.nativeEvent as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities;
          if (capabilities?.firesTouchEvents) return;
          if (isFs) exitFullscreen();
          else updateRef.current('zoom', settingsRef.current.zoom > 115 ? 100 : 175);
          void triggerHaptic('light');
        }}
        onPointerDown={handleReaderPointerDown}
        onPointerUp={handleReaderPointerUp}
        onPointerCancel={handleReaderPointerCancel}
        onWheel={() => { if (settingsRef.current.autoScroll) updateRef.current('autoScroll', false); }}
        className={`mx-auto overflow-y-auto overscroll-contain py-0 sm:pr-4 sm:py-6 ${chromeVisible ? 'pl-2 sm:pl-4' : 'pl-0 sm:pl-4'} ${settings.zoom > 100 ? 'overflow-x-auto' : 'overflow-x-hidden'}`}
        style={{
          height: `${scrollH}px`,
          filter: settings.brightness < 100 ? `brightness(${settings.brightness / 100})` : undefined,
          touchAction: 'pan-x pan-y',
          overflowAnchor: 'none',
          scrollBehavior: 'auto',
        }}
      >
        {isLoading ? (
          <div role="status" className="flex min-h-[50vh] items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> {uiI18n.t('app.loading_pages_0c674f17')}
          </div>
        ) : null}

        {!isLoading && (!data?.success || total === 0) ? (
          <GlassPanel className="mx-auto max-w-xl border border-border p-6">
            <h2 className="text-xl font-bold">{uiI18n.t('app.unable_to_load_chapter_03142a30')}</h2>
            <p className="mt-2 text-muted-foreground">
              {data?.guidance?.message || data?.message ||
                (error instanceof Error ? error.message : uiI18n.t('app.no_pages_available_c08c7fce'))}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {uiI18n.t('app.pick_an_extension_provider_from_the_chapter_list_01c2cdf5')}
            </p>
            <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={reload} className="ui-button inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><RefreshCw className="h-4 w-4" />{uiI18n.t('app.retry_chapter_b073485a')}</button><button type="button" onClick={() => setShowReaderNavigator(true)} className="ui-button min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">{uiI18n.t('app.choose_provider_135a38f7')}</button></div>
          </GlassPanel>
        ) : null}

        {total > 0 && settings.readingMode === "vertical" ? (
          <>
            {continuous && hasPrev ? (
              <>
                <div ref={topSentinelRef} className="h-px w-full" />
                {loadingPrev ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {uiI18n.t('app.loading_previous_chapter_1797faa6')}
                  </div>
                ) : null}
              </>
            ) : null}

            {continuous
              ? before.map((seg) => (
                  <div key={seg.key} data-ch={seg.index}>
                    <ChapterDivider label={seg.number != null ? uiI18n.t('app.chapter_i18n_value_0_e0f6e591', { value0: seg.number }) : uiI18n.t('app.chapter_46b00590')} sub={seg.provider} />
                    {seg.fallbackUsed ? (
                      <ProviderFallbackNotice
                        requested={seg.requestedProvider}
                        active={seg.provider}
                        onChange={() => {
                          setActiveIndex(seg.index);
                          setShowReaderNavigator(true);
                        }}
                      />
                    ) : null}
                    <div className="flex flex-col items-center" style={{ gap: `${settings.gap}px` }}>
                      {seg.pages.map((page, idx) => (
                        <ReaderImage key={readerPageRenderKey(seg.key, page)} page={page} mode={settings.loadingMethod} style={widthStyle} eager={segEager(idx)} onRetryChapter={() => retryStreamedChapter(seg)} />
                      ))}
                    </div>
                  </div>
                ))
              : null}

            <div data-ch={currentIndex} data-reader-entry>
              {continuous && before.length ? (
                <ChapterDivider label={resolvedNumber != null ? uiI18n.t('app.chapter_i18n_value_0_e0f6e591', { value0: resolvedNumber }) : uiI18n.t('app.chapter_46b00590')} sub={alternatives.find(s => s.provider === resolvedProvider)?.providerName || resolvedProvider} />
              ) : null}
              {continuous && data?.data?.readMeta?.fallbackUsed && provider !== resolvedProvider ? (
                <ProviderFallbackNotice
                  requested={provider}
                  active={resolvedProvider}
                  onChange={() => {
                    setActiveIndex(currentIndex);
                    setShowReaderNavigator(true);
                  }}
                />
              ) : null}
              <div className="flex flex-col items-center" style={{ gap: `${settings.gap}px` }}>
                {pages.map((page, idx) => (
                  <ReaderImage key={readerPageRenderKey(chapterKey, page)} page={page} mode={settings.loadingMethod} style={widthStyle} eager={eagerFor(idx)} onRetryChapter={retryChapterPages} />
                ))}
              </div>
            </div>
            {continuous
              ? after.map((seg) => (
                  <div key={seg.key} data-ch={seg.index}>
                    <ChapterDivider label={seg.number != null ? uiI18n.t('app.chapter_i18n_value_0_e0f6e591', { value0: seg.number }) : uiI18n.t('app.chapter_46b00590')} sub={seg.provider} />
                    {seg.fallbackUsed ? (
                      <ProviderFallbackNotice
                        requested={seg.requestedProvider}
                        active={seg.provider}
                        onChange={() => {
                          setActiveIndex(seg.index);
                          setShowReaderNavigator(true);
                        }}
                      />
                    ) : null}
                    <div className="flex flex-col items-center" style={{ gap: `${settings.gap}px` }}>
                      {seg.pages.map((page, idx) => (
                        <ReaderImage key={readerPageRenderKey(seg.key, page)} page={page} mode={settings.loadingMethod} style={widthStyle} eager={segEager(idx)} onRetryChapter={() => retryStreamedChapter(seg)} />
                      ))}
                    </div>
                  </div>
                ))
              : null}

            {continuous && hasNext ? (
              <>
                {loadingNext ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {uiI18n.t('app.loading_next_chapter_3f34ab50')}
                  </div>
                ) : null}
                <div ref={bottomSentinelRef} className="h-px w-full" />
              </>
            ) : null}
          </>
        ) : null}

        {total > 0 && settings.readingMode === "paged" ? (
          <div className="relative flex min-h-full items-center justify-center">
            {settings.doublePage && pages[pageIndex + 1] ? (
              <div
                className="flex items-center justify-center gap-1"
                style={{ flexDirection: settings.readingDirection === "rtl" ? "row-reverse" : "row" }}
              >
                <ReaderImage key={readerPageRenderKey(chapterKey, pages[pageIndex])} page={pages[pageIndex]} mode={settings.loadingMethod} style={pagedStyle} eager onRetryChapter={retryChapterPages} />
                <ReaderImage key={readerPageRenderKey(chapterKey, pages[pageIndex + 1])} page={pages[pageIndex + 1]} mode={settings.loadingMethod} style={pagedStyle} eager onRetryChapter={retryChapterPages} />
              </div>
            ) : pages[pageIndex] ? (
              <ReaderImage key={readerPageRenderKey(chapterKey, pages[pageIndex])} page={pages[pageIndex]} mode={settings.loadingMethod} style={pagedStyle} eager onRetryChapter={retryChapterPages} />
            ) : null}
            {settings.clickToTurn ? (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={settings.readingDirection === "rtl" ? uiI18n.t('app.next_page_4bfc194b') : uiI18n.t('app.previous_page_81f54719')}
                  onClick={(e) => {
                    if (settings.readingDirection === "rtl") goNextPage();
                    else goPrevPage();
                    // Drop focus so the invisible tap zone never shows a
                    // focus ring (the orange "box" in paged mode) once the
                    // user continues with arrow keys.
                    e.currentTarget.blur();
                  }}
                  className="absolute left-0 top-0 h-full w-1/3 cursor-pointer bg-transparent outline-none focus:outline-none focus-visible:outline-none"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={settings.readingDirection === "rtl" ? uiI18n.t('app.previous_page_81f54719') : uiI18n.t('app.next_page_4bfc194b')}
                  onClick={(e) => {
                    if (settings.readingDirection === "rtl") goPrevPage();
                    else goNextPage();
                    e.currentTarget.blur();
                  }}
                  className="absolute right-0 top-0 h-full w-1/3 cursor-pointer bg-transparent outline-none focus:outline-none focus-visible:outline-none"
                />
              </>
            ) : null}
          </div>
        ) : null}

        {/* End-of-chapter comments — rendered for BOTH vertical and paged modes so
            downloaded/offline reading surfaces the same threads as online reading.
            In continuous vertical mode it only appears once the final chapter loads. */}
        {!isFs && total > 0 && settings.showComments && mangaId && (!continuous || !hasNext) ? (
          <div className="mx-auto mt-10 w-full max-w-3xl">
            <button
              onClick={() => setShowInlineComments((v) => !v)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-muted"
            >
              <MessageSquare className="h-4 w-4" />
                  {showInlineComments ? uiI18n.t('app.hide_comments_ac7a3920') : uiI18n.t('app.show_comments_44811513')}
            </button>
            {showInlineComments ? (
              <div className="mt-5 space-y-8">
                {displayNumber != null ? (
                  <Comments
                    entityType="manga"
                    entityId={mangaId}
                    episodeId={String(displayNumber)}
                    entityName={`${mangaTitle} · ${displayTitle}`}
                  />
                ) : <Comments entityType="manga" entityId={mangaId} entityName={mangaTitle} />}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      </div>
      {lockedProvider && unavailableChapter && (
        <div role="status" className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 text-sm shadow-lg">
          <p>No more sources available from {chapters.flatMap((c) => c.sources).find((s) => s.provider === lockedProvider)?.providerName || lockedProvider} for chapter {unavailableChapter.chapterNumber ?? unavailableChapter.canonicalOrder + 1}.</p>
          <button type="button" onClick={() => setShowReaderNavigator(true)} className="ui-button min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">{uiI18n.t('app.change_provider_85169368')}</button>
        </div>
      )}

      <ReaderNavigationSheet open={showReaderNavigator} onOpenChange={setShowReaderNavigator} page={pageIndex} total={activeMeta?.total || total} onPage={jumpToPage} settings={settings} updateSetting={updateSetting}>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={chapterSearch}
                onChange={(event) => setChapterSearch(event.target.value)}
                aria-label={uiI18n.t('app.search_chapters_and_providers_9ec7e68c')}
                placeholder={uiI18n.t('app.search_chapter_title_or_provider_25e61c46')}
                className="h-11 w-full rounded-xl border border-border bg-muted/50 pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{uiI18n.t('app.provider_7ceee3f3')}</h3>
              <div className="mb-3"><MangaSourceStatus count={new Set(navigatorSources.map(source => source.provider)).size} fetching={fetchingChapterSources || !!chaptersResp?.sourcesPending} /></div>
              <button type="button" aria-pressed={Boolean(lockedProvider)} disabled={!displayProvider} onClick={() => {
                const params = new URLSearchParams(searchParams);
                if (lockedProvider) params.delete('lockedProvider');
                else {
                  params.set('lockedProvider', displayProvider);
                  params.set('provider', displayProvider);
                  params.set('chapterKey', activeMeta?.key || data?.data?.chapter?.chapterKey || chapterKey);
                  const activeProviderChapterId = activeMeta?.providerChapterId || data?.data?.chapter?.providerChapterId || providerChapterId;
                  if (activeProviderChapterId) params.set('providerChapterId', activeProviderChapterId);
                  else params.delete('providerChapterId');
                  if (displayNumber != null) params.set('chapterNumber', String(displayNumber));
                  params.set('chapterTitle', displayTitle);
                  params.set('page', String(pageIndex));
                }
                setBlockedChapter(null);
                navigate(`${location.pathname}?${params}`, { replace: true, state: location.state });
              }} className="ui-button mb-3 flex min-h-11 w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left text-sm disabled:opacity-50">
                {lockedProvider ? <Lock className="h-4 w-4 shrink-0" /> : <Unlock className="h-4 w-4 shrink-0" />}
                <span><span className="block font-semibold">Lock provider{lockedProvider ? ' · On' : ' · Off'}</span><span className="text-xs text-muted-foreground">Stay with your selected provider across chapters.</span></span>
              </button>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                {navigatorSources.map((source) => {
                  const active = source.provider === displayProvider && source.chapterKey === (activeMeta?.key || chapterKey);
                  return <button key={`${source.provider}:${source.chapterKey}:${source.providerChapterId || ''}`} onClick={() => { switchProvider(source, navigatorChapter); setShowReaderNavigator(false); }} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${active ? 'border-primary/50 bg-primary/10' : 'border-border bg-muted/30 hover:bg-muted/60'}`}>
                    <span className="font-medium">{source.providerName || source.provider}</span><span className="text-xs text-muted-foreground">{source.scanlator || uiI18n.t('app.chapter_source_8a19e6fa')}</span>
                  </button>;
                })}
                {!navigatorSources.length && !fetchingChapterSources && !chaptersResp?.sourcesPending && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{uiI18n.t('app.no_alternative_providers_are_available_for_this__4a054308')}</p>}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{uiI18n.t('app.chapter_46b00590')}</h3>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
                {filteredChapters.map((chapter) => <button key={chapter.canonicalOrder} onClick={() => { navToChapter(chapter); setShowReaderNavigator(false); void triggerHaptic('select'); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${chapter.canonicalOrder === currentIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60'}`}>
                  <span>{uiI18n.t('app.chapter_46b00590')} {chapter.chapterNumber ?? chapter.canonicalOrder + 1}</span><span className="max-w-[55%] truncate text-xs text-muted-foreground">{chapter.chapterTitle || ''}</span>
                </button>)}
                {!filteredChapters.length && <p className="py-8 text-center text-sm text-muted-foreground">{uiI18n.t('app.no_chapters_match_65196bae')}{chapterSearch}”.</p>}
              </div>
            </section>
      </ReaderNavigationSheet>

      {/* Settings — reuse the Settings-page ReaderPanel (one source of truth).
          Right-side sheet on desktop, thumb-friendly bottom sheet on mobile. */}
      <ReaderSettingsSheet open={showSettings} onOpenChange={setShowSettings} compact={compactReader} />

      {/* Comments — global (per-manga) + per-chapter (canonical number scope). */}
      <Sheet open={showCommentsDrawer} onOpenChange={setShowCommentsDrawer}>
        <SheetContent side="right" className="flex w-full flex-col overflow-hidden p-0 sm:max-w-lg">
          <Tabs defaultValue="chapter" className="flex h-full flex-col">
            <div className="border-b border-border px-4 pt-4">
              <SheetHeader className="mb-3">
                <SheetTitle>{uiI18n.t('app.comments_fce06e20')}</SheetTitle>
              </SheetHeader>
              <TabsList className="w-full">
                <TabsTrigger value="chapter" className="flex-1">{uiI18n.t('app.this_chapter_6f53c0e6')}</TabsTrigger>
                <TabsTrigger value="global" className="flex-1">{uiI18n.t('app.global_5f1184f7')}</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="chapter" className="flex-1 overflow-y-auto px-4 py-3">
              {mangaId && displayNumber != null ? (
                <Comments
                  entityType="manga"
                  entityId={mangaId}
                  episodeId={String(displayNumber)}
                  entityName={`${mangaTitle} · ${displayTitle}`}
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {uiI18n.t('app.chapter_comments_are_unavailable_for_this_chapte_7b857205')}
                </p>
              )}
            </TabsContent>
            <TabsContent value="global" className="flex-1 overflow-y-auto px-4 py-3">
              {mangaId ? <Comments entityType="manga" entityId={mangaId} entityName={mangaTitle} /> : null}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
}
