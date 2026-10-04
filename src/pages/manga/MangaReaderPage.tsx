import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { getMangaReadByKey, storeMangaTotalChapters } from "@/core/content/manga-client";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { useReaderSettings, DEFAULT_READER_SETTINGS } from "@/hooks/media/useReaderSettings";
import { getProfileKnobs } from "@/lib/memoryProfile";
import { useReaderKeybinds } from "@/hooks/media/useReaderKeybinds";
import { useReaderKeyboard } from "@/pages/manga/hooks/useReaderKeyboard";
import { useContinuousReader } from "@/pages/manga/hooks/useContinuousReader";
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
import { triggerHaptic } from "@/lib/haptics";
import { setReadingMangaRpc, clearDiscordRpc } from "@/lib/discordRpc";

function ToolBtn({ label, onClick, active, children }: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/10 backdrop-blur transition-colors active:scale-95 ${
        active ? "bg-primary text-primary-foreground" : "bg-black/40 text-foreground hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function ChapterDivider({ label, sub }: { label: string; sub?: string | null }) {
  return (
    <div className="mx-auto my-6 flex w-full max-w-3xl items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="h-px flex-1 bg-white/10" />
      <span>{label}{sub ? ` · ${sub}` : ""}</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

export default function MangaReaderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isNative = useIsNativeApp();
  const { user } = useAuth();
  const { mangaId } = useParams<{ mangaId: string }>();
  const [searchParams] = useSearchParams();

  const { settings, updateSetting } = useReaderSettings();
  const { keybinds } = useReaderKeybinds();

  const chapterKey = searchParams.get("chapterKey") || searchParams.get("chapter") || "";
  const provider = searchParams.get("provider") || "";
  const providerChapterId = searchParams.get("providerChapterId") || chapterKey;
  const chapterNumberParam = searchParams.get("chapterNumber");
  const chapterTitleParam = searchParams.get("chapterTitle");
  const pageParam = Number(searchParams.get("page") || "0");

  const { data: chaptersResp } = useMangaChapters(mangaId);
  const chapters = useMemo<MappedMangaChapter[]>(() => {
    const list = chaptersResp?.mappedChapters ?? [];
    return [...list].sort((a, b) => a.canonicalOrder - b.canonicalOrder);
  }, [chaptersResp]);

  // Sources threaded from the click that opened the reader (MangaPage /
  // navToChapter), reliability-ordered. Absent on a refresh or deep link.
  const stateAlternatives = useMemo<MangaChapterSource[]>(() => {
    const raw = (location.state as { sources?: MangaChapterSource[] } | null)?.sources;
    return Array.isArray(raw) ? raw.filter((s) => s?.provider && s?.chapterKey) : [];
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
    return (ch?.sources || []).filter((s) => s?.provider && s?.chapterKey);
  }, [chapters, chapterKey, chapterNumberParam]);

  // Full fallback set: router state leads (reliability-ordered), then any other
  // sources from the chapter list not already present. Passed to the read call,
  // NOT the query key — so late-arriving list sources don't refetch a working
  // chapter (the failure-retry effect below re-runs only when a read came back
  // empty).
  const alternatives = useMemo<MangaChapterSource[]>(() => {
    const merged: MangaChapterSource[] = [...stateAlternatives];
    const seen = new Set(merged.map((s) => `${s.provider}::${s.chapterKey}`));
    for (const s of matchedSources) {
      const k = `${s.provider}::${s.chapterKey}`;
      if (!seen.has(k)) { seen.add(k); merged.push(s); }
    }
    return merged;
  }, [stateAlternatives, matchedSources]);

  const [reloadNonce, setReloadNonce] = useState(0);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: [
      "manga-read", mangaId, chapterKey, provider, providerChapterId,
      stateAlternatives.map((a) => `${a.provider}:${a.chapterKey}`).join("|"), reloadNonce,
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
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  // If a read came back with no pages (e.g. the URL's source 404'd) and the
  // chapter list has since supplied sources that router state didn't, retry once
  // so the read call can fall back to the same chapter from another scanlator.
  const retriedForRef = useRef<string>("");
  useEffect(() => {
    if (isFetching || !data) return;
    if ((data.data?.pages?.length ?? 0) > 0) return;
    if (stateAlternatives.length > 0) return; // state already offered fallbacks
    if (matchedSources.length === 0) return;
    if (retriedForRef.current === chapterKey) return; // one retry per chapter
    retriedForRef.current = chapterKey;
    setReloadNonce((n) => n + 1);
  }, [isFetching, data, matchedSources, stateAlternatives, chapterKey]);

  const pages = data?.data?.pages ?? [];
  const total = pages.length;
  const resolvedProvider = data?.data?.chapter?.provider || provider;

  const { data: detailResp } = useMangaDetail(mangaId);
  const detail = detailResp?.detail;
  const mangaTitle =
    detail?.title?.english || detail?.title?.romaji || detail?.canonicalTitle || "Manga";
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
    before, after, appendNext, prependPrev, loadingNext, loadingPrev, hasNext, hasPrev,
  } = useContinuousReader({
    enabled: continuous,
    mangaId: mangaId || "",
    chapters,
    entryIndex: currentIndex,
    preferProvider: resolvedProvider,
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

  const prevChapter = navIndex > 0 ? chapters[navIndex - 1] : null;
  const nextChapter =
    navIndex >= 0 && navIndex < chapters.length - 1 ? chapters[navIndex + 1] : null;

  const navToChapter = useCallback((chapter: MappedMangaChapter | null) => {
    if (!chapter || !mangaId) return;
    const src = chapter.sources || [];
    const source = src.find((s) => s.provider === resolvedProvider) || src[0];
    if (!source) return;
    const params = new URLSearchParams();
    params.set("chapterKey", source.chapterKey);
    if (source.provider) params.set("provider", source.provider);
    if (source.providerChapterId) params.set("providerChapterId", source.providerChapterId);
    if (chapter.chapterNumber != null) params.set("chapterNumber", String(chapter.chapterNumber));
    if (chapter.chapterTitle) params.set("chapterTitle", chapter.chapterTitle);
    params.set("page", "0");
    // Carry the offline flag across chapter jumps so ProtectedRoute keeps the
    // reader reachable for the whole downloaded run (ban / maintenance / down).
    if (searchParams.get("offline") === "true") params.set("offline", "true");
    navigate(`/manga/read/${mangaId}?${params.toString()}`, { state: { sources: chapter.sources } });
  }, [mangaId, navigate, resolvedProvider, searchParams]);

  const switchProvider = useCallback((source: MangaChapterSource) => {
    if (!mangaId) return;
    const params = new URLSearchParams(searchParams);
    params.set("chapterKey", source.chapterKey);
    params.set("provider", source.provider);
    if (source.providerChapterId) params.set("providerChapterId", source.providerChapterId);
    params.set("page", "0");
    navigate(`/manga/read/${mangaId}?${params.toString()}`, { state: { sources: matchedSources } });
    void triggerHaptic('select');
  }, [mangaId, matchedSources, navigate, searchParams]);

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
  // The reader is a full-window takeover, but MainLayout pushes it down 32px for
  // the desktop titlebar (pt-8). The inner scroll area used to be hard-coded to
  // calc(100vh - 49px) — 32px too tall — so the page overflowed and the *window*
  // scrolled too: two scrollbars fighting the wheel. We lock the document scroll
  // and size the scroll area to what's actually left below the nav (measured, so
  // it tracks the titlebar offset and fullscreen automatically).
  const [scrollH, setScrollH] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerHeight : 0,
  );

  useEffect(() => {
    setPageIndex(Number.isFinite(pageParam) ? Math.max(0, pageParam) : 0);
    scrollRef.current?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterKey, provider]);

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
      if (vis.length) setPageIndex(Math.max(0, vis[0] - 1));
    }, { root, threshold: 0.4 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [continuous, settings.readingMode, total, chapterKey]);

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
      if (!vis.length) return;
      setActiveIndex(vis[0].ch);
      setPageIndex(Math.max(0, vis[0].pg - 1));
    }, { root, threshold: 0.2 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [continuous, total, chapterKey, before.length, after.length]);

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
  }, [continuous, hasNext, appendNext, before.length, after.length]);

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
  }, [continuous, hasPrev, prependPrev, before.length, after.length]);

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
  const savedRef = useRef<string>("");

  useEffect(() => {
    if (!user || !mangaId || total === 0) return;
    const key = `${chapterKey}|${provider}`;
    if (savedRef.current === key) return;
    savedRef.current = key;
    saveProgress.mutate({
      mangaId, mangaTitle, mangaPoster, format: mangaFormat,
      lastChapterKey: chapterKey, lastChapterNumber: resolvedNumber, lastChapterTitle: title,
      lastProvider: resolvedProvider || null, lastLanguage: data?.data?.chapter?.language ?? null,
      lastPageIndex: 0, totalPages: total,
      lastExtensionId: entryExtensionId, lastScanlator: entryScanlator, lastPageId: "1",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mangaId, total, chapterKey, provider]);

  // Debounced page/chapter tracker. In continuous mode this targets the ACTIVE
  // chapter (whichever segment is on screen) so resume returns to the exact page
  // of the exact group/extension being read, not the entry chapter.
  useEffect(() => {
    if (!user || !mangaId || total === 0) return;
    if (savedRef.current !== `${chapterKey}|${provider}`) return;
    const t = setTimeout(() => {
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
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIndex, navIndex]);

  // Store the manga's total chapter count in the mirror ("Tiger DB"), once per
  // manga per mount. Extension chapter lists are scraped client-side, so this is
  // the only path by which the backend learns the real total. Upward-only on the
  // server, so it's safe to fire whenever a chapter list is available.
  const totalChaptersRef = useRef<string>("");
  useEffect(() => {
    if (!mangaId || !chapters.length) return;
    if (totalChaptersRef.current === mangaId) return;
    const maxNum = chapters.reduce(
      (m, c) => (c.chapterNumber != null && c.chapterNumber > m ? c.chapterNumber : m),
      0,
    );
    const totalCh = Math.floor(maxNum > 0 ? maxNum : chapters.length);
    if (totalCh <= 0) return;
    totalChaptersRef.current = mangaId;
    void storeMangaTotalChapters(mangaId, totalCh);
  }, [mangaId, chapters]);

  // ── Fullscreen: OS-level in Electron (hides titlebar + sidebar + tray via the
  // `app-fullscreen` class, mirroring EmbedPlayer), DOM Fullscreen on the web. ──
  const [isFs, setIsFs] = useState(false);

  const electronBridge = () =>
    (window as unknown as { electron?: {
      setFullscreen?: (v: boolean) => Promise<unknown>;
      onFullscreenChanged?: (cb: (v: boolean) => void) => (() => void) | void;
    } }).electron;

  const enterFullscreen = useCallback(() => {
    const bridge = electronBridge();
    setIsFs(true);
    if (bridge?.setFullscreen) {
      document.documentElement.classList.add("app-fullscreen");
      void bridge.setFullscreen(true).catch(() => {});
    } else {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    const bridge = electronBridge();
    setIsFs(false);
    if (bridge?.setFullscreen) {
      document.documentElement.classList.remove("app-fullscreen");
      void bridge.setFullscreen(false).catch(() => {});
    } else if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFs) exitFullscreen();
    else enterFullscreen();
  }, [isFs, enterFullscreen, exitFullscreen]);

  // Sync state when leaving fullscreen via Esc, F11 or native window chrome, and
  // always drop the CSS class on unmount so the app never gets stranded fullscreen.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && !electronBridge()?.setFullscreen) setIsFs(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("keydown", onKey);
    const unsub = electronBridge()?.onFullscreenChanged?.((full: boolean) => {
      if (!full) {
        document.documentElement.classList.remove("app-fullscreen");
        setIsFs(false);
      }
    });
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("keydown", onKey);
      if (typeof unsub === "function") unsub();
      document.documentElement.classList.remove("app-fullscreen");
    };
  }, [exitFullscreen]);

  const autoFsRef = useRef(false);
  useEffect(() => {
    if (settings.autoFullscreen && !autoFsRef.current && total > 0) {
      autoFsRef.current = true;
      enterFullscreen();
    }
  }, [settings.autoFullscreen, total, enterFullscreen]);

  // Auto-hide reader chrome (top nav / toolbar / progress) in fullscreen; reveal
  // on mouse move for a short window. Off when not fullscreen or the pref is off.
  const [chromeVisible, setChromeVisible] = useState(true);
  useEffect(() => {
    if (!isFs || !settings.hideChromeInFullscreen) {
      setChromeVisible(true);
      return;
    }
    setChromeVisible(false);
    let timer: number | undefined;
    const onMove = () => {
      setChromeVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setChromeVisible(false), 2500);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.clearTimeout(timer);
    };
  }, [isFs, settings.hideChromeInFullscreen]);

  // ── Keep the screen awake while reading (Wake Lock), re-acquiring on tab focus. ──
  useEffect(() => {
    if (!settings.keepScreenAwake) return;
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
  }, [settings.keepScreenAwake]);

  // Lock the window scroll while the reader is mounted — the reader owns its own
  // scroll container, so the document must never scroll (that's the 2nd scrollbar).
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
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
  const filteredChapters = useMemo(() => {
    const query = chapterSearch.trim().toLowerCase();
    if (!query) return chapters;
    return chapters.filter((chapter) =>
      String(chapter.chapterNumber ?? "").includes(query) ||
      String(chapter.chapterTitle ?? "").toLowerCase().includes(query) ||
      chapter.sources?.some((source) =>
        String(source.provider ?? "").toLowerCase().includes(query) ||
        String(source.scanlator ?? "").toLowerCase().includes(query),
      ),
    );
  }, [chapterSearch, chapters]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const updateRef = useRef(updateSetting);
  updateRef.current = updateSetting;
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const lastReaderTapRef = useRef<{ at: number; x: number; y: number } | null>(null);

  const handleReaderPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointersRef.current.size === 2) {
      const [a, b] = [...activePointersRef.current.values()];
      pinchRef.current = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        zoom: settingsRef.current.zoom,
      };
      lastReaderTapRef.current = null;
    }
  }, []);

  const handleReaderPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || !activePointersRef.current.has(event.pointerId)) return;
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointersRef.current.size !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const [a, b] = [...activePointersRef.current.values()];
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const next = Math.min(300, Math.max(50, Math.round((pinchRef.current.zoom * distance / pinchRef.current.distance) / 5) * 5));
    if (next !== settingsRef.current.zoom) updateRef.current('zoom', next);
  }, []);

  const handleReaderPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    const wasPinching = pinchRef.current !== null;
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;
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
      updateRef.current('zoom', settingsRef.current.zoom > 115 ? 100 : 175);
      void triggerHaptic('light');
      lastReaderTapRef.current = null;
    }
  }, []);

  const handleReaderPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;
  }, []);

  const goNextPage = useCallback(() => {
    if (settings.readingMode === "paged") {
      const step = settings.doublePage ? 2 : 1;
      setPageIndex((i) => Math.min(total - 1, i + step));
    } else scrollRef.current?.scrollBy({ top: (scrollRef.current?.clientHeight ?? 0) * 0.9, behavior: "smooth" });
  }, [settings.readingMode, settings.doublePage, total]);

  const goPrevPage = useCallback(() => {
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

  // Ctrl + wheel and trackpad pinch (which the browser reports as ctrl-wheel) zoom
  // the pages. Needs a non-passive native listener to cancel the browser's own
  // page-zoom. Gated by the `zoomWithWheel` setting; keyboard zoom stays separate.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !settingsRef.current.zoomWithWheel) return;
      e.preventDefault();
      const step = Math.abs(e.deltaY) > 40 ? 8 : 3;
      const dir = e.deltaY < 0 ? 1 : -1;
      const cur = settingsRef.current.zoom;
      const next = Math.min(300, Math.max(50, cur + dir * step));
      if (next !== cur) updateRef.current("zoom", next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Auto-scroll (vertical mode): advance the scroll position continuously.
  useEffect(() => {
    if (!settings.autoScroll || settings.readingMode !== "vertical" || total === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = window.setInterval(() => {
      el.scrollBy({ top: settings.autoScrollSpeed, behavior: "auto" });
    }, 16);
    return () => window.clearInterval(id);
  }, [settings.autoScroll, settings.autoScrollSpeed, settings.readingMode, total]);
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
    nextChapter: () => navToChapter(nextChapter), prevChapter: () => navToChapter(prevChapter),
    toggleFullscreen, toggleDirection, zoomIn, zoomOut, toggleComments, reload,
  }, !showSettings && !showCommentsDrawer);

  const isCoarsePointer = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches,
    [],
  );

  const zoomFactor = settings.zoom / 100;
  const maxWidthCap = settings.maxWidthPx > 0 ? `${settings.maxWidthPx}px` : undefined;

  // Mobile default is edge-to-edge pages: when the user never changed the
  // desktop-oriented 70% default, touch devices render full width instead. An
  // explicit width choice is always honored.
  const effectiveWidthPercent =
    (isCoarsePointer || isNative) &&
    settings.widthPercent === DEFAULT_READER_SETTINGS.widthPercent
      ? 100
      : settings.widthPercent;

  // Vertical (webtoon) sizing: width-based, scaled by zoom, capped by maxWidthPx.
  const widthStyle: CSSProperties =
    settings.sizing === "natural"
      ? {
          width: zoomFactor === 1 ? "auto" : `${Math.round(100 * zoomFactor)}%`,
          maxWidth: maxWidthCap ?? (zoomFactor > 1 ? "none" : "100%"),
        }
      : {
          width: `${effectiveWidthPercent * zoomFactor}%`,
          maxWidth: maxWidthCap ?? (zoomFactor > 1 ? "none" : "100%"),
        };

  // Paged sizing honors the page-fit mode (fit width / height / both / original).
  const pagedStyle: CSSProperties = (() => {
    switch (settings.pageFit) {
      case "height":
        return { height: `${88 * zoomFactor}vh`, width: "auto", maxWidth: maxWidthCap ?? "none" };
      case "both":
        return {
          maxHeight: `${90 * zoomFactor}vh`,
          maxWidth: maxWidthCap ?? `${effectiveWidthPercent * zoomFactor}%`,
          width: "auto",
          height: "auto",
        };
      case "original":
        return {
          width: zoomFactor === 1 ? "auto" : `${Math.round(100 * zoomFactor)}%`,
          maxWidth: maxWidthCap ?? "none",
        };
      case "width":
      default:
        return {
          width: `${effectiveWidthPercent * zoomFactor}%`,
          maxWidth: maxWidthCap ?? (zoomFactor > 1 ? "none" : "100%"),
        };
    }
  })();

  const eagerFor = (idx: number) => {
    // 'partial' is the reader's own default; when the user hasn't changed it,
    // let the active memory profile pick the preload window (none on Low,
    // full on Unlimited). An explicit 'none'/'full' choice is always honored.
    const effectivePreloading =
      settings.preloading === "partial" ? getProfileKnobs().readerPreload : settings.preloading;
    if (settings.loadingStrategy === "eager" || effectivePreloading === "full") return true;
    // Mobile radio: keep a wider eager window so pages ahead are already
    // decoded when the user scrolls into them (lazy + slow fetch = black gaps).
    const win = effectivePreloading === "none" ? 1 : isCoarsePointer || isNative ? 6 : 3;
    return Math.abs(idx - pageIndex) <= win;
  };

  // Streamed (non-entry) chapters can't use the entry's page-index window; eager-load
  // their first couple of pages so the boundary is seamless, lazy-load the rest.
  const segEager = (idx: number) => {
    const effectivePreloading =
      settings.preloading === "partial" ? getProfileKnobs().readerPreload : settings.preloading;
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

  if (!isNative) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Background />
        <GlassPanel className="w-full max-w-2xl p-8 border border-white/10">
          <div className="flex items-start gap-3">
            <Puzzle className="w-6 h-6 text-primary mt-1" />
            <div>
              <h2 className="text-2xl font-black">Read in the Tatakai app</h2>
              <p className="mt-2 text-muted-foreground">
                Manga chapter pages are delivered by desktop extensions. Download Tatakai to continue reading.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="https://github.com/snozxyx/tatakai/releases"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold"
              target="_blank" rel="noreferrer"
            >
              Download desktop app
            </a>
            <button
              onClick={() => navigate(mangaId ? `/manga/${mangaId}` : "/manga")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 font-bold"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative min-h-screen text-foreground" style={{ backgroundColor: settings.backgroundColor }}>
      {/* Top nav — comick layout: Prev · Manga Info · Next (compact on mobile) */}
      <div
        className={`z-40 flex items-center gap-1.5 sm:gap-2 border-b border-white/10 bg-black/50 px-2 sm:px-3 py-2 backdrop-blur transition-transform duration-300 pt-[max(0.5rem,env(safe-area-inset-top))] ${
          isFs ? "fixed inset-x-0 top-0" : "sticky top-0"
        } ${chromeVisible ? "" : "-translate-y-full"}`}
      >
        <button
          onClick={() => navigate(mangaId ? `/manga/${mangaId}` : "/manga")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm font-semibold hover:bg-white/10 active:scale-95"
          aria-label="Back to manga"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          disabled={!prevChapter}
          onClick={() => navToChapter(prevChapter)}
          className="inline-flex shrink-0 items-center gap-0.5 sm:gap-1 rounded-lg border border-white/15 px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm font-semibold hover:bg-white/10 active:scale-95 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /><span className="hidden min-[380px]:inline">Prev</span>
        </button>
        <button
          onClick={() => navigate(`/manga/${mangaId}`)}
          className="flex min-w-0 flex-1 flex-col items-center px-1 sm:px-2 text-center"
          title="Manga info"
        >
          <span className="w-full truncate text-xs sm:text-sm font-bold">{mangaTitle}</span>
          <span className="w-full truncate text-[11px] sm:text-xs text-muted-foreground">
            {displayTitle}{displayProvider ? ` · ${displayProvider}` : ""}
          </span>
        </button>
        <button
          onClick={() => { setShowReaderNavigator(true); void triggerHaptic('open'); }}
          className="inline-flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 hover:bg-white/10 active:scale-95"
          aria-label="Open chapter and provider navigator"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          disabled={!nextChapter}
          onClick={() => navToChapter(nextChapter)}
          className="inline-flex shrink-0 items-center gap-0.5 sm:gap-1 rounded-lg border border-white/15 px-2 sm:px-2.5 py-1.5 text-xs sm:text-sm font-semibold hover:bg-white/10 active:scale-95 disabled:opacity-40"
        >
          <span className="hidden min-[380px]:inline">Next</span> <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Right vertical toolbar — slimmer + lower on mobile so it never covers pages */}
      <div
        className={`fixed right-2 sm:right-3 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1.5 sm:gap-2 transition-opacity duration-300 ${
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <ToolBtn label="Settings" onClick={() => setShowSettings(true)}><Settings2 className="h-5 w-5" /></ToolBtn>
        <ToolBtn label="Fullscreen" onClick={toggleFullscreen} active={isFs}>
          {isFs ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </ToolBtn>
        <ToolBtn label="Manga info" onClick={() => navigate(`/manga/${mangaId}`)}><Info className="h-5 w-5" /></ToolBtn>
        <ToolBtn label="Home" onClick={() => navigate("/")}><Home className="h-5 w-5" /></ToolBtn>
        {settings.showCaptureButton && <ToolBtn label="Capture page" onClick={capture}><Camera className="h-5 w-5" /></ToolBtn>}
        {settings.showComments && <ToolBtn label="Comments" onClick={toggleComments} active={showCommentsDrawer}><MessageSquare className="h-5 w-5" /></ToolBtn>}
        {settings.showReloadButton && <ToolBtn label="Reload" onClick={reload}><RefreshCw className={`h-5 w-5 ${isFetching ? "animate-spin" : ""}`} /></ToolBtn>}
      </div>

      <div
        ref={scrollRef}
        onScroll={() => { interactedRef.current = true; }}
        onDoubleClick={() => { updateRef.current('zoom', settingsRef.current.zoom > 115 ? 100 : 175); void triggerHaptic('light'); }}
        onPointerDown={handleReaderPointerDown}
        onPointerMove={handleReaderPointerMove}
        onPointerUp={handleReaderPointerUp}
        onPointerCancel={handleReaderPointerCancel}
        className={`mx-auto overflow-y-auto overscroll-contain px-0 py-0 sm:px-4 sm:py-6 ${settings.zoom > 100 ? 'overflow-x-auto' : 'overflow-x-hidden'}`}
        style={{
          height: `${scrollH}px`,
          filter: settings.brightness < 100 ? `brightness(${settings.brightness / 100})` : undefined,
          touchAction: 'pan-x pan-y',
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading pages…
          </div>
        ) : null}

        {!isLoading && (!data?.success || total === 0) ? (
          <GlassPanel className="mx-auto max-w-xl border border-white/10 p-6">
            <h2 className="text-xl font-bold">Unable to load chapter</h2>
            <p className="mt-2 text-muted-foreground">
              {data?.guidance?.message || data?.message ||
                (error instanceof Error ? error.message : "No pages available")}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Pick an extension provider from the chapter list on the manga page.
            </p>
          </GlassPanel>
        ) : null}

        {total > 0 && settings.readingMode === "vertical" ? (
          <>
            {continuous && hasPrev ? (
              <>
                <div ref={topSentinelRef} className="h-px w-full" />
                {loadingPrev ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading previous chapter…
                  </div>
                ) : null}
              </>
            ) : null}

            {continuous
              ? before.map((seg) => (
                  <div key={seg.key} data-ch={seg.index}>
                    <ChapterDivider label={seg.number != null ? `Chapter ${seg.number}` : "Chapter"} sub={seg.provider} />
                    <div className="flex flex-col items-center" style={{ gap: `${settings.gap}px` }}>
                      {seg.pages.map((page, idx) => (
                        <ReaderImage key={`${seg.index}:${page.pageNumber}`} page={page} mode={settings.loadingMethod} style={widthStyle} eager={segEager(idx)} />
                      ))}
                    </div>
                  </div>
                ))
              : null}

            <div data-ch={currentIndex}>
              {continuous && before.length ? (
                <ChapterDivider label={resolvedNumber != null ? `Chapter ${resolvedNumber}` : "Chapter"} sub={resolvedProvider} />
              ) : null}
              <div className="flex flex-col items-center" style={{ gap: `${settings.gap}px` }}>
                {pages.map((page, idx) => (
                  <ReaderImage key={page.pageNumber} page={page} mode={settings.loadingMethod} style={widthStyle} eager={eagerFor(idx)} />
                ))}
              </div>
            </div>
            {continuous
              ? after.map((seg) => (
                  <div key={seg.key} data-ch={seg.index}>
                    <ChapterDivider label={seg.number != null ? `Chapter ${seg.number}` : "Chapter"} sub={seg.provider} />
                    <div className="flex flex-col items-center" style={{ gap: `${settings.gap}px` }}>
                      {seg.pages.map((page, idx) => (
                        <ReaderImage key={`${seg.index}:${page.pageNumber}`} page={page} mode={settings.loadingMethod} style={widthStyle} eager={segEager(idx)} />
                      ))}
                    </div>
                  </div>
                ))
              : null}

            {continuous && hasNext ? (
              <>
                {loadingNext ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading next chapter…
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
                <ReaderImage page={pages[pageIndex]} mode={settings.loadingMethod} style={pagedStyle} eager />
                <ReaderImage page={pages[pageIndex + 1]} mode={settings.loadingMethod} style={pagedStyle} eager />
              </div>
            ) : pages[pageIndex] ? (
              <ReaderImage page={pages[pageIndex]} mode={settings.loadingMethod} style={pagedStyle} eager />
            ) : null}
            {settings.clickToTurn ? (
              <>
                <button
                  aria-label={settings.readingDirection === "rtl" ? "Next page" : "Previous page"}
                  onClick={settings.readingDirection === "rtl" ? goNextPage : goPrevPage}
                  className="absolute left-0 top-0 h-full w-1/3 cursor-pointer"
                />
                <button
                  aria-label={settings.readingDirection === "rtl" ? "Previous page" : "Next page"}
                  onClick={settings.readingDirection === "rtl" ? goPrevPage : goNextPage}
                  className="absolute right-0 top-0 h-full w-1/3 cursor-pointer"
                />
              </>
            ) : null}
          </div>
        ) : null}

        {/* End-of-chapter comments — rendered for BOTH vertical and paged modes so
            downloaded/offline reading surfaces the same threads as online reading.
            In continuous vertical mode it only appears once the final chapter loads. */}
        {total > 0 && settings.showComments && mangaId && (!continuous || !hasNext) ? (
          <div className="mx-auto mt-10 w-full max-w-3xl">
            <button
              onClick={() => setShowInlineComments((v) => !v)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10"
            >
              <MessageSquare className="h-4 w-4" />
              {showInlineComments ? "Hide comments" : "Show comments"}
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
                ) : null}
                <Comments entityType="manga" entityId={mangaId} entityName={mangaTitle} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <Sheet open={showReaderNavigator} onOpenChange={setShowReaderNavigator}>
        <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-3xl border-white/10 bg-background/95 px-0 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:mx-auto sm:max-w-xl">
          <SheetHeader className="px-5 text-left"><SheetTitle>Reader navigation</SheetTitle></SheetHeader>
          <div className="mt-5 space-y-5 overflow-y-auto px-5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={chapterSearch}
                onChange={(event) => setChapterSearch(event.target.value)}
                placeholder="Search chapter, title, or provider"
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-10 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Provider</h3>
              <div className="space-y-2">
                {matchedSources.map((source) => {
                  const active = source.provider === resolvedProvider && source.chapterKey === chapterKey;
                  return <button key={`${source.provider}:${source.chapterKey}`} onClick={() => { switchProvider(source); setShowReaderNavigator(false); }} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${active ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                    <span className="font-medium">{source.provider}</span><span className="text-xs text-muted-foreground">{source.scanlator || 'Chapter source'}</span>
                  </button>;
                })}
                {!matchedSources.length && <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">No alternative providers are available for this chapter.</p>}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Chapter</h3>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {filteredChapters.map((chapter) => <button key={chapter.canonicalOrder} onClick={() => { navToChapter(chapter); setShowReaderNavigator(false); void triggerHaptic('select'); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${chapter.canonicalOrder === currentIndex ? 'bg-primary/10 text-primary' : 'hover:bg-white/[0.06]'}`}>
                  <span>Chapter {chapter.chapterNumber ?? chapter.canonicalOrder + 1}</span><span className="max-w-[55%] truncate text-xs text-muted-foreground">{chapter.chapterTitle || ''}</span>
                </button>)}
                {!filteredChapters.length && <p className="py-8 text-center text-sm text-muted-foreground">No chapters match “{chapterSearch}”.</p>}
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* Settings — reuse the Settings-page ReaderPanel (one source of truth).
          Right-side sheet on desktop, thumb-friendly bottom sheet on mobile. */}
      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent
          side="right"
          className="flex flex-col gap-0 overflow-hidden border-white/10 bg-background/95 p-0 backdrop-blur-xl md:w-[400px] md:max-w-[400px] max-md:inset-x-2 max-md:bottom-2 max-md:top-auto max-md:h-auto max-md:max-h-[85dvh] max-md:w-auto max-md:rounded-3xl max-md:border max-md:shadow-2xl"
        >
          <div className="shrink-0 pt-2.5 md:hidden" aria-hidden>
            <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
            <SheetHeader>
              <SheetTitle>Reader settings</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <ReaderPanel />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Comments — global (per-manga) + per-chapter (canonical number scope). */}
      <Sheet open={showCommentsDrawer} onOpenChange={setShowCommentsDrawer}>
        <SheetContent side="right" className="flex w-full flex-col overflow-hidden p-0 sm:max-w-lg">
          <Tabs defaultValue="chapter" className="flex h-full flex-col">
            <div className="border-b border-white/10 px-4 pt-4">
              <SheetHeader className="mb-3">
                <SheetTitle>Comments</SheetTitle>
              </SheetHeader>
              <TabsList className="w-full">
                <TabsTrigger value="chapter" className="flex-1">This chapter</TabsTrigger>
                <TabsTrigger value="global" className="flex-1">Global</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="chapter" className="flex-1 overflow-y-auto px-4 py-3">
              {mangaId && resolvedNumber != null ? (
                <Comments
                  entityType="manga"
                  entityId={mangaId}
                  episodeId={String(resolvedNumber)}
                  entityName={`${mangaTitle} · ${title}`}
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Chapter comments are unavailable for this chapter.
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
