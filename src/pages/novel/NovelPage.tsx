import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { SourceDebug } from '@/components/extensions/SourceDebug';
import { ExtensionRequired } from '@/components/extensions/ExtensionRequired';
/**
 * NovelPage.tsx
 * Novel information and chapter listing page — mirrors MangaPage's design.
 * Orchestrates data from multiple sources:
 * 1. TatakaiAPI (Main detail & metadata, NOVEL format)
 * 2. AniList (Banner, chapters/volumes count)
 * 3. Jikan/MAL (Serialization, HQ images)
 * 4. User Novel library (Progress tracking, format = 'novel')
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { resolveApiV3Base } from "@/lib/api/backendOrigin";
import { Button } from "@/components/ui/button";
import { useNovelDetail, useNovelChapters } from "@/hooks/api/useNovelData";
import { useAniListRecommendations } from "@/hooks/api/useAniListRecommendations";
import { useNovelRecommendationEngine } from "@/hooks/api/useNovelRecommendationEngine";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { Comments } from "@/components/comments/Comments";
import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";
import { getProxiedImageUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { searchNovels } from "@/core/content/novel-client";
import { inferMangaAdultFlag } from "@/lib/contentSafety";
import { AdultWarningGate } from "@/components/content/AdultWarningGate";
import type { NovelSearchItem, NovelChapterSource } from "@/types/novel";
import {
  ArrowLeft,
  BookOpen,
  Star,
  Sparkles,
  Layers,
  Users,
  BookmarkPlus,
  BookmarkCheck,
  Loader2,
  Search,
  Palette,
  GitGraph,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Tag,
  Pencil,
  Database,
  CheckCircle2,
  Download,
} from "lucide-react";
import type { MediaRelation } from "@/core/content/types";
import { ContentEditSheet, type EditableColumns } from "@/components/admin/ContentEditSheet";
import { useMangaBakaSeries } from "@/hooks/api/useMangaData";

// --- Helper Component: Relation Tree ---
function RelationTree({ relations }: { relations: MediaRelation[] }) {
  useUiTranslation();
  const navigate = useNavigate();
  void navigate;
  const scrollRef = useRef<HTMLDivElement>(null);

  if (relations.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: direction === 'left' ? -420 : 420, behavior: 'smooth' });
  };

  return (
    <div className="relative group/rail">
      <button
        type="button"
        onClick={() => scroll('left')}
        aria-label={uiI18n.t('app.scroll_series_tree_left_b8db9779')}
        className="absolute -left-3 top-[38%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 hover:bg-black text-white border border-white/10 hidden md:flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-all shadow-xl backdrop-blur-md"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-smooth">
      {relations.map((rel) => {
        const isNovel = rel.format?.toUpperCase().includes('NOVEL');
        const isManga = rel.format?.toUpperCase().includes('MANGA') || rel.format?.toUpperCase().includes('ONE_SHOT');

        return (
          <div key={rel.id} className="w-[160px] md:w-[200px] flex-shrink-0 flex flex-col">
            <UnifiedMediaCard
              item={{
                id: String(rel.id),
                name: rel.titleEnglish || rel.titleRomaji || "Untitled",
                poster: rel.coverImage || "",
                type: rel.relationType,
                status: rel.format || undefined,
                mediaType: isManga ? 'manga' : 'novel',
                href: isNovel ? `/novel/${rel.id}` : undefined
              }}
              className="flex-1"
            />
          </div>
        );
      })}
      </div>

      <button
        type="button"
        onClick={() => scroll('right')}
        aria-label={uiI18n.t('app.scroll_series_tree_right_37e703d6')}
        className="absolute -right-3 top-[38%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 hover:bg-black text-white border border-white/10 hidden md:flex items-center justify-center opacity-0 group-hover/rail:opacity-100 transition-all shadow-xl backdrop-blur-md"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

import { Helmet } from "react-helmet-async";
import { useIsNativeApp, useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { setViewingNovelRpc, clearDiscordRpc } from '@/lib/discordRpc';
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { useAuth } from "@/contexts/AuthContext";
import {
  useNovelReadlistItem,
  useRemoveFromNovelReadlist,
  useUpsertNovelReadlist,
  type NovelReadlistStatus,
} from "@/hooks/user/useNovelReadlist";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NovelChapterProviderRows } from "@/components/novel/NovelChapterProviderRows";
import { NovelDownloadModal } from "@/components/novel/NovelDownloadModal";
import { NovelDiagnostics } from "@/components/novel/NovelDiagnostics";

const getChapterSortValue = (chapter: any) => {
  if (typeof chapter?.chapterNumber === "number" && Number.isFinite(chapter.chapterNumber)) {
    return chapter.chapterNumber;
  }
  if (typeof chapter?.canonicalOrder === "number" && Number.isFinite(chapter.canonicalOrder)) {
    return chapter.canonicalOrder;
  }
  return Number.MAX_SAFE_INTEGER;
};

const getChapterDisplayNumber = (chapter: any): number | null => {
  if (typeof chapter?.chapterNumber === "number" && Number.isFinite(chapter.chapterNumber)) {
    return chapter.chapterNumber;
  }
  if (typeof chapter?.canonicalOrder === "number" && Number.isFinite(chapter.canonicalOrder)) {
    return chapter.canonicalOrder;
  }
  return null;
};

const toRecommendationCard = (item: NovelSearchItem): UnifiedMediaCardProps["item"] | null => {
  const title = item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native;
  const id = item.anilistId || item.malId || item.id;
  if (!title || !id) return null;

  return {
    id: String(id),
    name: title,
    poster: item.poster || "",
    type: "novel",
    status: item.status || undefined,
    rating:
      typeof item.score === "number" && Number.isFinite(item.score)
        ? (item.score / 10).toFixed(1)
        : undefined,
    chapters: typeof item.chapters === "number" && item.chapters > 0 ? item.chapters : undefined,
    anilistId: typeof item.anilistId === "number" ? item.anilistId : undefined,
    malId: typeof item.malId === "number" ? item.malId : undefined,
    isAdult: inferMangaAdultFlag(item as any),
    mediaType: "novel",
  };
};

type ChapterSortMode = "newest" | "oldest";
const CHAPTERS_PER_GROUP = 25;

export default function NovelPage() {
  useUiTranslation();
  const { novelId } = useParams<{ novelId: string }>();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isMobileViewport = useIsMobile();
  const { user, profile, isAdmin } = useAuth();
  void profile;
  const { settings: contentSafetySettings, updateSettings: updateContentSafetySettings } = useContentSafetySettings();
  const [allowAdultForSession, setAllowAdultForSession] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [showNovelDownload, setShowNovelDownload] = useState(false);

  const { data: novelData, isLoading: loadingInfo, error } = useNovelDetail(novelId);
  const novelSearchTitle = novelData?.detail?.title?.english || novelData?.detail?.title?.romaji || novelData?.detail?.canonicalTitle;
  const [fullScanForNovel, setFullScanForNovel] = useState<string | null>(null);
  const { data: chapterData, isLoading: loadingChapters, isFetching: checkingChapters, refetch: recheckChapters } = useNovelChapters(novelId, novelSearchTitle, fullScanForNovel === novelId);
  const { data: mangaBakaData } = useMangaBakaSeries((novelData as any)?.detail?.anilistId);
  const { data: anilistNovelMeta } = useQuery({
    queryKey: ['novel-anilist-tags', (novelData as any)?.detail?.anilistId],
    queryFn: async () => {
      const id = (novelData as any)?.detail?.anilistId;
      if (!id) return null;
      const response = await fetch(`${resolveApiV3Base()}/manga/by-anilist/${id}`);
      if (!response.ok) return null;
      const payload = await response.json();
      return payload?.data ?? null;
    },
    enabled: Boolean((novelData as any)?.detail?.anilistId),
    staleTime: 10 * 60 * 1000,
  });

  const { data: directAniListNovelTags = [] } = useQuery({
    queryKey: ['novel-tags-direct', (novelData as any)?.detail?.anilistId],
    // Tags come from the server-proxied `by-anilist` query (anilistNovelMeta),
    // which is cached and CORS-safe.
    queryFn: async () => (anilistNovelMeta?.tags ?? []) as Array<{
      id: number;
      name: string;
      category?: string;
      rank?: number;
      isMediaSpoiler?: boolean;
      isGeneralSpoiler?: boolean;
    }>,
    enabled: Boolean((novelData as any)?.detail?.anilistId),
    staleTime: 60 * 60 * 1000,
  });

  const combinedNovelTags = useMemo(() => {
    // 1. Direct AniList tags or anilistNovelMeta tags
    const aniList = directAniListNovelTags.length > 0 ? directAniListNovelTags : ((anilistNovelMeta?.tags || []) as any[]);
    const validAniList = aniList
      .filter((t: any) => !t.isMediaSpoiler && !t.isGeneralSpoiler)
      .map((t: any) => ({
        id: t.id || t.name,
        name: t.name,
        source: 'anilist' as const,
        rank: t.rank,
        weight: t.rank && t.rank >= 80 ? 'defining' : t.rank && t.rank >= 60 ? 'core' : 'normal',
      }));

    if (validAniList.length > 0) return validAniList;

    // 2. MangaBaka tags fallback
    return ((mangaBakaData as any)?.tags || [])
      .filter((t: any) => !t.isSpoiler)
      .map((t: any) => ({
        id: t.id ?? t.name,
        name: t.name,
        source: 'mangabaka' as const,
        rank: t.weight === 'defining' ? 90 : t.weight === 'core' ? 70 : undefined,
        weight: t.weight,
      }));
  }, [directAniListNovelTags, anilistNovelMeta?.tags, mangaBakaData]);

  const { data: readlistEntry } = useNovelReadlistItem(novelId);
  const addToReadlist = useUpsertNovelReadlist();
  const removeFromReadlist = useRemoveFromNovelReadlist();
  const rawCoverImage = (novelData as any)?.detail?.coverImage || "";
  const [coverImageSrc, setCoverImageSrc] = useState<string>(() => getProxiedImageUrl(rawCoverImage));
  const [coverFallbackTried, setCoverFallbackTried] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [anilistMetadata, setAnilistMetadata] = useState<{ chapters?: number; volumes?: number } | null>(null);

  const malId = (novelData as any)?.detail?.malId;
  const { data: jikanData } = useQuery({
    queryKey: ["jikan-novel", malId],
    queryFn: async () => {
      if (!malId) return null;
      const res = await fetch(`${resolveApiV3Base()}/manga/mal/${malId}/full`);
      if (!res.ok) return null;
      const json = await res.json();
      return json?.data ?? null;
    },
    enabled: !!malId,
    staleTime: 24 * 60 * 60 * 1000,
  });

  useEffect(() => {
    setCoverFallbackTried(false);
    setCoverImageSrc(getProxiedImageUrl(rawCoverImage));
  }, [rawCoverImage]);

  // Discord RPC — show "Viewing <title>" while on this page.
  useEffect(() => {
    if (!isNative) return;
    const detail = (novelData as any)?.detail;
    if (!detail) return;
    const title =
      detail.canonicalTitle || detail.title?.english || detail.title?.romaji || '';
    if (!title) return;
    setViewingNovelRpc({
      novelTitle: title,
      novelImageUrl: detail.coverImage ?? null,
      novelUrl: `https://tatakai.me/novel/${novelId}`,
    });
    return () => {
      clearDiscordRpc();
    };
  }, [isNative, (novelData as any)?.detail, novelId]);

  // Banner + chapter/volume counts come from the server-proxied `by-anilist` query.
  useEffect(() => {
    if (!anilistNovelMeta) return;
    if (anilistNovelMeta.bannerImage) {
      setBannerUrl(getProxiedImageUrl(anilistNovelMeta.bannerImage));
    }
    setAnilistMetadata({
      chapters: anilistNovelMeta.chapters,
      volumes: anilistNovelMeta.volumes,
    });
  }, [anilistNovelMeta]);

  const chapters = useMemo(() => {
    const list = chapterData?.mappedChapters ?? [];
    return [...list].sort((a, b) => a.canonicalOrder - b.canonicalOrder);
  }, [chapterData]);
  const isChapterListLoading = loadingChapters && !chapterData;
  const [preferredProvider, setPreferredProvider] = useState<string>("auto");
  const [chapterSortMode, setChapterSortMode] = useState<ChapterSortMode>("oldest");
  const [chapterSearchTerm, setChapterSearchTerm] = useState("");
  const [selectedChapterGroup, setSelectedChapterGroup] = useState(0);
  const [selectedVolumeFilter, setSelectedVolumeFilter] = useState<number | null>(null);

  const providerOptions = useMemo(() => {
    const providers = new Set<string>();
    chapters.forEach((chapter) => {
      chapter.sources?.forEach((source) => {
        if (source.provider) providers.add(source.provider);
      });
    });
    return Array.from(providers).sort((a, b) => a.localeCompare(b));
  }, [chapters]);

  const sortedChapters = useMemo(() => {
    const scoreSource = (source: any) => {
      let score = 0;
      if (preferredProvider !== "auto" && source?.provider === preferredProvider) score += 100;
      return score;
    };

    return [...chapters]
      .map((chapter) => ({
        ...chapter,
        sources: [...(chapter.sources || [])].sort((left, right) => {
          const scoreDiff = scoreSource(right) - scoreSource(left);
          if (scoreDiff !== 0) return scoreDiff;
          return String(left.provider || "").localeCompare(String(right.provider || ""));
        }),
      }))
      .sort((left, right) => {
        const chapterDiff = getChapterSortValue(left) - getChapterSortValue(right);
        if (chapterDiff !== 0) return chapterDiff;
        return (left.canonicalOrder ?? Number.MAX_SAFE_INTEGER) - (right.canonicalOrder ?? Number.MAX_SAFE_INTEGER);
      });
  }, [chapters, preferredProvider]);

  const visibleChapters = useMemo(() => {
    return sortedChapters.filter((chapter) =>
      chapter.sources?.some((source) => {
        const providerMatch = preferredProvider === "auto" || source.provider === preferredProvider;
        return providerMatch;
      }),
    );
  }, [sortedChapters, preferredProvider]);

  const displayChapters = useMemo(() => {
    if (chapterSortMode === "oldest") return visibleChapters;
    return [...visibleChapters].reverse();
  }, [visibleChapters, chapterSortMode]);

  const volumeScopedDisplayChapters = useMemo(() => {
    if (selectedVolumeFilter == null) return displayChapters;

    const scoped = sortedChapters.filter((chapter) => {
      const volumeValue = Number(chapter.volume);
      return Number.isFinite(volumeValue) && Math.trunc(volumeValue) === selectedVolumeFilter;
    });

    if (chapterSortMode === "oldest") return scoped;
    return [...scoped].reverse();
  }, [selectedVolumeFilter, displayChapters, sortedChapters, chapterSortMode]);

  const filteredDisplayChapters = useMemo(() => {
    const normalizedSearchTerm = chapterSearchTerm.trim().toLowerCase();

    return volumeScopedDisplayChapters.filter((chapter) => {
      if (!normalizedSearchTerm) return true;

      const chapterNumber = chapter.chapterNumber != null ? String(chapter.chapterNumber).toLowerCase() : "";
      const volumeNumber = chapter.volume != null ? String(chapter.volume).toLowerCase() : "";
      const chapterTitle = String(chapter.chapterTitle || "").toLowerCase();
      const sourceText = (chapter.sources || [])
        .map((source) => `${source.providerName || source.provider || ""} ${source.translator || ""}`.toLowerCase())
        .join(" ");

      return (
        chapterTitle.includes(normalizedSearchTerm) ||
        chapterNumber.includes(normalizedSearchTerm) ||
        `chapter ${chapterNumber}`.includes(normalizedSearchTerm) ||
        `ch ${chapterNumber}`.includes(normalizedSearchTerm) ||
        volumeNumber.includes(normalizedSearchTerm) ||
        `volume ${volumeNumber}`.includes(normalizedSearchTerm) ||
        `vol ${volumeNumber}`.includes(normalizedSearchTerm) ||
        sourceText.includes(normalizedSearchTerm)
      );
    });
  }, [volumeScopedDisplayChapters, chapterSearchTerm]);

  const chapterGroups = useMemo(() => {
    if (filteredDisplayChapters.length === 0) return [];
    if (filteredDisplayChapters.length <= CHAPTERS_PER_GROUP) return [filteredDisplayChapters];

    const groups: Array<typeof filteredDisplayChapters> = [];
    for (let index = 0; index < filteredDisplayChapters.length; index += CHAPTERS_PER_GROUP) {
      groups.push(filteredDisplayChapters.slice(index, index + CHAPTERS_PER_GROUP));
    }
    return groups;
  }, [filteredDisplayChapters]);

  const chapterGroupRanges = useMemo(() => {
    return chapterGroups.map((group, index) => {
      const numericValues = group
        .map((chapter) => getChapterDisplayNumber(chapter))
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      if (numericValues.length > 0) {
        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        return {
          start: chapterSortMode === "newest" ? max : min,
          end: chapterSortMode === "newest" ? min : max,
        };
      }

      const start = index * CHAPTERS_PER_GROUP + 1;
      const end = Math.min((index + 1) * CHAPTERS_PER_GROUP, filteredDisplayChapters.length);
      return {
        start: chapterSortMode === "newest" ? filteredDisplayChapters.length - start + 1 : start,
        end: chapterSortMode === "newest" ? filteredDisplayChapters.length - end + 1 : end,
      };
    });
  }, [chapterGroups, chapterSortMode, filteredDisplayChapters.length]);

  const activeChapterGroup = Math.min(selectedChapterGroup, Math.max(chapterGroups.length - 1, 0));
  const chapterCards = chapterGroups[activeChapterGroup] || [];
  const hasChapterGroups = chapterGroups.length > 1;
  const hasChapterFilters =
    preferredProvider !== "auto" ||
    selectedVolumeFilter != null ||
    chapterSearchTerm.trim().length > 0;

  const availableChapterKeys = useMemo(() => {
    const keys = new Set<string>();
    sortedChapters.forEach((chapter) => {
      chapter.sources?.forEach((source) => {
        if (source.chapterKey) keys.add(source.chapterKey);
      });
    });
    return keys;
  }, [sortedChapters]);

  const getBestSource = (chapter: (typeof sortedChapters)[number] | undefined) => {
    if (!chapter?.sources?.length) return null;

    const exactSource = chapter.sources.find((source) => {
      const providerMatch = preferredProvider === "auto" || source.provider === preferredProvider;
      return providerMatch;
    });
    if (exactSource) return exactSource;

    if (preferredProvider !== "auto") {
      const byProvider = chapter.sources.find((source) => source.provider === preferredProvider);
      if (byProvider) return byProvider;
    }

    return chapter.sources[0] || null;
  };

  // Build the reader URL from a source, threading everything the reader needs to
  // reach the extension runtime (`provider`, `providerChapterId`) and to show a
  // real chapter title instead of the raw `provider:key` string
  // (`chapterNumber`/`chapterTitle`).
  const buildReaderQuery = (opts: {
    chapterKey: string;
    provider?: string | null;
    providerChapterId?: string | null;
    chapterNumber?: number | null;
    chapterTitle?: string | null;
    paragraph?: number;
  }) => {
    const params = new URLSearchParams();
    params.set("chapterKey", opts.chapterKey);
    if (opts.provider) params.set("provider", opts.provider);
    if (opts.providerChapterId) params.set("providerChapterId", opts.providerChapterId);
    if (opts.chapterNumber != null && Number.isFinite(opts.chapterNumber))
      params.set("chapterNumber", String(opts.chapterNumber));
    if (opts.chapterTitle) params.set("chapterTitle", opts.chapterTitle);
    params.set("paragraph", String(Math.max(0, opts.paragraph ?? 0)));
    return params.toString();
  };

  // Navigate to the reader for a specific chapter+source, passing the chapter's
  // sources as router state (`sources`) for fallback.
  const goToReader = (
    chapter: { chapterNumber?: number | null; chapterTitle?: string | null; sources?: NovelChapterSource[] } | null | undefined,
    source: NovelChapterSource | null | undefined,
    paragraph = 0,
  ) => {
    if (!novelId || !source?.chapterKey) return;
    const query = buildReaderQuery({
      chapterKey: source.chapterKey,
      provider: source.provider,
      providerChapterId: source.providerChapterId,
      chapterNumber: chapter?.chapterNumber ?? null,
      chapterTitle: chapter?.chapterTitle ?? null,
      paragraph,
    });
    navigate(`/novel/read/${novelId}?${query}`, { state: { sources: chapter?.sources ?? [] } });
  };

  const volumeSections = useMemo(() => {
    const volumeMap = new Map<number, Array<(typeof sortedChapters)[number]>>();

    sortedChapters.forEach((chapter) => {
      const volumeNumber = Number(chapter.volume);
      if (!Number.isFinite(volumeNumber) || volumeNumber <= 0) return;

      const normalizedVolume = Math.trunc(volumeNumber);
      const existing = volumeMap.get(normalizedVolume) || [];
      existing.push(chapter);
      volumeMap.set(normalizedVolume, existing);
    });

    const pickSource = (chapter: (typeof sortedChapters)[number]) => {
      const sources = chapter.sources || [];
      if (sources.length === 0) return null;

      const exact = sources.find((source) => {
        const providerMatch = preferredProvider === "auto" || source.provider === preferredProvider;
        return providerMatch;
      });
      if (exact) return exact;

      if (preferredProvider !== "auto") {
        const byProvider = sources.find((source) => source.provider === preferredProvider);
        if (byProvider) return byProvider;
      }

      return sources[0] || null;
    };

    return Array.from(volumeMap.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([volume, chaptersInVolume]) => {
        const ordered = [...chaptersInVolume].sort((left, right) => {
          const chapterDiff = getChapterSortValue(left) - getChapterSortValue(right);
          if (chapterDiff !== 0) return chapterDiff;
          return (left.canonicalOrder ?? Number.MAX_SAFE_INTEGER) - (right.canonicalOrder ?? Number.MAX_SAFE_INTEGER);
        });

        const readable = ordered
          .map((chapter) => ({ chapter, source: pickSource(chapter) }))
          .filter((entry) => Boolean(entry.source?.chapterKey));

        const firstReadable = readable[0] || null;
        const latestReadable = readable.length > 0 ? readable[readable.length - 1] : null;

        const numericChapterValues = ordered
          .map((chapter) => chapter.chapterNumber)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

        const minChapter = numericChapterValues.length > 0 ? Math.min(...numericChapterValues) : null;
        const maxChapter = numericChapterValues.length > 0 ? Math.max(...numericChapterValues) : null;

        let rangeLabel = uiI18n.t('app.unknown_range_a8ec0c19');
        if (minChapter != null && maxChapter != null) {
          rangeLabel = minChapter === maxChapter ? `${minChapter}` : `${minChapter} - ${maxChapter}`;
        }

        return {
          volume,
          chapterCount: ordered.length,
          readableCount: readable.length,
          rangeLabel,
          firstChapterTitle:
            firstReadable?.chapter.chapterTitle ||
            (firstReadable?.chapter.chapterNumber != null ? `Chapter ${firstReadable.chapter.chapterNumber}` : ""),
          firstChapterKey: firstReadable?.source?.chapterKey || null,
          latestChapterKey: latestReadable?.source?.chapterKey || null,
          firstChapter: firstReadable?.chapter ?? null,
          firstSource: firstReadable?.source ?? null,
          latestChapter: latestReadable?.chapter ?? null,
          latestSource: latestReadable?.source ?? null,
          readableChapters: readable.map((entry) => ({
            chapterKey: entry.source?.chapterKey || "",
            chapterNumber: entry.chapter.chapterNumber,
            chapterTitle: entry.chapter.chapterTitle,
            chapter: entry.chapter,
            source: entry.source,
          })),
        };
      });
  }, [sortedChapters, preferredProvider]);

  // Desktop vs Mobile sidebar display
  const showSidebar = !isMobileViewport;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [novelId]);

  useEffect(() => {
    setAllowAdultForSession(false);
    setPreferredProvider("auto");
    setChapterSortMode("oldest");
    setChapterSearchTerm("");
    setSelectedChapterGroup(0);
    setSelectedVolumeFilter(null);
  }, [novelId]);

  useEffect(() => {
    if (preferredProvider === "auto") return;
    if (providerOptions.length === 0) return;
    if (!providerOptions.includes(preferredProvider)) {
      setPreferredProvider("auto");
    }
  }, [preferredProvider, providerOptions]);

  useEffect(() => {
    setSelectedChapterGroup(0);
  }, [chapterSortMode, preferredProvider, chapterSearchTerm, selectedVolumeFilter]);

  useEffect(() => {
    if (selectedVolumeFilter == null) return;
    if (volumeSections.some((volumeItem) => volumeItem.volume === selectedVolumeFilter)) return;
    setSelectedVolumeFilter(null);
  }, [selectedVolumeFilter, volumeSections]);

  const info = (novelData as any)?.detail;

  const displayTitle =
    info?.canonicalTitle ||
    info?.title?.english ||
    info?.title?.romaji ||
    info?.title?.native ||
    uiI18n.t('app.unknown_title_58dfae3c');

  const recommendationTerms = useMemo(() => {
    if (!info) return [];

    const genreTerms = isMobileViewport
      ? info.genres.slice(0, 1).map((genre: string) => `${genre} light novel`)
      : info.genres.slice(0, 3).map((genre: string) => `${genre} light novel`);

    const terms = [
      info.canonicalTitle,
      info.title?.english,
      info.title?.romaji,
      ...genreTerms,
    ];

    return Array.from(
      new Set(
        terms
          .map((term) => String(term || "").trim())
          .filter((term) => term.length > 0),
      ),
    ).slice(0, isMobileViewport ? 2 : 4);
  }, [info, isMobileViewport]);

  const { data: recommendationCards = [], isLoading: loadingRecommendations } = useQuery({
    queryKey: [
      "novel-detail-recommendations",
      novelId,
      recommendationTerms.join("|"),
      contentSafetySettings.showAdultEverywhere,
    ],
    queryFn: async () => {
      if (!info) return [];

      const batches = await Promise.all(
        recommendationTerms.map((term, index) =>
          searchNovels(term, 1, isMobileViewport ? 8 : (index === 0 ? 12 : 10)),
        ),
      );

      const seen = new Set<string>();
      const cards: UnifiedMediaCardProps["item"][] = [];

      for (const batch of batches) {
        const rows = Array.isArray(batch?.results) ? batch.results : [];
        for (const row of rows) {
          const card = toRecommendationCard(row);
          if (!card) continue;

          const sameAniList =
            typeof info.anilistId === "number" &&
            typeof card.anilistId === "number" &&
            card.anilistId === info.anilistId;
          const sameMal =
            typeof info.malId === "number" &&
            typeof card.malId === "number" &&
            card.malId === info.malId;
          const sameRouteId = String(card.id) === String(novelId);

          if (sameAniList || sameMal || sameRouteId) continue;
          if (card.isAdult && !contentSafetySettings.showAdultEverywhere) continue;

          const key = String(card.anilistId ?? card.malId ?? card.id);
          if (seen.has(key)) continue;

          seen.add(key);
          cards.push(card);

          if (cards.length >= 8) return cards;
        }
      }

      return cards;
    },
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(info) && recommendationTerms.length > 0,
  });

  // AniList's crowd-curated picks for this title (mirror-proxied, never direct).
  const includeAdultRecs = !!contentSafetySettings?.showAdultEverywhere;
  const { recommendations: anilistNovelRecs } = useAniListRecommendations(info?.anilistId, {
    mediaType: "MANGA",
    includeAdult: includeAdultRecs,
    limit: isMobileViewport ? 12 : 24,
  });
  // The app's own personalized novel engine (same source as the Recommendations page).
  const { recommendations: novelEngineRecs } = useNovelRecommendationEngine({ limit: isMobileViewport ? 12 : 24 });

  // Merge AniList (primary) + engine (personalized) + search (fallback), deduped
  // and with the current title removed.
  const mergedRecommendations = useMemo<UnifiedMediaCardProps["item"][]>(() => {
    const seen = new Set<string>();
    const out: UnifiedMediaCardProps["item"][] = [];
    const curAniList = typeof info?.anilistId === "number" ? info.anilistId : null;
    const curMal = typeof info?.malId === "number" ? info.malId : null;
    const curRoute = String(novelId || "");

    const push = (card: UnifiedMediaCardProps["item"] | null | undefined) => {
      if (!card) return;
      if (card.isAdult && !includeAdultRecs) return;
      if (curAniList != null && card.anilistId === curAniList) return;
      if (curMal != null && card.malId === curMal) return;
      if (String(card.id) === curRoute) return;
      const key = String(card.anilistId ?? card.malId ?? card.id);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(card);
    };

    for (const r of anilistNovelRecs) {
      push({
        id: String(r.anilistId),
        name: r.title,
        poster: r.poster,
        type: "novel",
        rating: r.averageScore ? (r.averageScore / 10).toFixed(1) : undefined,
        anilistId: r.anilistId,
        malId: r.malId ?? undefined,
        isAdult: r.isAdult,
        mediaType: "novel",
      });
    }

    for (const rec of novelEngineRecs) {
      const a = rec.anime;
      push({
        id: String(a.id),
        name: a.title,
        poster: a.poster ?? "",
        type: "novel",
        rating: a.averageScore ? (a.averageScore / 10).toFixed(1) : undefined,
        anilistId: a.anilistId ?? undefined,
        malId: a.malId ?? undefined,
        mediaType: "novel",
      });
    }

    for (const card of recommendationCards) push(card);

    return out.slice(0, isMobileViewport ? 10 : 16);
  }, [anilistNovelRecs, novelEngineRecs, recommendationCards, info?.anilistId, info?.malId, novelId, includeAdultRecs, isMobileViewport]);

  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {!isNative && <Background />}
        {showSidebar && <Sidebar />}
        <main className={cn("relative z-10 py-6 max-w-[1800px] mx-auto", isDesktopApp ? "p-6" : "pl-6 md:pl-32 pr-6")}>
          <div className="space-y-8">
            <Skeleton className="h-8 w-32" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Skeleton className="aspect-[2/3] rounded-3xl" />
              <div className="lg:col-span-2 space-y-4">
                <Skeleton className="h-12 w-3/4" />
                <Skeleton className="h-24 w-full" />
                <div className="flex gap-4">
                  <Skeleton className="h-14 w-40 rounded-full" />
                  <Skeleton className="h-14 w-14 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </main>
        <MobileNav />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center p-6">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">{uiI18n.t('app.novel_details_not_available_f0918058')}</h1>
          <p className="text-muted-foreground mb-4">{uiI18n.t('app.we_couldn_t_retrieve_the_information_for_this_no_bd8b587e')}</p>
          <button onClick={() => navigate("/novel")} className="px-6 py-2 bg-primary text-primary-foreground rounded-full hover:brightness-110 font-bold transition-all">
            {uiI18n.t('app.back_to_novels_dd3a5da4')}
          </button>
        </div>
      </div>
    );
  }

  const requiresAdultWarning =
    Boolean(info.adult) &&
    contentSafetySettings.warnBeforeAdultOpen &&
    !allowAdultForSession;

  if (requiresAdultWarning) {
    return (
      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        {!isNative && <Background />}
        {showSidebar && <Sidebar />}

        <main className={cn(
          "relative z-10 py-8 max-w-[980px] mx-auto pb-24",
          isDesktopApp ? "px-4" : "pl-6 md:pl-32 pr-6"
        )}>
          <AdultWarningGate
            title={info.canonicalTitle || info.title?.english || info.title?.romaji || uiI18n.t('app.unknown_bc7819b3')}
            mediaLabel="novel"
            onBack={() => navigate(-1)}
            onContinue={() => setAllowAdultForSession(true)}
            onAlwaysShow={() => {
              updateContentSafetySettings({
                showAdultEverywhere: true,
                warnBeforeAdultOpen: false,
              });
              setAllowAdultForSession(true);
            }}
          />
        </main>

        <MobileNav />
      </div>
    );
  }

  const hasSavedProgress =
    Boolean(readlistEntry?.last_chapter_key) &&
    availableChapterKeys.has(String(readlistEntry?.last_chapter_key || ""));
  const isInReadlist = Boolean(readlistEntry && readlistEntry.status !== "reading");

  const handleReadNow = () => {
    if (!novelId) return;

    if (hasSavedProgress && readlistEntry?.last_chapter_key) {
      const savedPara = Math.max(0, Number(readlistEntry.last_page_index || 0));
      const savedKey = String(readlistEntry.last_chapter_key);
      const savedChapter = sortedChapters.find((c) => c.sources?.some((s) => s.chapterKey === savedKey));
      const savedSource = savedChapter?.sources?.find((s) => s.chapterKey === savedKey);
      const query = buildReaderQuery({
        chapterKey: savedKey,
        provider: savedSource?.provider || readlistEntry.last_provider,
        providerChapterId: savedSource?.providerChapterId,
        chapterNumber: savedChapter?.chapterNumber ?? readlistEntry.last_chapter_number ?? null,
        chapterTitle: savedChapter?.chapterTitle ?? readlistEntry.last_chapter_title ?? null,
        paragraph: savedPara,
      });
      navigate(`/novel/read/${novelId}?${query}`, { state: { sources: savedChapter?.sources ?? [] } });
      return;
    }

    if (visibleChapters.length > 0 || sortedChapters.length > 0) {
      const firstReadableChapter = visibleChapters[0] || sortedChapters[0];
      goToReader(firstReadableChapter, getBestSource(firstReadableChapter), 0);
    }
  };

  const handleToggleReadlist = async () => {
    if (!novelId) return;
    if (!user) {
      navigate("/auth");
      return;
    }

    if (isInReadlist) {
      await removeFromReadlist.mutateAsync({ novelId });
      return;
    }

    await addToReadlist.mutateAsync({
      novelId,
      novelTitle: displayTitle,
      novelPoster: info.coverImage || null,
      malId: info.malId ?? null,
      anilistId: info.anilistId ?? null,
      status: "plan_to_read",
      lastChapterKey: readlistEntry?.last_chapter_key || null,
      lastChapterNumber: readlistEntry?.last_chapter_number ?? null,
      lastChapterTitle: readlistEntry?.last_chapter_title || null,
      lastProvider: readlistEntry?.last_provider || null,
      lastParagraphIndex: Number(readlistEntry?.last_page_index || 0),
      totalParagraphs: readlistEntry?.total_pages ?? null,
    });
  };

  // Set an explicit readlist status, keeping any existing reading progress intact.
  const handleSetReadlistStatus = async (status: NovelReadlistStatus) => {
    if (!novelId) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    await addToReadlist.mutateAsync({
      novelId,
      novelTitle: displayTitle,
      novelPoster: info.coverImage || null,
      malId: info.malId ?? null,
      anilistId: info.anilistId ?? null,
      status,
      lastChapterKey: readlistEntry?.last_chapter_key || null,
      lastChapterNumber: readlistEntry?.last_chapter_number ?? null,
      lastChapterTitle: readlistEntry?.last_chapter_title || null,
      lastProvider: readlistEntry?.last_provider || null,
      lastParagraphIndex: Number(readlistEntry?.last_page_index || 0),
      totalParagraphs: readlistEntry?.total_pages ?? null,
    });
  };

  const handleRemoveReadlist = async () => {
    if (novelId) await removeFromReadlist.mutateAsync({ novelId });
  };

  const READLIST_STATUS_OPTIONS: { value: NovelReadlistStatus; label: string }[] = [
    { value: "plan_to_read", get label() { return uiI18n.t('app.plan_to_read_1f74de73'); } },
    { value: "reading", get label() { return uiI18n.t('app.reading_cffa2af0'); } },
    { value: "completed", get label() { return uiI18n.t('app.completed_1798b3ba'); } },
    { value: "on_hold", get label() { return uiI18n.t('app.on_hold_73fd29ee'); } },
    { value: "dropped", get label() { return uiI18n.t('app.dropped_8cf622d3'); } },
  ];
  const currentReadlistStatus = readlistEntry?.status as NovelReadlistStatus | undefined;
  const currentReadlistLabel = READLIST_STATUS_OPTIONS.find((o) => o.value === currentReadlistStatus)?.label;

  const displayRating =
    typeof info.score === "number" && Number.isFinite(info.score)
      ? (info.score / 10).toFixed(1)
      : null;

  return (
    <>
      <Helmet>
        <title>{displayTitle} {uiI18n.t('app.novel_on_tatakai_ddbaaaa3')}</title>
        <meta name="description" content={info.synopsis?.slice(0, 160) || `Track ${displayTitle}, rate it, and add it to your lists on Tatakai.`} />
        <meta property="og:title" content={`${displayTitle} — Novel on Tatakai`} />
        <meta property="og:description" content={info.synopsis?.slice(0, 160) || `Track and discuss ${displayTitle} on Tatakai — the otaku community.`} />
        <meta property="og:image" content={info.coverImage || ""} />
        <meta property="og:type" content="book" />
        <meta property="og:url" content={`https://tatakai.me/novel/${novelId}`} />
        <meta property="og:site_name" content="Tatakai" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${displayTitle} — Novel on Tatakai`} />
        <meta name="twitter:description" content={info.synopsis?.slice(0, 160) || `Track and discuss ${displayTitle} on Tatakai.`} />
        {info.coverImage ? <meta name="twitter:image" content={info.coverImage} /> : null}
        <link rel="canonical" href={`https://tatakai.me/novel/${novelId}`} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Book",
            name: displayTitle,
            url: `https://tatakai.me/novel/${novelId}`,
            ...(info.synopsis ? { description: info.synopsis.slice(0, 5000) } : {}),
            ...(info.coverImage ? { image: info.coverImage } : {}),
            isPartOf: { "@type": "WebSite", name: "Tatakai", url: "https://tatakai.me" },
          })}
        </script>
      </Helmet>

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/30">
        {!isNative && <Background />}
        {showSidebar && <Sidebar />}

        <main className={cn(
          "relative z-10 py-6 max-w-[1800px] mx-auto pb-24 lg:pb-6",
          isDesktopApp ? "px-4 pt-4" : "pl-6 md:pl-32 pr-6 pt-10"
        )}>
          {/* Banner Image Background */}
          {bannerUrl && (
            <div className="absolute top-0 left-0 w-full h-[50vh] xl:h-[60vh] -z-10 overflow-hidden opacity-30 md:opacity-40">
              <img
                src={bannerUrl}
                alt={uiI18n.t('app.banner_c8af83fb')}
                className="w-full h-full object-cover blur-[12px] brightness-[0.6] transform scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/60 to-background" />
            </div>
          )}

          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 group w-fit"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium text-sm">{uiI18n.t('app.back_b52b36b7')}</span>
          </button>

          {/* Hero Section — AnimePage-aligned GlassPanel layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16 pt-4 md:pt-8">
            <GlassPanel className="overflow-hidden mx-auto lg:mx-0 w-full max-w-[320px] lg:max-w-none">
              <img
                src={coverImageSrc}
                alt={displayTitle}
                className="w-full aspect-[2/3] object-cover"
                onError={() => {
                  if (rawCoverImage && !coverFallbackTried && coverImageSrc !== rawCoverImage) {
                    setCoverFallbackTried(true);
                    setCoverImageSrc(rawCoverImage);
                    return;
                  }
                  if (coverImageSrc !== "/placeholder.svg") {
                    setCoverImageSrc("/placeholder.svg");
                  }
                }}
              />
            </GlassPanel>

            <div className="lg:col-span-2 space-y-6">
              <div>
                <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">{displayTitle}</h1>

                {/* Provenance badge (all visitors) + admin edit button */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {info.inDb ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {uiI18n.t('app.in_tatakai_db_41c5d242')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                      <Database className="w-3.5 h-3.5" />
                      {uiI18n.t('app.not_in_db_yet_f43185d4')}
                    </span>
                  )}
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => setEditOpen(true)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      {uiI18n.t('app.edit_content_0eea86f9')}
                    </Button>
                  )}
                </div>

                {isAdmin && (
                  <ContentEditSheet                    open={editOpen}
                    onOpenChange={setEditOpen}
                    mediaType="manga"
                    title={displayTitle}
                    id={
                      (info.anilistId ? String(info.anilistId) : "") ||
                      info.tatakaiId ||
                      novelId ||
                      ""
                    }
                    initial={{
                      title_romaji: info.title?.romaji ?? "",
                      title_english: info.title?.english ?? "",
                      title_native: info.title?.native ?? "",
                      description: info.synopsis ?? "",
                      cover_image_large: info.coverImage ?? "",
                      cover_image_medium: info.coverImageMedium ?? "",
                      banner_image: info.bannerImage ?? "",
                      trailer_url: info.trailerUrl ?? "",
                      format: info.format ?? "NOVEL",
                      status: info.status ?? "",
                      country_of_origin: info.origin ?? "",
                      rating: info.rating ?? "",
                      chapters: info.totalChapters ?? "",
                      volumes: info.totalVolumes ?? "",
                      average_score: info.score ?? "",
                      mean_score: info.meanScore ?? "",
                      popularity: info.popularity ?? "",
                      favourites: info.favourites ?? "",
                      genres: (info.genres ?? []).join(", "),
                    } satisfies Partial<EditableColumns>}
                  />
                )}

                <NovelDownloadModal
                  isOpen={showNovelDownload}
                  onClose={() => setShowNovelDownload(false)}
                  novelId={String(novelId || "")}
                  chapters={chapters}
                  anilistId={Number(info.anilistId) || 0}
                  title={displayTitle}
                  posterUrl={coverImageSrc}
                  preferredProvider={preferredProvider}
                />

                <div className="flex flex-wrap gap-3 mb-6">
                  {displayRating && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber/20 text-amber">
                      <Star className="w-4 h-4 fill-amber" />
                      <span className="font-bold">{displayRating}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                    <BookOpen className="w-4 h-4" />
                    <span className="capitalize">{uiI18n.t('app.novel_1a9fdb91')}</span>
                  </div>
                  {info.status && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/20 text-primary">
                      <span className="font-semibold capitalize">
                        {String(info.status).toLowerCase().replace(/_/g, " ")}
                      </span>
                    </div>
                  )}
                  {typeof info.totalChapters === "number" && info.totalChapters > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                      <Layers className="w-4 h-4" />
                      <span>{info.totalChapters} {uiI18n.t('app.chapters_034e2733')}</span>
                    </div>
                  )}
                  {typeof info.totalVolumes === "number" && info.totalVolumes > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                      <BookOpen className="w-4 h-4" />
                      <span>{info.totalVolumes} {uiI18n.t('app.volumes_39c0ee03')}</span>
                    </div>
                  )}
                </div>

                {info.authors && info.authors.length > 0 && (
                  <p className="text-muted-foreground text-sm md:text-base font-medium flex flex-wrap items-center gap-2 mb-4">
                    <Users className="w-4 h-4 shrink-0" />
                    {uiI18n.t('app.by_cfadbd7a')}{" "}
                    {info.authors.map((author: string, idx: number) => (
                      <button
                        key={author}
                        type="button"
                        className="hover:text-primary transition-colors"
                        onClick={() => navigate(`/search?q=${encodeURIComponent(author)}`)}
                      >
                        {author}
                        {idx < info.authors.length - 1 ? "," : ""}
                      </button>
                    ))}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mb-3">
                  {info.genres?.map((genre: string) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => navigate(`/search?genre=${encodeURIComponent(genre)}&type=novel`)}
                      className="px-3 py-1.5 rounded-lg bg-muted text-sm font-medium hover:bg-primary/20 hover:text-primary transition-colors"
                    >
                      {genre}
                    </button>
                  ))}
                </div>

                {/* Tags in Hero */}
                {combinedNovelTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mr-1 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-primary" />
                      {uiI18n.t('app.tags_b5ddd4e8')}
                    </span>
                    {combinedNovelTags.slice(0, 14).map((tag: any) => (
                      <button
                        key={`hero-tag-${tag.id || tag.name}`}
                        type="button"
                        onClick={() => navigate(`/search?novelTag=${encodeURIComponent(tag.name)}&novelTagSource=${tag.source}&type=novel`)}
                        className="px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-xs text-muted-foreground hover:text-primary transition-all flex items-center gap-1 group"
                        title={tag.rank ? uiI18n.t('app.i18n_value_0_i18n_value_1_click_to_search_b5c1c535', { value0: tag.name, value1: tag.rank }) : uiI18n.t('app.i18n_value_0_click_to_search_befc3ac0', { value0: tag.name })}
                      >
                        <span>{tag.name}</span>
                        {typeof tag.rank === 'number' && (
                          <span className="text-[10px] text-muted-foreground/60 group-hover:text-primary/70">
                            {tag.rank}%
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleReadNow}
                  disabled={sortedChapters.length === 0}
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <BookOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  {hasSavedProgress ? uiI18n.t('app.continue_reading_54800d4f') : uiI18n.t('app.read_from_chapter_1_8933469a')}
                </button>
                <AddToPlaylistButton
                  animeId={`novel:${String(info.anilistId || info.malId || novelId || "")}`}
                  animeName={displayTitle}
                  animePoster={info.coverImage || undefined}
                  mediaType="manga"
                  mediaFormat="novel"
                  className="h-auto border border-white/15 bg-white/5 text-foreground px-6 py-3.5 rounded-xl font-bold hover:bg-white/10 active:scale-95 transition-all"
                />
                <button
                  onClick={() => setShowNovelDownload(true)}
                  disabled={sortedChapters.length === 0}
                  className="flex items-center justify-center gap-2 border border-white/15 bg-white/5 text-foreground px-6 py-3.5 rounded-xl font-bold hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title={uiI18n.t('app.download_chapters_for_offline_reading_a3dc5b8e')}
                >
                  <Download className="w-5 h-5" />
                  {uiI18n.t('app.download_a479c9c3')}
                </button>
                {!user ? (
                  <button
                    onClick={() => navigate("/auth")}
                    className="flex items-center justify-center gap-2 border border-white/15 bg-white/5 text-foreground px-6 py-3.5 rounded-xl font-bold hover:bg-white/10 active:scale-95 transition-all"
                  >
                    <BookmarkPlus className="w-5 h-5" />
                    {uiI18n.t('app.sign_in_for_library_e0c3c048')}
                  </button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        disabled={addToReadlist.isPending || removeFromReadlist.isPending}
                        className="flex items-center justify-center gap-2 border border-white/15 bg-white/5 text-foreground px-6 py-3.5 rounded-xl font-bold hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {currentReadlistStatus ? <BookmarkCheck className="w-5 h-5 text-primary" /> : <BookmarkPlus className="w-5 h-5" />}
                        {currentReadlistLabel ?? uiI18n.t('app.add_to_library_84540e9d')}
                        <ChevronDown className="w-4 h-4 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {READLIST_STATUS_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          onClick={() => handleSetReadlistStatus(option.value)}
                          className={currentReadlistStatus === option.value ? "bg-primary/20" : ""}
                        >
                          {option.label}
                        </DropdownMenuItem>
                      ))}
                      {currentReadlistStatus && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={handleRemoveReadlist}
                            className="text-destructive focus:text-destructive"
                          >
                            {uiI18n.t('app.remove_from_library_a3c22664')}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-8">
            <div className="space-y-8 min-w-0">
              {/* Overview */}
              {info.synopsis && (
                <section>
                  <h3 className="font-display text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    {uiI18n.t('app.synopsis_36c0630a')}
                  </h3>
                  <GlassPanel className="p-6 md:p-8 relative overflow-hidden group">
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap relative z-10 text-sm md:text-base">
                      {info.synopsis}
                    </p>
                  </GlassPanel>
                </section>
              )}

              {combinedNovelTags.length > 0 && (
                <section>
                  <h3 className="font-display text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                    <Palette className="w-5 h-5 text-primary" />
                    {uiI18n.t('app.tags_848eed0f')}
                  </h3>
                  <GlassPanel className="p-5">
                    <div className="flex flex-wrap gap-1.5">
                      {combinedNovelTags.slice(0, 40).map((tag: any) => (
                        <button
                          key={`tag-${tag.id ?? tag.name}`}
                          type="button"
                          onClick={() => navigate(`/search?novelTag=${encodeURIComponent(tag.name)}&novelTagSource=${tag.source}&type=novel`)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors hover:border-primary/40 hover:text-primary flex items-center gap-1 ${tag.weight === 'defining'
                              ? 'bg-primary/10 border-primary/20 text-primary/80'
                              : tag.weight === 'core'
                              ? 'bg-white/5 border-white/10 text-foreground/70'
                              : 'bg-white/[0.03] border-white/5 text-muted-foreground'}`}
                          title={tag.rank ? uiI18n.t('app.i18n_value_0_i18n_value_1_click_to_search_b5c1c535', { value0: tag.name, value1: tag.rank }) : uiI18n.t('app.i18n_value_0_click_to_search_befc3ac0', { value0: tag.name })}
                        >
                          <span>{tag.name}</span>
                          {typeof tag.rank === 'number' && (
                            <span className="text-[9px] opacity-60">{tag.rank}%</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </GlassPanel>
                </section>
              )}

              {/* Relation Tree */}
              {info.relations && info.relations.length > 0 && (
                <section className="mb-8">
                  <h3 className="font-display text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                    <GitGraph className="w-5 h-5 text-primary" />
                    {uiI18n.t('app.series_tree_31ecaced')}
                  </h3>
                  <RelationTree relations={info.relations} />
                </section>
              )}

              {/* Characters Section — AnimePage-aligned GlassPanel cards */}
              {info.characters && info.characters.length > 0 && (
                <section className="mb-10">
                  <h3 className="font-display text-xl md:text-2xl font-bold mb-6 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    {uiI18n.t('app.characters_b6f59f08')}
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
                    {info.characters.slice(0, 12).map((char: any, index: number) => (
                      <GlassPanel
                        key={`${char.id || char.name}-${index}`}
                        className="p-0 overflow-hidden cursor-pointer group hover:bg-white/10 transition-colors"
                        onClick={() =>
                          navigate(
                            `/character/${char.id || encodeURIComponent(char.name)}?name=${encodeURIComponent(char.name)}`,
                          )
                        }
                      >
                        <img
                          src={getProxiedImageUrl(char.image || char.poster || char.imageUrl || "") || "/placeholder.svg"}
                          alt={char.name}
                          className="w-full aspect-[2/3] object-cover"
                          loading="lazy"
                        />
                        <div className="p-2">
                          <p className="font-bold text-xs truncate group-hover:text-primary transition-colors">{char.name}</p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider truncate">
                            {char.role || uiI18n.t('app.character_ee9946c8')}
                          </p>
                        </div>
                      </GlassPanel>
                    ))}
                  </div>
                </section>
              )}

              {/* Chapters List */}
              <section id="novel-chapters-section">
                <div className="mb-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-display text-xl md:text-2xl font-bold flex items-center gap-2">
                      <Layers className="w-5 h-5 text-primary" />
                      {uiI18n.t('app.chapters_034e2733')}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={checkingChapters}
                        onClick={() => fullScanForNovel === novelId ? void recheckChapters() : setFullScanForNovel(novelId || null)}
                        className="h-8 text-xs">
                        {checkingChapters ? uiI18n.t('app.checking_sources_17451181') : uiI18n.t('app.check_all_sources_7b5bc3b0')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setShowNovelDownload(true)}
                        disabled={chapters.length === 0}
                        className="h-8 gap-1.5 rounded-lg glow-primary text-xs font-bold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {uiI18n.t('app.download_all_d69edf7c')}
                      </Button>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {uiI18n.t('app.sort_by_a2a5bdec')}
                      </label>
                      <select
                        value={chapterSortMode}
                        onChange={(event) => setChapterSortMode(event.target.value as ChapterSortMode)}
                        className="rounded-lg border border-white/10 bg-background/70 px-2.5 py-1.5 text-xs font-semibold"
                      >
                        <option value="oldest">{uiI18n.t('app.oldest_first_6a99c65c')}</option>
                        <option value="newest">{uiI18n.t('app.newest_first_f5ec7772')}</option>
                      </select>
                      <span className="text-sm font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        {isChapterListLoading
                          ? "Loading..."
                          : hasChapterFilters
                            ? uiI18n.t('app.i18n_value_0_of_i18n_value_1_matches_af8631d0', { value0: filteredDisplayChapters.length, value1: displayChapters.length })
                            : uiI18n.t('app.i18n_value_0_available_af551792', { value0: displayChapters.length })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="relative flex-1 min-w-[220px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={chapterSearchTerm}
                        onChange={(event) => setChapterSearchTerm(event.target.value)}
                        placeholder={uiI18n.t('app.search_chapter_number_title_translator_f6dd9d48')}
                        className="w-full rounded-xl border border-white/10 bg-background/70 pl-9 pr-3 py-2 text-sm font-medium text-foreground focus:border-primary/50 focus:outline-none"
                      />
                    </div>

                    {volumeSections.length > 0 && (
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {uiI18n.t('app.book_volume')}
                        </label>
                        <select
                          value={selectedVolumeFilter == null ? "all" : String(selectedVolumeFilter)}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            if (nextValue === "all") {
                              setSelectedVolumeFilter(null);
                              return;
                            }

                            setSelectedVolumeFilter(Number(nextValue));
                            setChapterSearchTerm("");
                          }}
                          className="rounded-lg border border-white/10 bg-background/70 px-2.5 py-1.5 text-xs font-semibold"
                        >
                          <option value="all">{uiI18n.t('app.all_volumes_d12fdd83')}</option>
                          {volumeSections.map((volumeItem) => (
                            <option key={`volume-filter-${volumeItem.volume}`} value={volumeItem.volume}>
                              {uiI18n.t('app.book_volume')} {volumeItem.volume}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {(chapterSearchTerm.trim().length > 0 || selectedVolumeFilter != null) && (
                      <button
                        onClick={() => {
                          setChapterSearchTerm("");
                          setSelectedVolumeFilter(null);
                        }}
                        className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
                      >
                        {uiI18n.t('app.clear_719ea396')}
                      </button>
                    )}
                  </div>

                  {hasChapterGroups && (
                    <div className="flex flex-wrap gap-2">
                      {chapterGroups.map((group, index) => {
                        const range = chapterGroupRanges[index] || { start: 1, end: group.length };
                        const isActiveGroup = index === activeChapterGroup;

                        return (
                          <button
                            key={`chapter-group-${range.start}-${range.end}-${index}`}
                            onClick={() => setSelectedChapterGroup(index)}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-xs font-bold border transition-colors",
                              isActiveGroup
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-foreground",
                            )}
                            title={uiI18n.t('app.i18n_value_0_chapters_6744ce28', { value0: group.length })}
                          >
                            {range.start}-{range.end}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {hasChapterGroups && (
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const activeRange = chapterGroupRanges[activeChapterGroup];
                        if (!activeRange) return `Showing ${filteredDisplayChapters.length} chapters`;
                        return `Showing chapters ${activeRange.start}-${activeRange.end} of ${filteredDisplayChapters.length}`;
                      })()}
                    </p>
                  )}
                </div>

                {isChapterListLoading ? (
                  <GlassPanel className="p-8">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{uiI18n.t('app.loading_chapters_6e009b7e')}</span>
                    </div>
                  </GlassPanel>
                ) : filteredDisplayChapters.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {chapterCards.map((chapter) => (
                      <div key={`${chapter.canonicalOrder}-${chapter.chapterNumber ?? "?"}`}>
                        <NovelChapterProviderRows
                          key={`${chapter.canonicalOrder}-${chapter.chapterNumber ?? "?"}`}
                          chapter={{
                            chapterNumber: chapter.chapterNumber ?? null,
                            chapterTitle: chapter.chapterTitle ?? null,
                            sources: (chapter.sources || []).map((src) => ({
                              provider: src.provider,
                              providerName: src.providerName,
                              chapterKey: src.chapterKey || "",
                              providerChapterId: src.providerChapterId || src.chapterKey || "",
                              language: src.language ?? null,
                              translator: src.translator ?? null,
                            })),
                          }}
                          bestSource={getBestSource(chapter)}
                          preferredProvider={preferredProvider}
                          onNavigate={(provider, chapterKey) => {
                            const src = chapter.sources?.find(
                              (s) => s.provider === provider && s.chapterKey === chapterKey,
                            );
                            goToReader(
                              chapter,
                              src ?? { provider, chapterKey, providerChapterId: chapterKey, language: null, translator: null, releaseDate: null },
                              0,
                            );
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <GlassPanel className="p-8 text-center">
                    <p className="text-muted-foreground">
                      {sortedChapters.length === 0
                        ? uiI18n.t('app.no_chapters_available_yet_89eae277')
                        : hasChapterFilters
                          ? uiI18n.t('app.no_chapters_match_your_current_filters_or_search_5adc1f8d')
                          : uiI18n.t('app.no_chapters_match_the_selected_translator_filter_b3dd5c5d')}
                    </p>
                    {sortedChapters.length === 0 && (
                      <div className="mt-4 text-left">
                        <ExtensionRequired kind="novel" />
                        <NovelDiagnostics anilistId={typeof info.anilistId === "number" ? info.anilistId : null} title={novelSearchTitle} />
                      </div>
                    )}
                  </GlassPanel>
                )}
              </section>

              {volumeSections.length > 0 && (
                <section>
                  <h3 className="font-display text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-primary" />
                    {uiI18n.t('app.volumes_39c0ee03')}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {volumeSections.map((volumeItem) => (
                      <GlassPanel key={`volume-${volumeItem.volume}`} className="p-4 border border-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-base font-bold">{uiI18n.t('app.book_volume')} {volumeItem.volume}</p>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {volumeItem.readableCount}/{volumeItem.chapterCount} {uiI18n.t('app.readable_1d28e511')}
                          </span>
                        </div>

                        <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
                          {uiI18n.t('app.chapters_034e2733')} {volumeItem.rangeLabel}
                        </p>

                        {volumeItem.firstChapterTitle && (
                          <p className="mt-1 text-xs text-foreground/80 line-clamp-1">
                            {uiI18n.t('app.starts_83eef1d6')} {volumeItem.firstChapterTitle}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => goToReader(volumeItem.firstChapter, volumeItem.firstSource, 0)}
                            disabled={!volumeItem.firstChapterKey}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {uiI18n.t('app.read_volume_0e0ca02c')}
                          </button>

                          <button
                            onClick={() => goToReader(volumeItem.latestChapter, volumeItem.latestSource, 0)}
                            disabled={!volumeItem.latestChapterKey}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {uiI18n.t('app.latest_in_volume_3eb30bf5')}
                          </button>

                          <button
                            onClick={() => {
                              setSelectedVolumeFilter(volumeItem.volume);
                              setChapterSearchTerm("");
                              setSelectedChapterGroup(0);
                              setChapterSortMode("oldest");
                              const chapterSection = document.getElementById("novel-chapters-section");
                              chapterSection?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
                          >
                            {uiI18n.t('app.view_chapters_f90f45bd')}
                          </button>
                        </div>

                        {volumeItem.readableChapters.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {volumeItem.readableChapters.slice(0, 6).map((chapterItem) => (
                              <button
                                key={`volume-${volumeItem.volume}-chapter-${chapterItem.chapterKey}`}
                                onClick={() => goToReader(chapterItem.chapter, chapterItem.source, 0)}
                                className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
                              >
                                {chapterItem.chapterNumber != null ? uiI18n.t('app.ch_i18n_value_0_4ed07eb4', { value0: chapterItem.chapterNumber }) : uiI18n.t('app.open_chapter_5e1d2940')}
                              </button>
                            ))}
                            {volumeItem.readableChapters.length > 6 && (
                              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                                +{volumeItem.readableChapters.length - 6} {uiI18n.t('app.more_e7c95b4c')}
                              </span>
                            )}
                          </div>
                        )}
                      </GlassPanel>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="font-display text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  {uiI18n.t('app.recommendations_4faa65b5')}
                </h3>

                {loadingRecommendations && mergedRecommendations.length === 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <Skeleton key={`rec-skeleton-${index}`} className="aspect-[2/3] rounded-2xl" />
                    ))}
                  </div>
                ) : mergedRecommendations.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {mergedRecommendations.map((card) => (
                      <div key={`novel-rec-${card.id}`} className="flex flex-col">
                        <UnifiedMediaCard item={card} className="flex-1" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <GlassPanel className="p-5">
                    <p className="text-sm text-muted-foreground">
                      {uiI18n.t('app.recommendations_are_warming_up_check_back_in_a_m_bd89f750')}
                    </p>
                  </GlassPanel>
                )}
              </section>

              <section>
                <Comments
                  entityType="manga"
                  entityId={String(novelId || info.anilistId || info.malId || "")}
                  entityName={displayTitle}
                />
              </section>
            </div>
            <div className="space-y-4">
              <GlassPanel className="p-5">
                <h4 className="font-display font-bold mb-3">{uiI18n.t('app.metadata_251edc0e')}</h4>
                <div className="mb-4">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {uiI18n.t('app.preferred_translator_1225eea2')}
                  </label>
                  <select
                    value={preferredProvider}
                    onChange={(event) => setPreferredProvider(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-background/70 px-3 py-2 text-sm font-medium text-foreground focus:border-primary/50 focus:outline-none"
                  >
                    <option value="auto">{uiI18n.t('app.auto_best_source_per_chapter_922dc680')}</option>
                    {providerOptions.map((provider) => (
                      <option key={provider} value={provider}>
                        {chapters.flatMap(ch => ch.sources || []).find(s => s.provider === provider)?.providerName || provider}
                      </option>
                    ))}
                  </select>
                </div>
                <SourceDebug kind="manga" sources={chapters.flatMap(ch => ch.sources || [])} />
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{uiI18n.t('app.status_11dc9e19')} <span className="text-foreground">{info.status || uiI18n.t('app.unknown_50d8b4a9')}</span></p>
                  <p>{uiI18n.t('app.format_d6400d55')} <span className="text-foreground">{uiI18n.t('app.novel_1a9fdb91')}</span></p>
                  <p>{uiI18n.t('app.total_chapters_d933396b')} <span className="text-foreground">{info.totalChapters ?? anilistMetadata?.chapters ?? "?"}</span></p>
                  <p>{uiI18n.t('app.total_volumes_ac878036')} <span className="text-foreground">{info.totalVolumes ?? anilistMetadata?.volumes ?? "?"}</span></p>

                  {info.publishers && info.publishers.length > 0 && (
                    <p>{uiI18n.t('app.publishers_0a4eac14')} <span className="text-foreground">{info.publishers.join(", ")}</span></p>
                  )}

                  {jikanData?.serializations && jikanData.serializations.length > 0 && (
                    <p>{uiI18n.t('app.serialization_9ef6c82b')} <span className="text-foreground">{jikanData.serializations.map((s: any) => s.name).join(", ")}</span></p>
                  )}

                  {info.yearStart && (
                    <p>{uiI18n.t('app.aired_5ea003a8')} <span className="text-foreground">{info.yearStart}{info.yearEnd ? uiI18n.t('app.to_i18n_value_0_3c4b31a7', { value0: info.yearEnd }) : uiI18n.t('app.ongoing_7e2971b2')}</span></p>
                  )}
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {uiI18n.t('app.genres_96817ade')}
                  </p>
                  {info.genres && info.genres.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {info.genres.map((genre: string) => (
                        <button
                          key={`meta-genre-${genre}`}
                          type="button"
                          onClick={() => navigate(`/search?genre=${encodeURIComponent(genre)}&type=novel`)}
                          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          {genre}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{uiI18n.t('app.no_genres_available_c7b06b77')}</p>
                  )}
                </div>

                {Array.isArray(anilistNovelMeta?.tags) && anilistNovelMeta.tags.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {uiI18n.t('app.anilist_tags_dae15328')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {anilistNovelMeta.tags.filter((tag: any) => tag?.name).map((tag: any) => (
                        <button
                          key={tag.name}
                          type="button"
                          title={tag.isAdult ? uiI18n.t('app.adult_anilist_tag_09278eca') : uiI18n.t('app.search_this_anilist_tag_c14512b4')}
                          onClick={() => navigate(`/search?novelTag=${encodeURIComponent(tag.name)}&novelTagSource=anilist&type=novel`)}
                          className="rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary/80 transition-colors hover:border-primary/40 hover:bg-primary/15"
                        >
                          #{tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* MangaBaka enrichment: cross-site ratings */}
                {(mangaBakaData as any) && Object.keys((mangaBakaData as any).sources || {}).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {uiI18n.t('app.cross_site_ratings_39a0e8db')}
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries((mangaBakaData as any).sources)
                        .filter(([, src]: any) => src.ratingNormalized !== null)
                        .sort(([, a]: any, [, b]: any) => (b.ratingNormalized ?? 0) - (a.ratingNormalized ?? 0))
                        .map(([key, src]: any) => {
                          const label = key === 'anilist' ? uiI18n.t('app.anilist_c03a6787') : key === 'my_anime_list' ? uiI18n.t('app.mal_308b46c0') : key === 'kitsu' ? uiI18n.t('app.kitsu_0477259d') : key === 'manga_updates' ? uiI18n.t('app.mu_fc242aea') : key === 'anime_planet' ? uiI18n.t('app.ap_bc5af774') : key === 'shikimori' ? uiI18n.t('app.shikimori_59fa6858') : key === 'anime_news_network' ? uiI18n.t('app.ann_30ffbd17') : key.replace(/_/g, ' ');
                          const pct = Math.round(src.ratingNormalized ?? 0);
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
                              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] font-bold text-foreground/70 w-8 text-right">{src.rating !== null ? src.rating.toFixed(2) : '—'}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* MangaBaka: publishers */}
                {(mangaBakaData as any) && (mangaBakaData as any).publishers?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {uiI18n.t('app.publishers_107e7fab')}
                    </p>
                    <div className="space-y-1">
                      {(mangaBakaData as any).publishers.map((pub: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-foreground/80">{pub.name}</span>
                          {pub.type && (
                            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-white/5">
                              {pub.type}{pub.note ? uiI18n.t('app.i18n_value_0_92e4cd32', { value0: pub.note }) : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* MangaBaka: anime coverage */}
                {(mangaBakaData as any)?.animeCoverage && (mangaBakaData as any).hasAnime && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {uiI18n.t('app.anime_coverage_0d07955c')}
                    </p>
                    <p className="text-xs text-foreground/80">
                      {(mangaBakaData as any).animeCoverage.start && uiI18n.t('app.from_i18n_value_0_a86522e4', { value0: (mangaBakaData as any).animeCoverage.start })}
                      {(mangaBakaData as any).animeCoverage.end && uiI18n.t('app.i18n_value_0_4585ffcf', { value0: (mangaBakaData as any).animeCoverage.end })}
                    </p>
                  </div>
                )}

                {/* MangaBaka: external links */}
                {(mangaBakaData as any) && (mangaBakaData as any).links?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {uiI18n.t('app.external_links_4d57eab2')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(mangaBakaData as any).links.slice(0, 6).map((link: any, i: number) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-md border border-white/10 bg-white/5 text-[10px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </GlassPanel>
            </div>
          </div>
        </main>
        <MobileNav />
      </div>
    </>
  );
}
