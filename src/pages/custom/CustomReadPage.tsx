import { useReaderResume } from "@/pages/manga/hooks/useReaderResume";
import { useUiTranslation } from "@/hooks/ui/useUiTranslation";
/**
 * Custom-source read page (`kind: 'read'`).
 *
 * Source identity and local progress stay separate from verified catalogue lists. It fetches `CustomReadPage[]` from the extension's
 * custom source and renders them through the shared `ReaderImage` strip (the same
 * blob/proxy component the manga reader uses), reusing `useReaderSettings` for
 * width/gap/mode so a user's reader prefs carry over. Prev/next chapter navigation
 * is derived from the source's own info entries.
 */

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useReaderSettings } from "@/hooks/media/useReaderSettings";
import {
  useCustomRead,
  useCustomInfo,
  useCustomSource,
} from "@/hooks/api/useCustomSource";
import { useExtensionTitleProgress } from "@/hooks/media/useExtensionLibrary";
import {
  extensionChapterKey,
  extensionDownloadIdentity,
} from "@/core/extensions/compatibility/downloads";
import { updateExtensionLibrary } from "@/core/extensions/compatibility/library";
import { useMangaDownload } from "@/hooks/media/useMangaDownload";
import { TranslateChapterButton } from "@/components/translate/TranslateChapterButton";
import { useCustomCatalog } from "@/hooks/media/useCustomCatalog";
import { useCustomTracker } from "@/hooks/media/useCustomTracker";
import { isCompatibilityNamespace } from "@/core/extensions/compatibility/client";
import {
  customSourceBase,
  orderedCustomEntries,
} from "@/core/content/custom-source-model";
import { CustomReaderView } from "@/components/reader/CustomReaderView";
import { CustomCatalogComments } from "@/components/extensions/CustomCatalogPanel";
import { catalogCommentTarget } from "@/core/content/custom-catalog";

