import { readerImageStyles, readerPageIsEager } from "./readerImageStyles";
import { ReaderPageRail } from './ReaderPageRail';
import { useMotionPreference } from '@/hooks/ui/useMotionPreference';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
  Info,
  List,
  Loader2,
  Maximize,
  MessageSquare,
  Minimize,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import {
  ReaderToolButton as ToolBtn,
  ReaderTopbar,
  ReaderToolbar,
  ReaderSettingsSheet,
  ReaderNavigationSheet,
} from "./ReaderChrome";
import { ReaderImage, type ReaderPageImage } from "./ReaderImage";
import { useReaderSettings } from "@/hooks/media/useReaderSettings";
import { useReaderFullscreen } from "@/hooks/media/useReaderFullscreen";
import { useReaderKeyboard } from "@/pages/manga/hooks/useReaderKeyboard";
import { useReaderKeybinds } from "@/hooks/media/useReaderKeybinds";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { getProfileKnobs } from "@/lib/memoryProfile";
import { readerPageRenderKey } from "@/lib/reader/imageLifecycle";
import {
  fetchViaMobileProxy,
  isMobileProxyUrl,
} from "@/core/extensions/mobile/mobileProxy";
import { isCapacitor, isNative } from "@/lib/platform/platform";
import { KeepAwake } from "@capacitor-community/keep-awake";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SourceDebug } from "@/components/extensions/SourceDebug";
import { cn } from "@/lib/utils";
import uiI18n from "@/lib/uiI18n";

interface CustomReaderViewProps {
  title: string;
  chapterLabel: string;
  sourceName: string;
  namespace: string;
  pages: ReaderPageImage[];
  pageIndex: number;
  onPage(page: number): void;
  pageContainer: RefObject<HTMLDivElement>;
  scrollContainer: RefObject<HTMLDivElement>;
  entries: { id: string; label: string; number?: number }[];
  chapterId: string;
  onChapter(id: string): void;
  prev?: string;
  next?: string;
  onBack(): void;
  onHome(): void;
  loading: boolean;
  fetching: boolean;
  failed: boolean;
  error?: string;
  onReload(): void;
  actionError?: string;
  onRetrySync?: () => void;
  download?: () => void;
  downloading?: boolean;
  translation?: ReactNode;
  comments?: ReactNode;
}

