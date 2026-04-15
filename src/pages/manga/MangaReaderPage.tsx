import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMangaChapters, useMangaDetail, useMangaRead } from "@/hooks/useMangaData";
import { useMangaReadlistItem, useSaveMangaReadingProgress } from "@/hooks/useMangaReadlist";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Loader2,
  Maximize,
  Minimize,
  Settings,
} from "lucide-react";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { Background } from "@/components/layout/Background";
import { getProxiedImageUrl } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useContentSafetySettings } from "@/hooks/useContentSafetySettings";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ReadingMode = "long-strip" | "paged";
type FitMode = "width" | "height";

type ReaderSettings = {
  readingMode: ReadingMode;
  fitMode: FitMode;
  zoom: number;
  gapSize: number;
  preferredProvider: string;
  preferredLanguage: string;
  showHud: boolean;
  showPageNumber: boolean;
  autoScrollTopOnChapterChange: boolean;
  autoLoadNextChapterOnScrollEnd: boolean;
  keepScreenAwake: boolean;
};

const READER_SETTINGS_KEY = "tatakai:manga-reader-settings:v1";
const DEFAULT_READER_SETTINGS: ReaderSettings = {
  readingMode: "long-strip",
  fitMode: "width",
  zoom: 1,
  gapSize: 0,
  preferredProvider: "auto",
  preferredLanguage: "auto",
  showHud: true,
  showPageNumber: true,
  autoScrollTopOnChapterChange: true,
  autoLoadNextChapterOnScrollEnd: true,
  keepScreenAwake: false,
};

function clampZoom(value: number): number {
  return Math.min(1.8, Math.max(0.6, Number.isFinite(value) ? value : 1));
}

function clampGap(value: number): number {
  return Math.min(0, Math.max(0, Number.isFinite(value) ? value : 0));
}

function normalizeLanguageKey(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "jp" || normalized.startsWith("ja") || normalized.includes("japanese")) return "jp";
  if (normalized === "kr" || normalized.startsWith("ko") || normalized.includes("korean")) return "kr";
  if (normalized === "zh" || normalized.startsWith("zh") || normalized.includes("chinese")) return "zh";
  if (normalized === "en" || normalized.startsWith("en") || normalized.includes("english")) return "en";
  return normalized;
}

function formatLanguageLabel(value: string | null | undefined): string {
  const key = normalizeLanguageKey(value);
  if (key === "jp") return "Japanese";
  if (key === "kr") return "Korean";
  if (key === "zh") return "Chinese";
  if (key === "en") return "English";
  if (key === "unknown") return "Unknown";
  return key.toUpperCase();
}

function normalizePreferredMangaLanguage(value: string | null | undefined): string {
  const normalized = normalizeLanguageKey(value);
  if (normalized === "jp" || normalized === "kr" || normalized === "zh" || normalized === "en") {
    return normalized;
  }
  return "auto";
}