export default function CustomReadPage() {
  useUiTranslation();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { namespace, sourceId, id, chapterId } = useParams<{
    namespace: string;
    sourceId: string;
    id: string;
    chapterId: string;
  }>();
  const { source } = useCustomSource(namespace, sourceId);
  const { data: info } = useCustomInfo(namespace, sourceId, id);
  const { data, isLoading, isError, error, refetch, isFetching } =
    useCustomRead(namespace, sourceId, id, chapterId);
  const { settings } = useReaderSettings();

  const pages = data?.pages ?? [];
  const total = pages.length;
  const [pageIndex, setPageIndex] = useState(0);
  const pageContainer = useRef<HTMLDivElement>(null);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const restored = useRef("");
  const restoredPage = useRef<number | null>(null);
  const chapterIdentity = JSON.stringify([namespace, sourceId, id, chapterId]);
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [translationChapter, setTranslationChapter] = useState<{
    anilistId: number;
    chapterKey: string;
  } | null>(null);
  const { enqueueChapter, isEnabled: downloadsEnabled } = useMangaDownload();

  // Reset to first page whenever the chapter changes.
  useEffect(() => setPageIndex(0), [chapterIdentity]);

  const entries = useMemo(
    () => orderedCustomEntries(info?.entries ?? []),
    [info?.entries]
  );
  const currentIdx = entries.findIndex((e) => e.id === chapterId);
  const prev = currentIdx > 0 ? entries[currentIdx - 1] : null;
  const next =
    currentIdx >= 0 && currentIdx < entries.length - 1
      ? entries[currentIdx + 1]
      : null;
  const currentLabel = currentIdx >= 0 ? entries[currentIdx].label : chapterId;
  const libraryTitle =
    info && namespace && sourceId && id
      ? {
          namespace,
          sourceId,
          id,
          kind: "read" as const,
          title: info.title,
          image: info.image,
          sourceName: source?.name,
          catalog: entries,
        }
      : undefined;
  useEffect(() => {
    setTranslationChapter(null);
    if (
      !window.electron?.translate ||
      namespace !== "compat-mihon" ||
      !libraryTitle ||
      !sourceId ||
      !chapterId
    )
      return;
    let disposed = false;
    Promise.all([
      extensionDownloadIdentity(libraryTitle),
      extensionChapterKey(sourceId, chapterId),
    ])
      .then(([anilistId, chapterKey]) => {
        if (!disposed) setTranslationChapter({ anilistId, chapterKey });
      })
      .catch((error) => {
        if (!disposed)
          setDownloadError(
            error instanceof Error
              ? error.message
              : "Could not identify this chapter"
          );
      });
    return () => {
      disposed = true;
    };
  }, [namespace, sourceId, id, chapterId, info?.title]);
  const progress = useExtensionTitleProgress(
    libraryTitle,
    chapterId,
    currentLabel
  );
  const catalog = useCustomCatalog(source, id, info);
  const tracker = useCustomTracker(catalog, entries, progress.row);
  const lastPage = useRef(
    new Map<string, { position: number; total: number }>()
  );
  if (chapterId && total && restored.current === chapterIdentity)
    lastPage.current.set(chapterIdentity, { position: pageIndex, total });
  useEffect(
    () => () => {
      const page = chapterId
        ? lastPage.current.get(chapterIdentity)
        : undefined;
      if (page)
        progress.save(
          page.position,
          page.total,
          page.position === page.total - 1,
          true
        );
    },
    [chapterIdentity, progress.save]
  );
  const restorePage = useCallback(
    (index: number) => {
      restored.current = chapterIdentity;
      restoredPage.current = index;
      setPageIndex(index);
    },
    [chapterIdentity]
  );
  const restoring = useReaderResume({
    rootRef: scrollContainer,
    identity: chapterIdentity,
    page: progress.initialPosition,
    currentPage: pageIndex,
    total: progress.ready ? total : 0,
    vertical: settings.readingMode === "vertical",
    onPage: restorePage,
    pageSelector: "[data-extension-page]",
  });
  useEffect(() => {
    if (settings.readingMode !== "vertical" || !total) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (restoring.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const index = Number(
          (visible[0]?.target as HTMLElement | undefined)?.dataset.extensionPage
        );
        if (Number.isFinite(index)) setPageIndex(index);
      },
      {
        root: scrollContainer.current,
        rootMargin: "-10% 0px -55% 0px",
        threshold: 0,
      }
    );
    pageContainer.current
      ?.querySelectorAll("[data-extension-page]")
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [chapterIdentity, total, settings.readingMode, restoring]);
  useEffect(() => {
    if (restoredPage.current !== null) {
      if (pageIndex !== restoredPage.current) return;
      restoredPage.current = null;
    }
    if (total && restored.current === chapterIdentity)
      progress.save(pageIndex, total, pageIndex === total - 1);
  }, [pageIndex, total, chapterIdentity, progress.save]);
  async function downloadChapter() {
    if (!libraryTitle || !chapterId || !sourceId) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const anilistId = await extensionDownloadIdentity(libraryTitle);
      await updateExtensionLibrary(progress.profile, libraryTitle, {
        saved: true,
      });
      const result = await enqueueChapter(
        { anilistId, title: libraryTitle.title, posterUrl: libraryTitle.image },
        {
          chapterKey: await extensionChapterKey(sourceId, chapterId),
          provider: sourceId,
          providerChapterId: chapterId,
          chapterNumber: entries[currentIdx]?.number,
        }
      );
      if (!result.ok)
        setDownloadError(
          "reason" in result
            ? String(result.reason)
            : "Could not start chapter download"
        );
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Could not download chapter"
      );
    } finally {
      setDownloading(false);
    }
  }

  const base = customSourceBase({
    namespace: namespace || "",
    id: sourceId || "",
  });
  const goEntry = (entryId: string) =>
    navigate(
      `${base}/read/${encodeURIComponent(id || "")}/${encodeURIComponent(
        entryId
      )}`
    );

  return (
    <CustomReaderView
      title={info?.title || source?.name || t("animeDetail.read")}
      chapterLabel={currentLabel || ""}
      sourceName={source?.name || ""}
      namespace={namespace || ""}
      pages={pages}
      pageIndex={pageIndex}
      onPage={setPageIndex}
      pageContainer={pageContainer}
      scrollContainer={scrollContainer}
      entries={entries}
      chapterId={chapterId || ""}
      onChapter={goEntry}
      prev={prev?.id}
      next={next?.id}
      onBack={() => navigate(`${base}/info/${encodeURIComponent(id || "")}`)}
      onHome={() => navigate(base)}
      loading={isLoading}
      fetching={isFetching}
      failed={isError}
      error={error?.message}
      onReload={() => void refetch()}
      actionError={tracker.error || downloadError}
      onRetrySync={tracker.error ? tracker.retry : undefined}
      download={
        downloadsEnabled && namespace && isCompatibilityNamespace(namespace)
          ? () => {
              if (!downloading) void downloadChapter();
            }
          : undefined
      }
      downloading={downloading}
      translation={
        translationChapter && (
          <TranslateChapterButton
            {...translationChapter}
            title={info?.title || "Manga"}
            chapterLabel={currentLabel}
            provider={sourceId}
            providerChapterId={chapterId}
            chapterNumber={entries[currentIdx]?.number}
          />
        )
      }
      comments={
        catalogCommentTarget(source, catalog.identity, catalog.link) ? (
          <CustomCatalogComments catalog={catalog} source={source} />
        ) : undefined
      }
    />
  );
}