/** Original source routes and progress supplied by the adapter; standard reader chrome. */
export function CustomReaderView(props: CustomReaderViewProps) {
  const {
    title,
    chapterLabel,
    sourceName,
    namespace,
    pages,
    pageIndex,
    onPage,
    entries,
    chapterId,
    pageContainer,
    scrollContainer,
  } = props;
  const { settings, updateSetting } = useReaderSettings();
  const compact = useIsMobile(),
    total = pages.length,
    container = useRef<HTMLDivElement>(null);
  const { keybinds } = useReaderKeybinds();
  const [showSettings, setShowSettings] = useState(false),
    [showNavigator, setShowNavigator] = useState(false),
    [showComments, setShowComments] = useState(false);
  const [chapterSearch, setChapterSearch] = useState(""),
    [chapterPage, setChapterPage] = useState(0),
    [captureError, setCaptureError] = useState("");
  const [scrollHeight, setScrollHeight] = useState(window.innerHeight - 64);
  const { isFs, toggleFullscreen, fullscreenExitVisible } = useReaderFullscreen(
    container,
    settings.autoFullscreen,
    total
  );
  const chromeVisible = !isFs || !settings.hideChromeInFullscreen;
  useEffect(() => {
    setChapterPage(0);
  }, [chapterSearch, chapterId]);
  useEffect(() => {
    setCaptureError("");
  }, [chapterId]);
  useLayoutEffect(() => {
    const root = scrollContainer.current;
    if (!root) return;
    const measure = () =>
      setScrollHeight(
        Math.max(200, window.innerHeight - root.getBoundingClientRect().top)
      );
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure),
      topbar = container.current?.querySelector(".reader-topbar");
    if (topbar) observer.observe(topbar);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [chromeVisible, isFs, scrollContainer]);
  useEffect(() => {
    const original = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("manga-reader-open");
    return () => {
      document.documentElement.style.overflow = original;
      document.body.classList.remove("manga-reader-open");
    };
  }, []);
  const jumpToPage = useCallback(
    (index: number) => {
      const target = Math.max(0, Math.min(total - 1, index));
      onPage(target);
      if (settings.readingMode === "vertical")
        pageContainer.current
          ?.querySelector(`[data-extension-page="${target}"]`)
          ?.scrollIntoView({ block: "start" });
    },
    [total, settings.readingMode, onPage, pageContainer]
  );
  const reducedMotion = useMotionPreference();
  const scrollReader = (direction: number) => {
    if (settings.autoScroll) updateSetting('autoScroll', false);
    scrollContainer.current?.scrollBy({ top: direction * 120, behavior: reducedMotion ? 'instant' : 'smooth' });
  };
  const nextPage = () =>
    settings.readingMode === "vertical"
      ? scrollContainer.current?.scrollBy({
          top: scrollHeight * 0.9,
          behavior: "smooth",
        })
      : pageIndex + (settings.doublePage ? 2 : 1) < total
      ? jumpToPage(pageIndex + (settings.doublePage ? 2 : 1))
      : props.next && props.onChapter(props.next);
  const previousPage = () =>
    settings.readingMode === "vertical"
      ? scrollContainer.current?.scrollBy({
          top: -scrollHeight * 0.9,
          behavior: "smooth",
        })
      : pageIndex > 0
      ? jumpToPage(pageIndex - (settings.doublePage ? 2 : 1))
      : props.prev && props.onChapter(props.prev);
  useReaderKeyboard(
    keybinds,
    {
      nextPage,
      prevPage: previousPage,
      scrollDown: () => scrollReader(1),
      scrollUp: () => scrollReader(-1),
      nextChapter: () => props.next && props.onChapter(props.next),
      prevChapter: () => props.prev && props.onChapter(props.prev),
      toggleFullscreen,
      toggleDirection: () =>
        updateSetting(
          "readingDirection",
          settings.readingDirection === "ltr" ? "rtl" : "ltr"
        ),
      zoomIn: () => updateSetting("zoom", Math.min(300, settings.zoom + 10)),
      zoomOut: () => updateSetting("zoom", Math.max(50, settings.zoom - 10)),
      toggleComments: props.comments
        ? () => setShowComments((value) => !value)
        : undefined,
      reload: props.onReload,
    },
    !showSettings && !showNavigator && !showComments
  );
  useEffect(() => {
    const root = scrollContainer.current;
    if (!root || !settings.zoomWithWheel) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      updateSetting(
        "zoom",
        Math.max(
          50,
          Math.min(300, settings.zoom + (event.deltaY > 0 ? -10 : 10))
        )
      );
    };
    root.addEventListener("wheel", wheel, { passive: false });
    return () => root.removeEventListener("wheel", wheel);
  }, [settings.zoomWithWheel, settings.zoom, updateSetting, scrollContainer]);
  useEffect(() => {
    const element = scrollContainer.current;
    if (
      !element ||
      settings.readingMode !== "vertical" ||
      !settings.autoScroll ||
      showSettings ||
      showNavigator ||
      showComments
    )
      return;
    let frame = 0,
      last = 0;
    const tick = (now: number) => {
      if (last)
        element.scrollTop +=
          Math.min(now - last, 50) * settings.autoScrollSpeed * 0.018;
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    settings.readingMode,
    settings.autoScroll,
    settings.autoScrollSpeed,
    showSettings,
    showNavigator,
    showComments,
    scrollContainer,
  ]);
  useEffect(() => {
    if (!settings.keepScreenAwake) return;
    if (isCapacitor()) {
      void KeepAwake.keepAwake().catch(() => {});
      return () => {
        void KeepAwake.allowSleep().catch(() => {});
      };
    }
    let stopped = false,
      lock: { release(): Promise<void> } | undefined;
    const acquire = () => {
      void navigator.wakeLock
        ?.request("screen")
        .then((value) => {
          if (stopped) void value.release();
          else lock = value;
        })
        .catch(() => {});
    };
    const visible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", visible);
      void lock?.release().catch(() => {});
    };
  }, [settings.keepScreenAwake]);
  async function capture() {
    const page = pages[pageIndex];
    if (!page) return;
    setCaptureError("");
    try {
      const target = page.proxiedImageUrl || page.imageUrl;
      let blob: Blob;
      if (isMobileProxyUrl(target)) {
        const response = await fetchViaMobileProxy(target, {
          originalUrl: page.originalUrl || page.imageUrl,
          headers: page.headers,
          responseType: "arraybuffer",
        });
        if (!response.ok || !response.data)
          throw Error("Could not capture this page");
        blob = new Blob([response.data], {
          type: response.contentType.split(";")[0] || "image/jpeg",
        });
      } else {
        const response = await fetch(target);
        if (!response.ok) throw Error("Could not capture this page");
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `${title}-page-${pageIndex + 1}.jpg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setCaptureError(
        error instanceof Error ? error.message : "Could not capture this page"
      );
    }
  }
  const imageStyles = readerImageStyles(
    settings,
    isNative() || window.matchMedia("(pointer: coarse)").matches
  );
  const imageStyle =
    settings.readingMode === "vertical"
      ? imageStyles.vertical
      : imageStyles.paged;
  const eagerFor = (index: number) =>
    readerPageIsEager(
      settings,
      index,
      pageIndex,
      isNative() || window.matchMedia("(pointer: coarse)").matches
    );
  const filtered = entries.filter((entry) =>
    entry.label.toLocaleLowerCase().includes(chapterSearch.toLocaleLowerCase())
  );
  const navClass =
    "ui-button inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold hover:bg-muted active:scale-95 disabled:opacity-40 sm:gap-1 sm:px-2.5 sm:text-sm";
  return (
    <div
      ref={container}
      data-reader-fullscreen={isFs || undefined}
      className="relative min-h-screen text-foreground"
      style={{ backgroundColor: settings.backgroundColor }}
    >
      {chromeVisible && (
        <ReaderTopbar>
          <button
            onClick={props.onBack}
            className={navClass}
            aria-label="Back to title"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            disabled={!props.prev}
            onClick={() => props.prev && props.onChapter(props.prev)}
            className={navClass}
            aria-label="Previous chapter"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden min-[380px]:inline">
              {uiI18n.t("app.prev_e96fea52")}
            </span>
          </button>
          <button
            onClick={() => setShowNavigator(true)}
            className="flex min-h-11 min-w-0 flex-1 flex-col items-center px-1 text-center sm:px-2"
            aria-label="Open chapter and provider navigator"
          >
            <span className="w-full truncate text-xs font-bold sm:text-sm">
              {title}
            </span>
            <span className="w-full truncate text-[11px] text-muted-foreground sm:text-xs">
              {chapterLabel} · {sourceName}
              {total > 0 ? ` · ${pageIndex + 1} / ${total}` : ""}
            </span>
          </button>
          <button
            onClick={() => setShowNavigator(true)}
            className={cn(navClass, "size-11 justify-center")}
            aria-label="Open chapter and provider navigator"
          >
            <List className="size-4" />
          </button>
          <button
            disabled={!props.next}
            onClick={() => props.next && props.onChapter(props.next)}
            className={navClass}
            aria-label="Next chapter"
          >
            <span className="hidden min-[380px]:inline">
              {uiI18n.t("app.next_bc981983")}
            </span>
            <ChevronRight className="size-4" />
          </button>
        </ReaderTopbar>
      )}
      {settings.showProgressBar && total > 0 && (
        <div
          role="progressbar"
          aria-label="Chapter reading progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={pageIndex + 1}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 h-1 bg-muted/40"
        >
          <div
            className="h-full bg-primary"
            style={{
              width: `${Math.min(100, ((pageIndex + 1) / total) * 100)}%`,
            }}
          />
        </div>
      )}
      <ReaderToolbar visible={chromeVisible || fullscreenExitVisible}>
        {chromeVisible && (
          <>
            {props.translation}
            <ToolBtn
              label={uiI18n.t("app.settings_c7f73bb5")}
              onClick={() => setShowSettings(true)}
            >
              <Settings2 className="size-5" />
            </ToolBtn>
          </>
        )}
        <ToolBtn
          label={
            isFs
              ? uiI18n.t("app.exit_fullscreen_1302df0b")
              : uiI18n.t("app.fullscreen_bb08d10b")
          }
          onClick={toggleFullscreen}
          active={isFs}
        >
          {isFs ? (
            <Minimize className="size-5" />
          ) : (
            <Maximize className="size-5" />
          )}
        </ToolBtn>
        {chromeVisible && (
          <>
            <ToolBtn
              label={uiI18n.t("app.reading_tools_74769f12")}
              onClick={() => setShowNavigator(true)}
            >
              <List className="size-5" />
            </ToolBtn>
            <ToolBtn
              label={uiI18n.t("app.manga_info_087808bc")}
              onClick={props.onBack}
            >
              <Info className="size-5" />
            </ToolBtn>
            <ToolBtn
              label={uiI18n.t("app.home_70f8bb9a")}
              onClick={props.onHome}
            >
              <Home className="size-5" />
            </ToolBtn>
            {settings.showCaptureButton && (
              <ToolBtn
                label={uiI18n.t("app.capture_page_b4c28650")}
                onClick={() => void capture()}
              >
                <Camera className="size-5" />
              </ToolBtn>
            )}
            {settings.showComments && props.comments && (
              <ToolBtn
                label={uiI18n.t("app.comments_fce06e20")}
                onClick={() => setShowComments(true)}
                active={showComments}
              >
                <MessageSquare className="size-5" />
              </ToolBtn>
            )}
            {settings.showReloadButton && (
              <ToolBtn
                label={uiI18n.t("app.reload_cce71553")}
                onClick={props.onReload}
              >
                <RefreshCw
                  className={cn("size-5", props.fetching && "animate-spin")}
                />
              </ToolBtn>
            )}
            {props.download && (
              <ToolBtn
                label={
                  props.downloading ? "Queueing download…" : "Download chapter"
                }
                onClick={props.download}
              >
                <Download className="size-5" />
              </ToolBtn>
            )}
          </>
        )}
      </ReaderToolbar>
      <div className="relative">
      {chromeVisible && <ReaderPageRail page={pageIndex} total={total} onPage={jumpToPage} />}
      <div
        ref={scrollContainer}
        data-reader-scroll
        className={cn(
          "mx-auto overflow-y-auto overscroll-contain py-0 sm:pr-4 sm:py-6",
          chromeVisible ? "pl-2 sm:pl-4" : "pl-0 sm:pl-4",
          settings.zoom > 100 ? "overflow-x-auto" : "overflow-x-hidden"
        )}
        style={{
          height: scrollHeight,
          filter:
            settings.brightness < 100
              ? `brightness(${settings.brightness / 100})`
              : undefined,
          touchAction: "pan-x pan-y",
        }}
        onWheel={() => {
          if (settings.autoScroll) updateSetting("autoScroll", false);
        }}
      >
        {(props.actionError || captureError) && (
          <Alert variant="destructive" className="mx-auto mb-4 max-w-3xl">
            <AlertDescription>
              {props.actionError || captureError}
              {props.onRetrySync && (
                <Button variant="outline" size="sm" onClick={props.onRetrySync}>
                  Retry sync
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        <SourceDebug
          kind="custom"
          unit="pages"
          sources={pages.map(() => ({
            providerKey: namespace,
            providerName: sourceName,
          }))}
        />
        {props.loading ? (
          <div
            role="status"
            className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground"
          >
            <Loader2 className="size-5 animate-spin" />
            {uiI18n.t("app.loading_pages_0c674f17")}
          </div>
        ) : !total || props.failed ? (
          <GlassPanel className="mx-auto max-w-xl p-6">
            <h2 className="text-xl font-bold">
              {uiI18n.t("app.unable_to_load_chapter_03142a30")}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {props.error || "The source returned no pages for this chapter."}
            </p>
            <div className="mt-5 flex gap-3">
              <Button onClick={props.onReload}>
                <RefreshCw className="mr-2 size-4" />
                Retry chapter
              </Button>
              <Button variant="outline" onClick={() => setShowNavigator(true)}>
                Choose chapter
              </Button>
            </div>
          </GlassPanel>
        ) : settings.readingMode === "vertical" ? (
          <div
            ref={pageContainer}
            data-reader-entry
            className="flex flex-col items-center"
            style={{ gap: settings.gap }}
          >
            {pages.map((page, index) => (
              <div
                key={readerPageRenderKey(chapterId, page)}
                data-extension-page={index}
                data-page={index}
                className="flex w-full justify-center"
              >
                <ReaderImage
                  page={page}
                  mode={settings.loadingMethod}
                  style={imageStyle}
                  eager={eagerFor(index)}
                  onRetryChapter={props.onReload}
                />
              </div>
            ))}
            <div className="flex flex-wrap justify-center gap-3 py-12 pb-24">
              <Button
                variant="outline"
                disabled={!props.prev}
                onClick={() => props.prev && props.onChapter(props.prev)}
              >
                <ChevronLeft className="mr-2 size-4" />
                Previous chapter
              </Button>
              <Button
                disabled={!props.next}
                onClick={() => props.next && props.onChapter(props.next)}
              >
                Next chapter
                <ChevronRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "relative flex min-h-full items-center justify-center",
              settings.readingDirection === "rtl" && "flex-row-reverse"
            )}
          >
            {pages
              .slice(pageIndex, pageIndex + (settings.doublePage ? 2 : 1))
              .map((page) => (
                <ReaderImage
                  key={readerPageRenderKey(chapterId, page)}
                  page={page}
                  mode={settings.loadingMethod}
                  style={imageStyle}
                  eager
                  onRetryChapter={props.onReload}
                />
              ))}
            {settings.clickToTurn && (
              <>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={
                    settings.readingDirection === "rtl"
                      ? "Next page"
                      : "Previous page"
                  }
                  onClick={(event) => {
                    (settings.readingDirection === "rtl"
                      ? nextPage
                      : previousPage)();
                    event.currentTarget.blur();
                  }}
                  className="absolute left-0 top-0 h-full w-1/3 cursor-w-resize bg-transparent outline-none"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={
                    settings.readingDirection === "rtl"
                      ? "Previous page"
                      : "Next page"
                  }
                  onClick={(event) => {
                    (settings.readingDirection === "rtl"
                      ? previousPage
                      : nextPage)();
                    event.currentTarget.blur();
                  }}
                  className="absolute right-0 top-0 h-full w-1/3 cursor-e-resize bg-transparent outline-none"
                />
              </>
            )}
          </div>
        )}
      </div>
      </div>
      <ReaderSettingsSheet
        open={showSettings}
        onOpenChange={setShowSettings}
        compact={compact}
      />
      <ReaderNavigationSheet
        open={showNavigator}
        onOpenChange={setShowNavigator}
        page={pageIndex}
        total={total}
        onPage={jumpToPage}
        settings={settings}
        updateSetting={updateSetting}
      >
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={chapterSearch}
            onChange={(event) => setChapterSearch(event.target.value)}
            aria-label="Search chapters"
            placeholder="Search chapters"
            className="h-11 w-full rounded-xl border border-border bg-muted/50 pl-10 pr-3 text-sm"
          />
        </label>
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {uiI18n.t("app.provider_7ceee3f3")}
          </h3>
          <div className="rounded-xl border border-primary/50 bg-primary/10 px-4 py-3 text-sm font-medium">
            {sourceName}
            <span className="mt-1 block text-xs text-muted-foreground">
              {namespace}
            </span>
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {uiI18n.t("app.chapter_46b00590")}
          </h3>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            {filtered
              .slice(chapterPage * 60, (chapterPage + 1) * 60)
              .map((entry) => (
                <button
                  key={entry.id}
                  aria-current={entry.id === chapterId ? "true" : undefined}
                  onClick={() => {
                    setShowNavigator(false);
                    props.onChapter(entry.id);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                    entry.id === chapterId
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/60"
                  )}
                >
                  <span className="truncate">{entry.label}</span>
                </button>
              ))}
            {!filtered.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No chapters match.
              </p>
            )}
          </div>
          {filtered.length > 60 && (
            <div className="mt-3 flex items-center justify-between">
              <Button
                variant="outline"
                disabled={!chapterPage}
                onClick={() => setChapterPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {chapterPage + 1} / {Math.ceil(filtered.length / 60)}
              </span>
              <Button
                variant="outline"
                disabled={(chapterPage + 1) * 60 >= filtered.length}
                onClick={() => setChapterPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </section>
      </ReaderNavigationSheet>
      {props.comments && (
        <Sheet open={showComments} onOpenChange={setShowComments}>
          <SheetContent
            side="right"
            className="flex w-full flex-col overflow-y-auto p-4 sm:max-w-lg"
          >
            <SheetHeader>
              <SheetTitle>{uiI18n.t("app.comments_fce06e20")}</SheetTitle>
            </SheetHeader>
            {props.comments}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