function loadReaderSettings(): ReaderSettings {
  if (typeof window === "undefined") return DEFAULT_READER_SETTINGS;

  try {
    const raw = window.localStorage.getItem(READER_SETTINGS_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    return {
      ...DEFAULT_READER_SETTINGS,
      ...parsed,
      zoom: clampZoom(typeof parsed.zoom === "number" ? parsed.zoom : DEFAULT_READER_SETTINGS.zoom),
      gapSize: clampGap(typeof parsed.gapSize === "number" ? parsed.gapSize : DEFAULT_READER_SETTINGS.gapSize),
      preferredProvider:
        typeof parsed.preferredProvider === "string" && parsed.preferredProvider.trim().length > 0
          ? parsed.preferredProvider
          : DEFAULT_READER_SETTINGS.preferredProvider,
      preferredLanguage:
        typeof parsed.preferredLanguage === "string" && parsed.preferredLanguage.trim().length > 0
          ? parsed.preferredLanguage
          : DEFAULT_READER_SETTINGS.preferredLanguage,
    };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export default function MangaReaderPage() {
  const { mangaId } = useParams<{ mangaId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const chapterKey = searchParams.get("chapterKey") || "";
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const { profile } = useAuth();
  const { settings: contentSafetySettings, updateSettings: updateContentSafetySettings } =
    useContentSafetySettings();

  const [allowAdultForSession, setAllowAdultForSession] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [longStripScrollPct, setLongStripScrollPct] = useState(0);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => loadReaderSettings());

  const readerRootRef = useRef<HTMLDivElement | null>(null);
  const longStripPageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const saveTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const initializedChapterRef = useRef<string>("");
  const autoAdvanceChapterRef = useRef<string>("");
  const autoReverseChapterRef = useRef<string>("");
  const lastScrollYRef = useRef<number>(0);

  const { data: readData, isLoading, error } = useMangaRead(mangaId, chapterKey);
  const { data: chapterData } = useMangaChapters(mangaId);
  const { data: persistedReadState } = useMangaReadlistItem(mangaId);
  const saveReadingProgress = useSaveMangaReadingProgress();
  const detailLookupId = mangaId;
  const { data: mangaDetailData, isLoading: loadingMangaMeta } = useMangaDetail(detailLookupId);

  const chapters = useMemo(() => chapterData?.mappedChapters || [], [chapterData?.mappedChapters]);
  const orderedChapters = useMemo(
    () => [...chapters].sort((a, b) => (a.canonicalOrder ?? 0) - (b.canonicalOrder ?? 0)),
    [chapters],
  );

  const providerOptions = useMemo(() => {
    const providers = new Set<string>();
    orderedChapters.forEach((chapter) => {
      chapter.sources?.forEach((source) => {
        if (source.provider) {
          providers.add(source.provider);
        }
      });
    });
    return Array.from(providers).sort((a, b) => a.localeCompare(b));
  }, [orderedChapters]);

  const languageOptions = useMemo(() => {
    const labels = new Map<string, string>();
    orderedChapters.forEach((chapter) => {
      chapter.sources?.forEach((source) => {
        const key = normalizeLanguageKey(source.language);
        if (key && key !== "unknown") {
          labels.set(key, formatLanguageLabel(source.language));
        }
      });
    });

    return Array.from(labels.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [orderedChapters]);

  const currentChapter = useMemo(() => {
    const bySource = orderedChapters.find((chapter) =>
      chapter.sources?.some((source) => source.chapterKey === chapterKey),
    );
    if (bySource) return bySource;

    const currentReadChapterNumber = readData?.data?.chapter?.number;
    if (typeof currentReadChapterNumber === "number") {
      return orderedChapters.find((chapter) => chapter.chapterNumber === currentReadChapterNumber) || null;
    }
    return null;
  }, [chapterKey, orderedChapters, readData?.data?.chapter?.number]);

  const currentChapterIndex = useMemo(() => {
    if (!currentChapter) return -1;
    return orderedChapters.findIndex(
      (chapter) => chapter.canonicalOrder === currentChapter.canonicalOrder,
    );
  }, [currentChapter, orderedChapters]);

  const availableSources = currentChapter?.sources || [];
  const activeSource = availableSources.find((source) => source.chapterKey === chapterKey) || null;
  const profilePreferredMangaLanguage = useMemo(
    () => normalizePreferredMangaLanguage(profile?.preferred_manga_language),
    [profile?.preferred_manga_language],
  );

  const getPreferredSource = useCallback((
    sources: Array<{ provider: string; language: string | null; chapterKey: string }>,
    fallbackProvider?: string,
    providerPreference: string = readerSettings.preferredProvider,
    languagePreference: string = readerSettings.preferredLanguage,
  ) => {
    if (!sources.length) return null;

    const resolvedLanguagePreference =
      languagePreference === "auto" ? profilePreferredMangaLanguage : languagePreference;

    const scoreSource = (source: { provider: string; language: string | null; chapterKey: string }) => {
      let score = 0;
      const sourceLanguage = normalizeLanguageKey(source.language);

      if (providerPreference !== "auto" && source.provider === providerPreference) score += 120;
      if (resolvedLanguagePreference !== "auto" && sourceLanguage === resolvedLanguagePreference) score += 90;
      if (fallbackProvider && source.provider === fallbackProvider) score += 30;
      if (sourceLanguage !== "unknown") score += 5;

      return score;
    };

    const sorted = [...sources].sort((left, right) => {
      const scoreDiff = scoreSource(right) - scoreSource(left);
      if (scoreDiff !== 0) return scoreDiff;

      const providerDiff = String(left.provider || "").localeCompare(String(right.provider || ""));
      if (providerDiff !== 0) return providerDiff;

      return formatLanguageLabel(left.language).localeCompare(formatLanguageLabel(right.language));
    });

    return sorted[0] || null;
  }, [profilePreferredMangaLanguage, readerSettings.preferredLanguage, readerSettings.preferredProvider]);

  const pages = readData?.data?.pages || [];
  const chapterNumber = readData?.data?.chapter?.number ?? currentChapter?.chapterNumber ?? null;
  const autoLanguageLabel =
    profilePreferredMangaLanguage === "auto"
      ? "all languages"
      : `Display setting: ${formatLanguageLabel(profilePreferredMangaLanguage)}`;

  const chapterLabel =
    currentChapter?.chapterTitle || (chapterNumber != null ? `Chapter ${chapterNumber}` : chapterKey);
  const fallbackCurrentChapter =
    typeof chapterNumber === "number" && Number.isFinite(chapterNumber) && chapterNumber > 0
      ? Math.trunc(chapterNumber)
      : 1;
  const fallbackTotalChapters =
    typeof mangaDetailData?.detail?.totalChapters === "number" &&
    Number.isFinite(mangaDetailData.detail.totalChapters) &&
    mangaDetailData.detail.totalChapters > 0
      ? Math.trunc(mangaDetailData.detail.totalChapters)
      : 0;
  const currentChapterOrdinal = currentChapterIndex >= 0 ? currentChapterIndex + 1 : fallbackCurrentChapter;
  const totalChapterCount = Math.max(currentChapterOrdinal, orderedChapters.length || fallbackTotalChapters || 1);
  const pageProgressPct = pages.length > 0 ? ((currentPageIndex + 1) / pages.length) * 100 : 0;
  const readerProgressPct =
    readerSettings.readingMode === "long-strip"
      ? Math.min(100, Math.max(0, longStripScrollPct || pageProgressPct))
      : pageProgressPct;

  const requestedPageFromQuery = useMemo(() => {
    const rawPage = Number(searchParams.get("page"));
    if (!Number.isFinite(rawPage)) return null;
    return Math.max(0, Math.trunc(rawPage));
  }, [searchParams]);

  const persistedPageForCurrentChapter = useMemo(() => {
    if (!persistedReadState?.last_chapter_key || persistedReadState.last_chapter_key !== chapterKey) {
      return null;
    }
    const persistedPage = Number(persistedReadState.last_page_index);
    if (!Number.isFinite(persistedPage)) return null;
    return Math.max(0, Math.trunc(persistedPage));
  }, [persistedReadState?.last_chapter_key, persistedReadState?.last_page_index, chapterKey]);

  const initialPageForChapter = useMemo(() => {
    if (requestedPageFromQuery != null) return requestedPageFromQuery;
    if (persistedPageForCurrentChapter != null) return persistedPageForCurrentChapter;
    return 0;
  }, [requestedPageFromQuery, persistedPageForCurrentChapter]);

  const mangaTitleForProgress =
    mangaDetailData?.detail?.canonicalTitle ||
    mangaDetailData?.detail?.title?.english ||
    mangaDetailData?.detail?.title?.romaji ||
    mangaDetailData?.detail?.title?.native ||
    String(mangaId || "Unknown manga");

  const mangaPosterForProgress = mangaDetailData?.detail?.coverImage || null;

  const updateReaderSettings = (patch: Partial<ReaderSettings>) => {
    setReaderSettings((previous) => ({ ...previous, ...patch }));
  };

  useEffect(() => {
    if (!mangaId || chapterKey) return;
    if (!persistedReadState?.last_chapter_key) return;

    const resumePage = Math.max(0, Number(persistedReadState.last_page_index || 0));
    navigate(
      `/manga/read/${mangaId}?chapterKey=${encodeURIComponent(persistedReadState.last_chapter_key)}&page=${resumePage}`,
      { replace: true },
    );
  }, [
    mangaId,
    chapterKey,
    persistedReadState?.last_chapter_key,
    persistedReadState?.last_page_index,
    navigate,
  ]);

  const goToChapterKey = useCallback((nextChapterKey: string, pageIndex: number = 0) => {
    if (!mangaId || !nextChapterKey) return;
    const safePage = Math.max(0, Math.trunc(pageIndex));
    navigate(`/manga/read/${mangaId}?chapterKey=${encodeURIComponent(nextChapterKey)}&page=${safePage}`);
  }, [mangaId, navigate]);

  const goToChapterAtIndex = useCallback((index: number, preferredProvider?: string) => {
    if (index < 0 || index >= orderedChapters.length) return;
    const targetChapter = orderedChapters[index];
    if (!targetChapter?.sources?.length) return;

    const sourceToUse = getPreferredSource(targetChapter.sources, preferredProvider);
    if (sourceToUse?.chapterKey) {
      goToChapterKey(sourceToUse.chapterKey, 0);
    }
  }, [getPreferredSource, goToChapterKey, orderedChapters]);

  const goToNextChapter = useCallback(() => {
    if (currentChapterIndex < 0) return;
    goToChapterAtIndex(currentChapterIndex + 1, activeSource?.provider);
  }, [activeSource?.provider, currentChapterIndex, goToChapterAtIndex]);

  const goToPreviousChapter = useCallback(() => {
    if (currentChapterIndex < 0) return;
    goToChapterAtIndex(currentChapterIndex - 1, activeSource?.provider);
  }, [activeSource?.provider, currentChapterIndex, goToChapterAtIndex]);

  const nextPage = useCallback(() => {
    if (pages.length === 0) return;
    if (readerSettings.readingMode === "paged") {
      setCurrentPageIndex((previous) => {
        if (previous >= pages.length - 1) {
          goToNextChapter();
          return previous;
        }
        return previous + 1;
      });
      return;
    }
    window.scrollBy({ top: Math.round(window.innerHeight * 0.9), behavior: "smooth" });
  }, [goToNextChapter, pages.length, readerSettings.readingMode]);

  const previousPage = useCallback(() => {
    if (pages.length === 0) return;
    if (readerSettings.readingMode === "paged") {
      setCurrentPageIndex((previous) => {
        if (previous <= 0) {
          goToPreviousChapter();
          return previous;
        }
        return previous - 1;
      });
      return;
    }
    window.scrollBy({ top: -Math.round(window.innerHeight * 0.9), behavior: "smooth" });
  }, [goToPreviousChapter, pages.length, readerSettings.readingMode]);

  const switchToSource = useCallback((sourceChapterKey: string) => {
    if (!sourceChapterKey) return;
    goToChapterKey(sourceChapterKey, currentPageIndex);
  }, [currentPageIndex, goToChapterKey]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const target = document.documentElement;
        await target.requestFullscreen?.();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen block errors from the browser.
    }
  }, []);

  useEffect(() => {
    const chapterSignature = `${chapterKey}:${pages.length}`;

    if (pages.length === 0) {
      setCurrentPageIndex(0);
      initializedChapterRef.current = "";
      return;
    }

    if (initializedChapterRef.current === chapterSignature) {
      return;
    }

    initializedChapterRef.current = chapterSignature;

    const nextIndex = Math.min(initialPageForChapter, pages.length - 1);
    setCurrentPageIndex(nextIndex);
    setLongStripScrollPct(((nextIndex + 1) / pages.length) * 100);

    if (readerSettings.readingMode === "long-strip") {
      const frame = window.requestAnimationFrame(() => {
        const target = longStripPageRefs.current[nextIndex];
        if (target) {
          target.scrollIntoView({ behavior: "auto", block: "start" });
          return;
        }

        if (readerSettings.autoScrollTopOnChapterChange) {
          window.scrollTo({ top: 0, behavior: "auto" });
        }
      });

      return () => window.cancelAnimationFrame(frame);
    }

    if (readerSettings.autoScrollTopOnChapterChange) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [
    chapterKey,
    pages.length,
    initialPageForChapter,
    readerSettings.readingMode,
    readerSettings.autoScrollTopOnChapterChange,
  ]);

  useEffect(() => {
    setAllowAdultForSession(false);
  }, [mangaId, chapterKey]);

  useEffect(() => {
    if (readerSettings.preferredProvider === "auto") return;
    if (providerOptions.includes(readerSettings.preferredProvider)) return;
    setReaderSettings((previous) => ({ ...previous, preferredProvider: "auto" }));
  }, [readerSettings.preferredProvider, providerOptions]);

  useEffect(() => {
    if (readerSettings.preferredLanguage === "auto") return;
    if (languageOptions.some((option) => option.value === readerSettings.preferredLanguage)) return;
    setReaderSettings((previous) => ({ ...previous, preferredLanguage: "auto" }));
  }, [readerSettings.preferredLanguage, languageOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(readerSettings));
  }, [readerSettings]);

  useEffect(() => {
    if (!chapterKey || pages.length === 0) return;

    const normalizedPage = String(Math.max(0, currentPageIndex));
    if (searchParams.get("chapterKey") === chapterKey && searchParams.get("page") === normalizedPage) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set("chapterKey", chapterKey);
    next.set("page", normalizedPage);
    setSearchParams(next, { replace: true });
  }, [chapterKey, currentPageIndex, pages.length, searchParams, setSearchParams]);

  useEffect(() => {
    if (!mangaId || !chapterKey || pages.length === 0) return;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveReadingProgress.mutate({
        mangaId,
        mangaTitle: mangaTitleForProgress,
        mangaPoster: mangaPosterForProgress,
        lastChapterKey: chapterKey,
        lastChapterNumber: chapterNumber,
        lastChapterTitle: currentChapter?.chapterTitle || readData?.data?.chapter?.title || null,
        lastProvider: activeSource?.provider || readData?.data?.chapter?.provider || null,
        lastLanguage: activeSource?.language || readData?.data?.chapter?.language || null,
        lastPageIndex: currentPageIndex,
        totalPages: pages.length,
      });
    }, 450);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    mangaId,
    chapterKey,
    chapterNumber,
    currentPageIndex,
    pages.length,
    mangaTitleForProgress,
    mangaPosterForProgress,
    currentChapter?.chapterTitle,
    activeSource?.provider,
    activeSource?.language,
    readData?.data?.chapter?.title,
    readData?.data?.chapter?.provider,
    readData?.data?.chapter?.language,
    saveReadingProgress,
  ]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    autoAdvanceChapterRef.current = "";
    autoReverseChapterRef.current = "";
    lastScrollYRef.current = window.scrollY;
  }, [chapterKey]);

  useEffect(() => {
    if (!readerSettings.keepScreenAwake || typeof navigator === "undefined") {
      wakeLockRef.current?.release?.().catch?.(() => undefined);
      wakeLockRef.current = null;
      return;
    }

    const wakeLockApi = (navigator as any).wakeLock;
    if (!wakeLockApi?.request) return;

    let active = true;
    const requestWakeLock = async () => {
      try {
        wakeLockRef.current = await wakeLockApi.request("screen");
      } catch {
        wakeLockRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && active) {
        requestWakeLock();
      }
    };

    requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLockRef.current?.release?.().catch?.(() => undefined);
      wakeLockRef.current = null;
    };
  }, [readerSettings.keepScreenAwake]);

  useEffect(() => {
    if (readerSettings.readingMode !== "long-strip" || pages.length === 0) return;

    const updateProgressFromScroll = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const ratio = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      const nextIndex = Math.min(pages.length - 1, Math.round(ratio * (pages.length - 1)));
      setCurrentPageIndex(nextIndex);
      setLongStripScrollPct(ratio * 100);
    };

    updateProgressFromScroll();
    window.addEventListener("scroll", updateProgressFromScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateProgressFromScroll);
  }, [pages.length, readerSettings.readingMode, chapterKey]);

  useEffect(() => {
    if (readerSettings.readingMode !== "long-strip") return;
    if (!readerSettings.autoLoadNextChapterOnScrollEnd) return;
    if (!mangaId || !chapterKey || pages.length === 0) return;
    if (currentChapterIndex < 0 || currentChapterIndex >= orderedChapters.length - 1) return;

    const maybeAutoAdvanceChapter = () => {
      if (autoAdvanceChapterRef.current === chapterKey) return;

      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll <= 0) return;

      const distanceToBottom = maxScroll - window.scrollY;
      const atBottom = distanceToBottom <= 48;
      const onLastPage = currentPageIndex >= pages.length - 1;
      if (!atBottom || !onLastPage) return;

      const nextChapter = orderedChapters[currentChapterIndex + 1];
      if (!nextChapter?.sources?.length) return;

      const sourceToUse = getPreferredSource(nextChapter.sources, activeSource?.provider);
      if (!sourceToUse?.chapterKey) return;

      autoAdvanceChapterRef.current = chapterKey;
      navigate(`/manga/read/${mangaId}?chapterKey=${encodeURIComponent(sourceToUse.chapterKey)}&page=0`);
    };

    maybeAutoAdvanceChapter();
    window.addEventListener("scroll", maybeAutoAdvanceChapter, { passive: true });
    return () => window.removeEventListener("scroll", maybeAutoAdvanceChapter);
  }, [
    readerSettings.readingMode,
    readerSettings.autoLoadNextChapterOnScrollEnd,
    readerSettings.preferredProvider,
    readerSettings.preferredLanguage,
    mangaId,
    chapterKey,
    pages.length,
    currentPageIndex,
    currentChapterIndex,
    orderedChapters,
    activeSource?.provider,
    getPreferredSource,
    navigate,
  ]);

  useEffect(() => {
    if (readerSettings.readingMode !== "long-strip") return;
    if (!mangaId || !chapterKey || pages.length === 0) return;
    if (currentChapterIndex <= 0) return;

    const maybeAutoReverseChapter = () => {
      const currentY = window.scrollY;
      const previousY = lastScrollYRef.current;
      lastScrollYRef.current = currentY;

      const scrolledUp = currentY < previousY - 8;
      if (!scrolledUp) return;
      if (autoReverseChapterRef.current === chapterKey) return;

      const atTop = currentY <= 24;
      if (!atTop) return;

      const previousChapter = orderedChapters[currentChapterIndex - 1];
      if (!previousChapter?.sources?.length) return;

      const sourceToUse = getPreferredSource(previousChapter.sources, activeSource?.provider);
      if (!sourceToUse?.chapterKey) return;

      autoReverseChapterRef.current = chapterKey;
      // Use a large page index so the next chapter load clamps to its last page.
      navigate(
        `/manga/read/${mangaId}?chapterKey=${encodeURIComponent(sourceToUse.chapterKey)}&page=999999`,
      );
    };

    window.addEventListener("scroll", maybeAutoReverseChapter, { passive: true });
    return () => window.removeEventListener("scroll", maybeAutoReverseChapter);
  }, [
    readerSettings.readingMode,
    readerSettings.preferredProvider,
    readerSettings.preferredLanguage,
    mangaId,
    chapterKey,
    pages.length,
    currentPageIndex,
    currentChapterIndex,
    orderedChapters,
    activeSource?.provider,
    getPreferredSource,
    navigate,
  ]);

  useEffect(() => {
    if (pages.length === 0) {
      setCurrentPageIndex(0);
      setLongStripScrollPct(0);
      return;
    }
    setCurrentPageIndex((previous) => Math.min(previous, pages.length - 1));
  }, [pages.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (typing) return;

      const key = event.key;
      const lowerKey = key.toLowerCase();

      if (lowerKey === "?") {
        event.preventDefault();
        setShortcutsOpen((previous) => !previous);
        return;
      }

      if (lowerKey === "s") {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if (lowerKey === "h") {
        event.preventDefault();
        updateReaderSettings({ showHud: !readerSettings.showHud });
        return;
      }

      if (lowerKey === "m") {
        event.preventDefault();
        updateReaderSettings({
          readingMode: readerSettings.readingMode === "long-strip" ? "paged" : "long-strip",
        });
        return;
      }

      if (lowerKey === "f") {
        event.preventDefault();
        toggleFullscreen();
        return;
      }

      if (key === "+" || key === "=") {
        event.preventDefault();
        updateReaderSettings({ zoom: clampZoom(readerSettings.zoom + 0.1) });
        return;
      }

      if (key === "-") {
        event.preventDefault();
        updateReaderSettings({ zoom: clampZoom(readerSettings.zoom - 0.1) });
        return;
      }

      if (key === "0") {
        event.preventDefault();
        updateReaderSettings({ zoom: 1 });
        return;
      }

      if (key === "[") {
        event.preventDefault();
        goToPreviousChapter();
        return;
      }

      if (key === "]") {
        event.preventDefault();
        goToNextChapter();
        return;
      }

      if (lowerKey === "g" && event.shiftKey) {
        event.preventDefault();
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        return;
      }

      if (lowerKey === "g") {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (key === "ArrowLeft" || lowerKey === "k") {
        event.preventDefault();
        previousPage();
        return;
      }

      if (key === "ArrowRight" || lowerKey === "j" || key === " ") {
        event.preventDefault();
        nextPage();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    chapterKey,
    currentChapterIndex,
    goToNextChapter,
    goToPreviousChapter,
    nextPage,
    pages.length,
    previousPage,
    readerSettings,
    toggleFullscreen,
  ]);

  const isAdultManga = Boolean(mangaDetailData?.detail?.adult);
  const requiresAdultWarning =
    isAdultManga && contentSafetySettings.warnBeforeAdultOpen && !allowAdultForSession;

  if (contentSafetySettings.warnBeforeAdultOpen && !allowAdultForSession && loadingMangaMeta) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        {!isNative && <Background />}
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground font-bold uppercase tracking-wider text-sm">
          Checking content safety...
        </p>
      </div>
    );
  }

  if (requiresAdultWarning) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        {!isNative && <Background />}
        <GlassPanel className="w-full max-w-2xl p-6 md:p-8 border border-amber-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-500 mt-1" />
            <div>
              <h2 className="text-2xl font-black">Sensitive Content Warning</h2>
              <p className="mt-2 text-muted-foreground">
                This chapter belongs to a mature title. Continue only if you are comfortable
                viewing 18+ content.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="w-full overflow-hidden rounded-xl border border-rose-500/30">
              <div className="relative">
                <img
                  src="/manga18+.jpg"
                  alt="18+ Content Banner"
                  className="h-28 w-full object-cover md:h-36"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/70" />
                <div className="absolute inset-0 flex items-end p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-100">
                    Mature Content • 18+ Only
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate(`/manga/${mangaId}`)}
              className="px-4 py-2 rounded-lg border border-white/15 bg-white/5 text-sm font-bold hover:bg-white/10 transition-colors"
            >
              Back to Details
            </button>
            <button
              onClick={() => setAllowAdultForSession(true)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition-all"
            >
              Continue to Chapter
            </button>
            <button
              onClick={() => {
                updateContentSafetySettings({
                  showAdultEverywhere: true,
                  warnBeforeAdultOpen: false,
                });
                setAllowAdultForSession(true);
              }}
              className="px-4 py-2 rounded-lg border border-primary/30 bg-primary/15 text-primary text-sm font-bold hover:bg-primary/25 transition-colors"
            >
              Always Show Mature Media
            </button>
          </div>
        </GlassPanel>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        {!isNative && <Background />}
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground font-bold uppercase tracking-wider text-sm">
          Loading Chapter...
        </p>
      </div>
    );
  }

  if (error || !readData || pages.length === 0) {
    const suggestedProviders = readData?.guidance?.suggestedProviders || [];
    const attemptedProviders = readData?.guidance?.attemptedProviders || [];

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        {!isNative && <Background />}
        <GlassPanel className="w-full max-w-2xl p-6 md:p-8 border border-white/10 text-left">
          <h2 className="text-xl font-bold mb-3">Cannot load chapter</h2>
          <p className="text-muted-foreground mb-3">
            {readData?.guidance?.message || "We couldn't read this chapter. It might be unavailable or removed."}
          </p>

          {attemptedProviders.length > 0 && (
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Attempted providers: {attemptedProviders.join(", ")}
            </p>
          )}

          {availableSources.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Try another provider
              </p>
              <div className="flex flex-wrap gap-2">
                {availableSources.map((source) => {
                  const isSuggested = suggestedProviders.includes(source.provider);
                  return (
                    <button
                      key={source.chapterKey}
                      onClick={() => goToChapterKey(source.chapterKey, currentPageIndex)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors",
                        isSuggested
                          ? "bg-primary text-primary-foreground"
                          : "bg-white/5 text-foreground hover:bg-white/10",
                      )}
                    >
                      {source.provider}
                      {isSuggested ? " (recommended)" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => navigate(`/manga/${mangaId}`)}
              className="px-6 py-2 bg-primary/20 text-primary font-bold uppercase tracking-wider rounded-xl hover:bg-primary/30 transition-colors"
            >
              Back to Details
            </button>
          </div>
        </GlassPanel>
      </div>
    );
  }

  const shouldShowReaderHud = readerSettings.showHud && !isFullscreen;

  return (
    <div ref={readerRootRef} className="min-h-screen bg-black text-white">
      {shouldShowReaderHud && (
        <>
          <div className="sticky top-0 z-50 bg-black/85 backdrop-blur-md border-b border-white/10 p-3 md:p-4 flex items-center gap-3">
            <button
              onClick={() => navigate(`/manga/${mangaId}`)}
              className="flex items-center gap-2 text-white/70 hover:text-white transition-colors group"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="font-bold hidden sm:inline">Back</span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-sm md:text-base truncate">{chapterLabel}</p>
              <p className="text-[11px] uppercase tracking-wider text-white/50">
                {activeSource?.provider || readData.data?.chapter?.provider || "source"} •{" "}
                {formatLanguageLabel(activeSource?.language || readData.data?.chapter?.language)} • Chapter{" "}
                {currentChapterOrdinal}/{totalChapterCount} • Page{" "}
                {currentPageIndex + 1}/{pages.length}
              </p>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Reader settings"
                aria-label="Reader settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>

            <div className="hidden md:flex items-center gap-2">
              {availableSources.length > 1 && (
                <select
                  value={chapterKey}
                  onChange={(event) => switchToSource(event.target.value)}
                  className="rounded-lg border border-white/15 bg-black/70 px-2 py-1 text-xs uppercase tracking-wider"
                >
                  {availableSources.map((source) => (
                    <option key={source.chapterKey} value={source.chapterKey}>
                      {source.provider} • {formatLanguageLabel(source.language)}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Toggle fullscreen (F)"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setShortcutsOpen((previous) => !previous)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Keyboard shortcuts (?)"
              >
                <Keyboard className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Reader settings (S)"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {availableSources.length > 1 && (
            <div className="md:hidden border-b border-white/10 bg-black/75 px-3 py-2 flex gap-2 overflow-x-auto">
              {availableSources.map((source) => {
                const active = source.chapterKey === chapterKey;
                return (
                  <button
                    key={source.chapterKey}
                    onClick={() => goToChapterKey(source.chapterKey, currentPageIndex)}
                    className={cn(
                      "whitespace-nowrap rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
                      active
                        ? "border-primary/50 bg-primary/20 text-primary"
                        : "border-white/15 bg-white/5 text-white/70",
                    )}
                  >
                    {source.provider} • {formatLanguageLabel(source.language)}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {!isFullscreen && (
        <div
          className={cn(
            "bg-white/10",
            shouldShowReaderHud
              ? "fixed left-0 right-0 top-[58px] md:top-[72px] z-40 h-1.5"
              : "fixed left-0 right-0 top-0 z-50 h-1.5",
          )}
        >
          <div
            className="h-full bg-red-600 transition-[width] duration-200"
            style={{ width: `${readerProgressPct}%`, minWidth: readerProgressPct > 0 ? "8px" : "0px" }}
          />
        </div>
      )}

      {!shouldShowReaderHud && !isFullscreen && (
        <div className="fixed right-3 top-3 z-50 flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-full border border-white/20 bg-black/60 p-2 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
            title="Reader settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => updateReaderSettings({ showHud: true })}
            className="rounded-full border border-white/20 bg-black/60 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/80 hover:bg-black/80 hover:text-white transition-colors"
            title="Show reader controls"
          >
            Show HUD
          </button>
        </div>
      )}

      <main
        className={cn(
          "mx-auto pb-28",
          readerSettings.readingMode === "paged" ? "max-w-[1400px]" : "max-w-[1100px]",
        )}
      >
        {readerSettings.readingMode === "paged" ? (
          <div className="relative min-h-[calc(100vh-9rem)] flex items-center justify-center px-2 md:px-8">
            <button
              onClick={previousPage}
              className="absolute left-2 md:left-4 z-20 rounded-full bg-black/60 border border-white/15 p-2 hover:bg-black/80 transition-colors"
              title="Previous page (Left/K)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {pages[currentPageIndex] && (
              <img
                src={getProxiedImageUrl(
                  pages[currentPageIndex].proxiedImageUrl || pages[currentPageIndex].imageUrl || "",
                )}
                alt={`Page ${currentPageIndex + 1}`}
                loading="eager"
                className={cn(
                  "mx-auto object-contain bg-black/40 rounded-md",
                  readerSettings.fitMode === "height"
                    ? "max-h-[calc(100vh-11rem)] w-auto"
                    : "w-full max-h-[calc(100vh-11rem)]",
                )}
                style={{
                  transform: `scale(${readerSettings.zoom})`,
                  transformOrigin: "center center",
                }}
              />
            )}

            <button
              onClick={nextPage}
              className="absolute right-2 md:right-4 z-20 rounded-full bg-black/60 border border-white/15 p-2 hover:bg-black/80 transition-colors"
              title="Next page (Right/J/Space)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center px-2 md:px-4" style={{ gap: '0px' }}>
            {pages.map((pageImage, index) => (
              <div
                key={index}
                className="relative w-full"
                ref={(node) => {
                  longStripPageRefs.current[index] = node;
                }}
              >
                <img
                  src={getProxiedImageUrl(pageImage.proxiedImageUrl || pageImage.imageUrl || "")}
                  alt={`Page ${index + 1}`}
                  loading={index < 5 ? "eager" : "lazy"}
                  className={cn(
                    "mx-auto block min-h-[40vh] object-contain",
                    readerSettings.fitMode === "height" ? "max-h-[calc(100vh-8rem)] w-auto" : "w-full",
                  )}
                  style={
                    readerSettings.fitMode === "width"
                      ? { width: `${Math.round(readerSettings.zoom * 100)}%` }
                      : { transform: `scale(${readerSettings.zoom})`, transformOrigin: "top center" }
                  }
                />
                {readerSettings.showPageNumber && (
                  <p className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/65">
                    Page {index + 1}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-12 text-center text-white/45 font-bold uppercase tracking-wider text-xs">
          End of Chapter
        </div>
      </main>

      {shouldShowReaderHud && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur-xl border border-white/10 rounded-full px-2 py-1.5 flex items-center gap-1 md:gap-2">
          <button
            onClick={goToPreviousChapter}
            disabled={currentChapterIndex <= 0}
            className="rounded-full p-2 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous chapter ([)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={previousPage}
            className="rounded-full p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Previous page (Left/K)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-2 text-xs font-bold uppercase tracking-wider text-white/70 min-w-[95px] text-center">
            {currentPageIndex + 1}/{pages.length}
          </span>

          <button
            onClick={nextPage}
            className="rounded-full p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Next page (Right/J/Space)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goToNextChapter}
            disabled={currentChapterIndex < 0 || currentChapterIndex >= orderedChapters.length - 1}
            className="rounded-full p-2 text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next chapter (])"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </button>
        </div>
      )}

      {isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="fixed right-3 top-3 z-50 rounded-full border border-white/20 bg-black/60 p-2 text-white/80 hover:bg-black/80 hover:text-white transition-colors"
          title="Exit fullscreen (F / Esc)"
        >
          <Minimize className="w-4 h-4" />
        </button>
      )}

      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => setShortcutsOpen(false)}
        >
          <GlassPanel className="w-full max-w-lg p-5 border border-white/15" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-bold mb-3">Reader Shortcuts</h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <p>Right / J / Space</p><p className="text-right text-foreground">Next page</p>
              <p>Left / K</p><p className="text-right text-foreground">Previous page</p>
              <p>[ / ]</p><p className="text-right text-foreground">Previous / Next chapter</p>
              <p>S</p><p className="text-right text-foreground">Open settings</p>
              <p>?</p><p className="text-right text-foreground">Toggle this help</p>
              <p>F</p><p className="text-right text-foreground">Fullscreen</p>
              <p>M</p><p className="text-right text-foreground">Toggle reading mode</p>
              <p>H</p><p className="text-right text-foreground">Toggle HUD</p>
              <p>+ / - / 0</p><p className="text-right text-foreground">Zoom in / out / reset</p>
              <p>G / Shift+G</p><p className="text-right text-foreground">Top / Bottom</p>
            </div>
          </GlassPanel>
        </div>
      )}

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom" className="bg-black text-white border-white/10 h-[82vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Reader Settings</SheetTitle>
            <SheetDescription>Personalize layout, controls, and source behavior.</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5 text-sm">
            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Preferred source</label>
              <select
                value={readerSettings.preferredProvider}
                onChange={(event) => {
                  const nextProvider = event.target.value;
                  updateReaderSettings({ preferredProvider: nextProvider });

                  const nextSource = getPreferredSource(
                    availableSources,
                    activeSource?.provider,
                    nextProvider,
                    readerSettings.preferredLanguage,
                  );
                  if (nextSource?.chapterKey && nextSource.chapterKey !== chapterKey) {
                    goToChapterKey(nextSource.chapterKey, currentPageIndex);
                  }
                }}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2"
              >
                <option value="auto">Auto (follow best source)</option>
                {providerOptions.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Preferred language</label>
              <select
                value={readerSettings.preferredLanguage}
                onChange={(event) => {
                  const nextLanguage = event.target.value;
                  updateReaderSettings({ preferredLanguage: nextLanguage });

                  const nextSource = getPreferredSource(
                    availableSources,
                    activeSource?.provider,
                    readerSettings.preferredProvider,
                    nextLanguage,
                  );
                  if (nextSource?.chapterKey && nextSource.chapterKey !== chapterKey) {
                    goToChapterKey(nextSource.chapterKey, currentPageIndex);
                  }
                }}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2"
              >
                <option value="auto">Auto ({autoLanguageLabel})</option>
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Reading mode</label>
              <select
                value={readerSettings.readingMode}
                onChange={(event) => updateReaderSettings({ readingMode: event.target.value as ReadingMode })}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2"
              >
                <option value="long-strip">Long strip</option>
                <option value="paged">Paged</option>
              </select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-white/50">Fit mode</label>
              <select
                value={readerSettings.fitMode}
                onChange={(event) => updateReaderSettings({ fitMode: event.target.value as FitMode })}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2"
              >
                <option value="width">Fit width</option>
                <option value="height">Fit height</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-white/50">
                <span>Zoom</span>
                <span>{readerSettings.zoom.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.8}
                step={0.1}
                value={readerSettings.zoom}
                onChange={(event) => updateReaderSettings({ zoom: clampZoom(Number(event.target.value)) })}
                className="mt-2 w-full"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-white/50">
                <span>Page gap</span>
                <span>{readerSettings.gapSize}px</span>
              </div>
              <p className="mt-2 text-xs text-white/60">
                Seamless mode enabled: page gaps are disabled for continuous reading.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span>Show HUD controls</span>
                <Switch checked={readerSettings.showHud} onCheckedChange={(checked) => updateReaderSettings({ showHud: checked })} />
              </div>
              <div className="flex items-center justify-between">
                <span>Show page numbers</span>
                <Switch checked={readerSettings.showPageNumber} onCheckedChange={(checked) => updateReaderSettings({ showPageNumber: checked })} />
              </div>
              <div className="flex items-center justify-between">
                <span>Auto scroll top on chapter change</span>
                <Switch
                  checked={readerSettings.autoScrollTopOnChapterChange}
                  onCheckedChange={(checked) => updateReaderSettings({ autoScrollTopOnChapterChange: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Auto load next chapter on scroll end</span>
                <Switch
                  checked={readerSettings.autoLoadNextChapterOnScrollEnd}
                  onCheckedChange={(checked) => updateReaderSettings({ autoLoadNextChapterOnScrollEnd: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <span>Keep screen awake</span>
                <Switch
                  checked={readerSettings.keepScreenAwake}
                  onCheckedChange={(checked) => updateReaderSettings({ keepScreenAwake: checked })}
                />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}