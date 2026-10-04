/**
 * MangaPage.tsx
 * Comprehensive Manga information and chapter listing page.
 * Orchestrates data from multiple sources:
 * 1. TatakaiAPI (Main detail & metadata)
 * 2. AniList (Banner, chapters/volumes count)
 * 3. Jikan/MAL (Serialization, HQ images)
 * 4. User Readlist (Progress tracking)
 */

import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { resolveApiV3Base } from "@/lib/api/backendOrigin";
import { Button } from "@/components/ui/button";
import { useMangaDetail, useMangaChapters, useMangaBakaSeries, useMangaKitsuHierarchy } from "@/hooks/api/useMangaData";
import { useAniListRecommendations } from "@/hooks/api/useAniListRecommendations";
import { useMangaRecommendationEngine } from "@/hooks/api/useMangaRecommendationEngine";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { Comments } from "@/components/comments/Comments";
import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";
import { getProxiedImageUrl, fetchJikanCover } from "@/lib/api";
import { cn } from "@/lib/utils";
import { searchManga } from "@/core/content/manga-client";
import { inferMangaAdultFlag } from "@/lib/contentSafety";
import { AdultWarningGate } from "@/components/content/AdultWarningGate";
import type { MangaSearchItem, MangaChapterResponse, MangaChapterSource } from "@/types/manga";
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
  ExternalLink as ExternalLinkIcon,
  Globe,
  Palette,
  PenTool,
  GitGraph,
  ChevronRight,
  Puzzle,
  ChevronDown,
  Tag,
  Pencil,
  Database,
  CheckCircle2,
  Download,
} from "lucide-react";
import type { MediaRelation } from "@/core/content/types";
import { ContentEditSheet, type EditableColumns } from "@/components/admin/ContentEditSheet";
import { MangaDownloadModal } from "@/components/manga/MangaDownloadModal";

// Reliability order for the reader's cross-source fallback. Mirrors the
// extension's MANGA_PROVIDERS priority: deterministic mappers (mangadex/comick)
// and clean HTTP scrapers first, best-effort/CF-gated sources last. A chapter's
// sources are sorted by this before being handed to the reader as `alternatives`
// so a dead source falls through to the most trustworthy sibling.
const MANGA_PROVIDER_RELIABILITY = [
  "mangadex",
  "mangapill",
  "mangakatana",
  "weebcentral",
  "nelomanga",
  "comick",
  "atsu",
  "webtoons",
  "demonicscans",
];
function providerReliabilityRank(provider?: string | null): number {
  const idx = MANGA_PROVIDER_RELIABILITY.indexOf(String(provider || "").toLowerCase());
  return idx === -1 ? MANGA_PROVIDER_RELIABILITY.length : idx;
}

// --- Helper Component: Relation Tree ---
function RelationTree({ relations }: { relations: MediaRelation[] }) {
  const navigate = useNavigate();

  if (relations.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
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
                mediaType: isManga ? 'manga' : (isNovel ? 'manga' : 'anime'),
                href: isNovel ? '/novel/comingsoon' : undefined
              }}
              className="flex-1"
            />
          </div>
        );
      })}
    </div>
  );
}

import { Helmet } from "react-helmet-async";
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { setViewingMangaRpc, clearDiscordRpc } from '@/lib/discordRpc';
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMangaReadlistItem,
  useRemoveFromMangaReadlist,
  useUpsertMangaReadlist,
} from "@/hooks/user/useMangaReadlist";
import type { MangaReadlistStatus } from "@/hooks/user/useMangaReadlist";
import { classifyReadingFormat } from "@/lib/rankUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchExtensionMangaChapters,
  mergeChaptersWithExtensions,
} from "@/core/content/manga-extension-runtime";
import { MangaChapterProviderRows } from "@/components/manga/MangaChapterProviderRows";

const normalizeLanguageKey = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "jp" || normalized.startsWith("ja") || normalized.includes("japanese")) return "jp";
  if (normalized === "kr" || normalized.startsWith("ko") || normalized.includes("korean")) return "kr";
  if (normalized === "zh" || normalized.startsWith("zh") || normalized.includes("chinese")) return "zh";
  if (normalized === "en" || normalized.startsWith("en") || normalized.includes("english")) return "en";
  return normalized;
};

const formatLanguageLabel = (value: string | null | undefined) => {
  const key = normalizeLanguageKey(value);
  if (key === "jp") return "Japanese";
  if (key === "kr") return "Korean";
  if (key === "zh") return "Chinese";
  if (key === "en") return "English";
  if (key === "unknown") return "Unknown";
  return key.toUpperCase();
};

const normalizePreferredMangaLanguage = (value: string | null | undefined) => {
  const normalized = normalizeLanguageKey(value);
  if (normalized === "jp" || normalized === "kr" || normalized === "zh" || normalized === "en") {
    return normalized;
  }
  return "auto";
};

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

const toRecommendationCard = (item: MangaSearchItem): UnifiedMediaCardProps["item"] | null => {
  const title = item.canonicalTitle || item.title?.english || item.title?.romaji || item.title?.native;
  const id = item.anilistId || item.malId || item.id;
  if (!title || !id) return null;

  return {
    id: String(id),
    name: title,
    poster: item.poster || "",
    type: item.mediaType || "manga",
    status: item.status || undefined,
    rating:
      typeof item.score === "number" && Number.isFinite(item.score)
        ? (item.score / 10).toFixed(1)
        : undefined,
    chapters: typeof item.chapters === "number" && item.chapters > 0 ? item.chapters : undefined,
    anilistId: typeof item.anilistId === "number" ? item.anilistId : undefined,
    malId: typeof item.malId === "number" ? item.malId : undefined,
    isAdult: inferMangaAdultFlag(item),
    mediaType: "manga",
  };
};

type ChapterSortMode = "newest" | "oldest";
const CHAPTERS_PER_GROUP = 20;

export default function MangaPage() {
  const { mangaId } = useParams<{ mangaId: string }>();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const isMobileViewport = useIsMobile();
  const { user, profile, isAdmin } = useAuth();
  const { settings: contentSafetySettings, updateSettings: updateContentSafetySettings } = useContentSafetySettings();
  const [allowAdultForSession, setAllowAdultForSession] = useState(false);
  const [expandedChapterOrder, setExpandedChapterOrder] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [showMangaDownload, setShowMangaDownload] = useState(false);

  const { data: mangaData, isLoading: loadingInfo, error } = useMangaDetail(mangaId);
  const { data: chapterData, isLoading: loadingChapters } = useMangaChapters(mangaId);
  const { data: mangaBakaData } = useMangaBakaSeries(mangaData?.detail?.anilistId);
  const { data: kitsuHierarchy } = useMangaKitsuHierarchy(mangaData?.detail?.anilistId);
  const { data: anilistMangaMeta } = useQuery({
    queryKey: ['manga-anilist-tags', mangaData?.detail?.anilistId],
    queryFn: async () => {
      const id = mangaData?.detail?.anilistId;
      if (!id) return null;
      const response = await fetch(`${resolveApiV3Base()}/manga/by-anilist/${id}`);
      if (!response.ok) return null;
      const payload = await response.json();
      return payload?.data ?? null;
    },
    enabled: Boolean(mangaData?.detail?.anilistId),
    staleTime: 10 * 60 * 1000,
  });

  const { data: directAniListMangaTags = [] } = useQuery({
    queryKey: ['manga-tags-direct', mangaData?.detail?.anilistId],
    // Tags come from the server-proxied `by-anilist` query (anilistMangaMeta),
    // which is cached and CORS-safe. This direct AniList call was redundant with
    // that channel and its 429s surfaced as "blocked by CORS" spam, so it now
    // just mirrors the proxied tags instead of hitting graphql.anilist.co.
    queryFn: async () => (anilistMangaMeta?.tags ?? []) as Array<{
      id: number;
      name: string;
      category?: string;
      rank?: number;
      isMediaSpoiler?: boolean;
      isGeneralSpoiler?: boolean;
    }>,
    enabled: Boolean(mangaData?.detail?.anilistId),
    staleTime: 60 * 60 * 1000,
  });

  const combinedMangaTags = useMemo(() => {
    // 1. Direct AniList tags or anilistMangaMeta tags
    const aniList = directAniListMangaTags.length > 0 ? directAniListMangaTags : ((anilistMangaMeta?.tags || []) as any[]);
    const validAniList = aniList
      .filter((t: any) => !t.isMediaSpoiler && !t.isGeneralSpoiler)
      .map((t: any) => ({
        id: t.id || t.name,
        name: t.name,
        rank: t.rank,
        weight: t.rank && t.rank >= 80 ? 'defining' : t.rank && t.rank >= 60 ? 'core' : 'normal',
      }));

    if (validAniList.length > 0) return validAniList;

    // 2. MangaBaka tags fallback
    return (mangaBakaData?.tags || [])
      .filter((t: any) => !t.isSpoiler)
      .map((t: any) => ({
        id: t.id ?? t.name,
        name: t.name,
        rank: t.weight === 'defining' ? 90 : t.weight === 'core' ? 70 : undefined,
        weight: t.weight,
      }));
  }, [directAniListMangaTags, anilistMangaMeta?.tags, mangaBakaData?.tags]);

  // Fetch extension manga chapters (Toko + other installed manga extensions) and merge
  // with API data before rendering. Requirements: 8.4, 8.5
  const [extensionChapterPayload, setExtensionChapterPayload] = useState<
    Awaited<ReturnType<typeof fetchExtensionMangaChapters>> | null
  >(null);

  useEffect(() => {
    if (!mangaData?.detail) return;
    const { anilistId, malId, canonicalTitle, title } = mangaData.detail;
    const titleStr = canonicalTitle || title?.english || title?.romaji || '';
    const reqParams = {
      anilistId: typeof anilistId === 'number' ? anilistId : undefined,
      malId: typeof malId === 'number' ? malId : undefined,
      title: titleStr || undefined,
    };
    fetchExtensionMangaChapters(reqParams)
      .then((payload) => {
        setExtensionChapterPayload(payload);
      })
      .catch(() => { /* extension chapters are best-effort */ });
  }, [mangaData?.detail]);
  const { data: readlistEntry } = useMangaReadlistItem(mangaId);
  const addToReadlist = useUpsertMangaReadlist();
  const removeFromReadlist = useRemoveFromMangaReadlist();
  const rawCoverImage = mangaData?.detail?.coverImage || "";
  const [coverImageSrc, setCoverImageSrc] = useState<string>(() => getProxiedImageUrl(rawCoverImage));
  const [coverFallbackTried, setCoverFallbackTried] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [anilistMetadata, setAnilistMetadata] = useState<{ chapters?: number; volumes?: number } | null>(null);

  const malId = mangaData?.detail?.malId;
  const { data: jikanData } = useQuery({
    queryKey: ["jikan-manga", malId],
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
    const detail = mangaData?.detail;
    if (!detail) return;
    const title =
      detail.canonicalTitle || detail.title?.english || detail.title?.romaji || '';
    if (!title) return;
    setViewingMangaRpc({
      mangaTitle: title,
      mangaImageUrl: detail.coverImage ?? null,
      mangaUrl: `https://tatakai.me/manga/${mangaId}`,
    });
    return () => {
      clearDiscordRpc();
    };
  }, [isNative, mangaData?.detail, mangaId]);

  // Banner + chapter/volume counts come from the server-proxied `by-anilist`
  // query (anilistMangaMeta), not a direct graphql.anilist.co call — the direct
  // call 429'd under load and surfaced as "blocked by CORS" in the console.
  useEffect(() => {
    if (!anilistMangaMeta) return;
    if (anilistMangaMeta.bannerImage) {
      setBannerUrl(getProxiedImageUrl(anilistMangaMeta.bannerImage));
    }
    setAnilistMetadata({
      chapters: anilistMangaMeta.chapters,
      volumes: anilistMangaMeta.volumes,
    });
  }, [anilistMangaMeta]);

  const chapters = useMemo(() => {
    const base = chapterData?.mappedChapters ? chapterData.mappedChapters : [];

    // Build a Kitsu chapter lookup map keyed by chapter number so we can enrich
    // base chapters with Kitsu-sourced titles, synopses and thumbnails.
    const kitsuByNumber = new Map<number, { title: string; synopsis: string | null; thumbnail: string | null; published: string | null; pageCount: number | null }>();
    if (kitsuHierarchy?.chapters) {
      for (const kc of kitsuHierarchy.chapters) {
        if (kc.number != null) {
          kitsuByNumber.set(kc.number, {
            title: kc.isGeneratedTitle ? '' : kc.title,
            synopsis: kc.synopsis,
            thumbnail: kc.thumbnail,
            published: kc.published,
            pageCount: kc.pageCount,
          });
        }
      }
    }

    // Merge Kitsu metadata into every mapped chapter that has a chapter number
    const enriched = base.map((ch) => {
      const num = ch.chapterNumber;
      if (num == null) return ch;
      const kc = kitsuByNumber.get(num);
      if (!kc) return ch;
      return {
        ...ch,
        chapterTitle: ch.chapterTitle || kc.title || ch.chapterTitle,
        _kitsuSynopsis: kc.synopsis,
        _kitsuThumbnail: kc.thumbnail,
        _kitsuPublished: kc.published,
        _kitsuPageCount: kc.pageCount,
      };
    });

    if (!extensionChapterPayload?.chapters?.length) return enriched;
    // Merge Toko/extension chapters into the enriched list (req 8.4, 8.5).
    // The base API mapping is usually empty (mappings schema unreachable), so
    // merge against a synthetic empty base when chapterData hasn't loaded —
    // otherwise the extension's chapters would never surface.
    const effectiveBase: MangaChapterResponse = chapterData ?? {
      anilistId: mangaData?.detail?.anilistId ?? 0,
      partial: false,
      failedProviders: [],
      chapters: [],
      mappedChapters: [],
    };
    const merged = mergeChaptersWithExtensions(effectiveBase, extensionChapterPayload);
    const mergedBase = merged.mappedChapters ?? base;
    // Re-apply Kitsu enrichment on the merged list
    return mergedBase.map((ch) => {
      const num = ch.chapterNumber;
      if (num == null) return ch;
      const kc = kitsuByNumber.get(num);
      if (!kc) return ch;
      return {
        ...ch,
        chapterTitle: ch.chapterTitle || kc.title || ch.chapterTitle,
        _kitsuSynopsis: kc.synopsis,
        _kitsuThumbnail: kc.thumbnail,
        _kitsuPublished: kc.published,
        _kitsuPageCount: kc.pageCount,
      };
    });
  }, [chapterData, extensionChapterPayload, kitsuHierarchy, mangaData?.detail?.anilistId]);
  const isChapterListLoading = loadingChapters && !chapterData;
  const [preferredProvider, setPreferredProvider] = useState<string>("auto");
  const [preferredLanguage, setPreferredLanguage] = useState<string>("auto");
  const [chapterSortMode, setChapterSortMode] = useState<ChapterSortMode>("newest");
  const [chapterSearchTerm, setChapterSearchTerm] = useState("");
  const [selectedChapterGroup, setSelectedChapterGroup] = useState(0);
  const [selectedVolumeFilter, setSelectedVolumeFilter] = useState<number | null>(null);
  const profilePreferredMangaLanguage = useMemo(
    () => normalizePreferredMangaLanguage(profile?.preferred_manga_language),
    [profile?.preferred_manga_language],
  );
  const effectivePreferredLanguage =
    preferredLanguage === "auto" ? profilePreferredMangaLanguage : preferredLanguage;

  const providerOptions = useMemo(() => {
    const providers = new Set<string>();
    (mangaData?.detail?.providersAvailable || []).forEach((provider) => {
      if (provider) providers.add(provider);
    });
    chapters.forEach((chapter) => {
      chapter.sources?.forEach((source) => {
        if (source.provider) providers.add(source.provider);
      });
    });
    return Array.from(providers).sort((a, b) => a.localeCompare(b));
  }, [chapters, mangaData?.detail?.providersAvailable]);

  const languageOptions = useMemo(() => {
    const labels = new Map<string, string>();
    chapters.forEach((chapter) => {
      chapter.sources?.forEach((source) => {
        const normalized = normalizeLanguageKey(source.language);
        if (normalized && normalized !== "unknown") {
          labels.set(normalized, formatLanguageLabel(source.language));
        }
      });
    });

    return Array.from(labels.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [chapters]);

  const sortedChapters = useMemo(() => {
    const scoreSource = (source: any) => {
      let score = 0;
      const sourceLanguage = normalizeLanguageKey(source?.language);

      if (preferredProvider !== "auto" && source?.provider === preferredProvider) score += 100;
      if (effectivePreferredLanguage !== "auto" && sourceLanguage === effectivePreferredLanguage) score += 60;
      if (sourceLanguage !== "unknown") score += 5;

      return score;
    };

    return [...chapters]
      .map((chapter) => ({
        ...chapter,
        sources: [...(chapter.sources || [])].sort((left, right) => {
          const scoreDiff = scoreSource(right) - scoreSource(left);
          if (scoreDiff !== 0) return scoreDiff;

          const providerCompare = String(left.provider || "").localeCompare(String(right.provider || ""));
          if (providerCompare !== 0) return providerCompare;

          return formatLanguageLabel(left.language).localeCompare(formatLanguageLabel(right.language));
        }),
      }))
      .sort((left, right) => {
        const chapterDiff = getChapterSortValue(left) - getChapterSortValue(right);
        if (chapterDiff !== 0) return chapterDiff;
        return (left.canonicalOrder ?? Number.MAX_SAFE_INTEGER) - (right.canonicalOrder ?? Number.MAX_SAFE_INTEGER);
      });
  }, [chapters, preferredProvider, effectivePreferredLanguage]);

  const visibleChapters = useMemo(() => {
    return sortedChapters.filter((chapter) =>
      chapter.sources?.some((source) => {
        const providerMatch = preferredProvider === "auto" || source.provider === preferredProvider;
        const languageMatch =
          effectivePreferredLanguage === "auto" || normalizeLanguageKey(source.language) === effectivePreferredLanguage;
        return providerMatch && languageMatch;
      }),
    );
  }, [sortedChapters, preferredProvider, effectivePreferredLanguage]);

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
        .map((source) => `${source.provider || ""} ${formatLanguageLabel(source.language)}`.toLowerCase())
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
    effectivePreferredLanguage !== "auto" ||
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
      const languageMatch =
        effectivePreferredLanguage === "auto" || normalizeLanguageKey(source.language) === effectivePreferredLanguage;
      return providerMatch && languageMatch;
    });
    if (exactSource) return exactSource;

    if (preferredProvider !== "auto") {
      const byProvider = chapter.sources.find((source) => source.provider === preferredProvider);
      if (byProvider) return byProvider;
    }

    if (effectivePreferredLanguage !== "auto") {
      const byLanguage = chapter.sources.find(
        (source) => normalizeLanguageKey(source.language) === effectivePreferredLanguage,
      );
      if (byLanguage) return byLanguage;
    }

    return chapter.sources[0] || null;
  };

  // Build the reader URL from a source, threading everything the reader needs to
  // reach the extension runtime (`provider`, `providerChapterId`) and to show a
  // real chapter title instead of the raw `provider:key` string
  // (`chapterNumber`/`chapterTitle`). Every navigation to the reader goes through
  // here so no entry point silently drops the provider (which dead-ends at
  // `getMangaReadByKey`'s provider guard).
  const buildReaderQuery = (opts: {
    chapterKey: string;
    provider?: string | null;
    providerChapterId?: string | null;
    chapterNumber?: number | null;
    chapterTitle?: string | null;
    page?: number;
  }) => {
    const params = new URLSearchParams();
    params.set("chapterKey", opts.chapterKey);
    if (opts.provider) params.set("provider", opts.provider);
    if (opts.providerChapterId) params.set("providerChapterId", opts.providerChapterId);
    if (opts.chapterNumber != null && Number.isFinite(opts.chapterNumber))
      params.set("chapterNumber", String(opts.chapterNumber));
    if (opts.chapterTitle) params.set("chapterTitle", opts.chapterTitle);
    params.set("page", String(Math.max(0, opts.page ?? 0)));
    return params.toString();
  };

  // Reliability-sort a chapter's sources so the reader's cross-source fallback
  // tries the most trustworthy sibling first when a source yields no pages.
  const sortedSourcesFor = (chapter: { sources?: MangaChapterSource[] } | null | undefined) =>
    [...(chapter?.sources || [])].sort(
      (a, b) => providerReliabilityRank(a.provider) - providerReliabilityRank(b.provider),
    );

  // Navigate to the reader for a specific chapter+source, passing the chapter's
  // reliability-sorted sources as router state (`alternatives`) for fallback.
  const goToReader = (
    chapter: { chapterNumber?: number | null; chapterTitle?: string | null; sources?: MangaChapterSource[] } | null | undefined,
    source: MangaChapterSource | null | undefined,
    page = 0,
  ) => {
    if (!mangaId || !source?.chapterKey) return;
    const query = buildReaderQuery({
      chapterKey: source.chapterKey,
      provider: source.provider,
      providerChapterId: source.providerChapterId,
      chapterNumber: chapter?.chapterNumber ?? null,
      chapterTitle: chapter?.chapterTitle ?? null,
      page,
    });
    navigate(`/manga/read/${mangaId}?${query}`, { state: { sources: sortedSourcesFor(chapter) } });
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
        const languageMatch =
          effectivePreferredLanguage === "auto" || normalizeLanguageKey(source.language) === effectivePreferredLanguage;
        return providerMatch && languageMatch;
      });
      if (exact) return exact;

      if (preferredProvider !== "auto") {
        const byProvider = sources.find((source) => source.provider === preferredProvider);
        if (byProvider) return byProvider;
      }

      if (effectivePreferredLanguage !== "auto") {
        const byLanguage = sources.find(
          (source) => normalizeLanguageKey(source.language) === effectivePreferredLanguage,
        );
        if (byLanguage) return byLanguage;
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

        let rangeLabel = "Unknown range";
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
          // Full chapter+source objects so navigation can thread provider +
          // number + title without re-deriving them from the key.
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
  }, [sortedChapters, preferredProvider, effectivePreferredLanguage]);

  // Desktop vs Mobile sidebar display
  const showSidebar = !isMobileViewport;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mangaId]);

  useEffect(() => {
    setAllowAdultForSession(false);
    setPreferredProvider("auto");
    // Reset to "auto", not to the profile language: "auto" is what lets
    // `effectivePreferredLanguage` apply the profile preference while still
    // ranking against whatever languages this particular manga actually has.
    setPreferredLanguage("auto");
    setChapterSortMode("newest");
    setChapterSearchTerm("");
    setSelectedChapterGroup(0);
    setSelectedVolumeFilter(null);
  }, [mangaId, profilePreferredMangaLanguage]);

  // NOTE: there is deliberately no effect pushing `profilePreferredMangaLanguage`
  // into `preferredLanguage`. `effectivePreferredLanguage` already resolves
  // "auto" against the profile, so writing it into state was redundant — and it
  // formed an infinite render loop with the validation effect below: that effect
  // reset an unavailable language to "auto", which made this one write the
  // profile language straight back. With `languageOptions` empty (chapters still
  // loading, or the detail request failing) the two ping-ponged every commit
  // until React gave up with "Maximum update depth exceeded".

  useEffect(() => {
    if (preferredProvider === "auto") return;
    // Nothing to validate against yet — resetting here would silently discard a
    // deliberate choice every time the chapter list refetches.
    if (providerOptions.length === 0) return;
    if (!providerOptions.includes(preferredProvider)) {
      setPreferredProvider("auto");
    }
  }, [preferredProvider, providerOptions]);

  useEffect(() => {
    if (preferredLanguage === "auto") return;
    if (languageOptions.length === 0) return;
    if (!languageOptions.some((option) => option.value === preferredLanguage)) {
      setPreferredLanguage("auto");
    }
  }, [preferredLanguage, languageOptions]);

  useEffect(() => {
    setSelectedChapterGroup(0);
  }, [chapterSortMode, preferredProvider, effectivePreferredLanguage, chapterSearchTerm, selectedVolumeFilter]);

  useEffect(() => {
    if (selectedVolumeFilter == null) return;
    if (volumeSections.some((volumeItem) => volumeItem.volume === selectedVolumeFilter)) return;
    setSelectedVolumeFilter(null);
  }, [selectedVolumeFilter, volumeSections]);

  const info = mangaData?.detail;

  const displayTitle =
    info?.canonicalTitle ||
    info?.title?.english ||
    info?.title?.romaji ||
    info?.title?.native ||
    "Unknown Title";

  // Precise media format for the playlist item label (manga/manhwa/manhua/comic/novel).
  const playlistMediaFormat = (() => {
    const f = String(info?.format || "").toUpperCase();
    const c = String(info?.origin || "").toUpperCase();
    if (f === "NOVEL" || f === "LIGHT_NOVEL") return "novel";
    if (f === "OEL") return "comic";
    if (f === "MANHWA" || c === "KR") return "manhwa";
    if (f === "MANHUA" || c === "CN" || c === "TW") return "manhua";
    return "manga";
  })();

  // Narrowed to the 3-way MangaKind the downloader/Dynamic Island badge use
  // (comic/novel collapse to 'manga' for the badge).
  const mangaDownloadKind: "manga" | "manhwa" | "manhua" =
    playlistMediaFormat === "manhwa" ? "manhwa"
      : playlistMediaFormat === "manhua" ? "manhua"
        : "manga";

  const recommendationTerms = useMemo(() => {
    if (!info) return [];

    // Phones: 2 terms (title + top genre) instead of 4 — halves the parallel
    // search fan-out, which was the main stall on mobile data.
    const genreTerms = isMobileViewport
      ? info.genres.slice(0, 1).map((genre) => `${genre} manga`)
      : info.genres.slice(0, 3).map((genre) => `${genre} manga`);

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
      "manga-detail-recommendations",
      mangaId,
      recommendationTerms.join("|"),
      contentSafetySettings.showAdultEverywhere,
    ],
    queryFn: async () => {
      if (!info) return [];

      const batches = await Promise.all(
        recommendationTerms.map((term, index) =>
          searchManga(term, 1, isMobileViewport ? 8 : (index === 0 ? 12 : 10), { provider: "all" }),
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
          const sameRouteId = String(card.id) === String(mangaId);

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

  // AniList's crowd-curated manga picks for this title (mirror-proxied, never direct).
  const includeAdultRecs = !!contentSafetySettings?.showAdultEverywhere;
  const { recommendations: anilistMangaRecs } = useAniListRecommendations(info?.anilistId, {
    mediaType: "MANGA",
    includeAdult: includeAdultRecs,
    limit: isMobileViewport ? 12 : 24,
  });
  // The app's own personalized manga engine (same source as the Recommendations page).
  const { recommendations: mangaEngineRecs } = useMangaRecommendationEngine({ limit: isMobileViewport ? 12 : 24 });

  // Merge AniList (primary) + engine (personalized) + search (fallback), deduped
  // and with the current title removed.
  const mergedRecommendations = useMemo<UnifiedMediaCardProps["item"][]>(() => {
    const seen = new Set<string>();
    const out: UnifiedMediaCardProps["item"][] = [];
    const curAniList = typeof info?.anilistId === "number" ? info.anilistId : null;
    const curMal = typeof info?.malId === "number" ? info.malId : null;
    const curRoute = String(mangaId || "");

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

    for (const r of anilistMangaRecs) {
      push({
        id: String(r.anilistId),
        name: r.title,
        poster: r.poster,
        type: r.format ?? "manga",
        rating: r.averageScore ? (r.averageScore / 10).toFixed(1) : undefined,
        anilistId: r.anilistId,
        malId: r.malId ?? undefined,
        isAdult: r.isAdult,
        mediaType: "manga",
      });
    }

    for (const rec of mangaEngineRecs) {
      const a = rec.anime;
      push({
        id: String(a.id),
        name: a.title,
        poster: a.poster ?? "",
        type: a.format ?? "manga",
        rating: a.averageScore ? (a.averageScore / 10).toFixed(1) : undefined,
        anilistId: a.anilistId ?? undefined,
        malId: a.malId ?? undefined,
        mediaType: "manga",
      });
    }

    for (const card of recommendationCards) push(card);

    return out.slice(0, isMobileViewport ? 10 : 16);
  }, [anilistMangaRecs, mangaEngineRecs, recommendationCards, info?.anilistId, info?.malId, mangaId, includeAdultRecs, isMobileViewport]);

  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {!isNative && <Background />}
        {showSidebar && <Sidebar />}
        <main className={cn("relative z-10 py-6 max-w-[1800px] mx-auto", isNative ? "p-6" : "pl-6 md:pl-32 pr-6")}>
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
          <h1 className="text-2xl font-bold mb-2">Manga details not available</h1>
          <p className="text-muted-foreground mb-4">We couldn't retrieve the information for this manga ID.</p>
          <button onClick={() => navigate("/")} className="px-6 py-2 bg-primary text-primary-foreground rounded-full hover:brightness-110 font-bold transition-all">
            Go back home
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
          isNative ? "px-4" : "pl-6 md:pl-32 pr-6"
        )}>
          <AdultWarningGate
            title={info.canonicalTitle || info.title?.english || info.title?.romaji || 'Unknown'}
            mediaLabel="manga"
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
    if (!mangaId) return;

    if (hasSavedProgress && readlistEntry?.last_chapter_key) {
      const savedPage = Math.max(0, Number(readlistEntry.last_page_index || 0));
      const savedKey = String(readlistEntry.last_chapter_key);
      // Find the chapter whose source matches the saved key so we can pass its
      // reliability-sorted sources as fallback alternatives; fall back to the
      // saved provider/number/title on the readlist row when it isn't listed.
      const savedChapter = sortedChapters.find((c) => c.sources?.some((s) => s.chapterKey === savedKey));
      const savedSource = savedChapter?.sources?.find((s) => s.chapterKey === savedKey);
      const query = buildReaderQuery({
        chapterKey: savedKey,
        provider: savedSource?.provider || readlistEntry.last_provider,
        providerChapterId: savedSource?.providerChapterId,
        chapterNumber: savedChapter?.chapterNumber ?? readlistEntry.last_chapter_number ?? null,
        chapterTitle: savedChapter?.chapterTitle ?? readlistEntry.last_chapter_title ?? null,
        page: savedPage,
      });
      navigate(`/manga/read/${mangaId}?${query}`, { state: { sources: sortedSourcesFor(savedChapter) } });
      return;
    }

    if (visibleChapters.length > 0 || sortedChapters.length > 0) {
      const firstReadableChapter = visibleChapters[0] || sortedChapters[0];
      goToReader(firstReadableChapter, getBestSource(firstReadableChapter), 0);
    }
  };

  const handleToggleReadlist = async () => {
    if (!mangaId) return;
    if (!user) {
      navigate("/auth");
      return;
    }

    if (isInReadlist) {
      await removeFromReadlist.mutateAsync({ mangaId });
      return;
    }

    await addToReadlist.mutateAsync({
      mangaId,
      mangaTitle: displayTitle,
      mangaPoster: info.coverImage || null,
      format: classifyReadingFormat({ format: info.format, countryOfOrigin: info.origin }),
      status: "plan_to_read",
      lastChapterKey: readlistEntry?.last_chapter_key || null,
      lastChapterNumber: readlistEntry?.last_chapter_number ?? null,
      lastChapterTitle: readlistEntry?.last_chapter_title || null,
      lastProvider: readlistEntry?.last_provider || null,
      lastLanguage: readlistEntry?.last_language || null,
      lastPageIndex: Number(readlistEntry?.last_page_index || 0),
      totalPages: readlistEntry?.total_pages ?? null,
    });
  };

  // Set an explicit readlist status (mirrors the anime WatchlistButton), keeping
  // any existing reading progress intact.
  const handleSetReadlistStatus = async (status: MangaReadlistStatus) => {
    if (!mangaId) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    await addToReadlist.mutateAsync({
      mangaId,
      mangaTitle: displayTitle,
      mangaPoster: info.coverImage || null,
      format: classifyReadingFormat({ format: info.format, countryOfOrigin: info.origin }),
      status,
      lastChapterKey: readlistEntry?.last_chapter_key || null,
      lastChapterNumber: readlistEntry?.last_chapter_number ?? null,
      lastChapterTitle: readlistEntry?.last_chapter_title || null,
      lastProvider: readlistEntry?.last_provider || null,
      lastLanguage: readlistEntry?.last_language || null,
      lastPageIndex: Number(readlistEntry?.last_page_index || 0),
      totalPages: readlistEntry?.total_pages ?? null,
    });
  };

  const handleRemoveReadlist = async () => {
    if (mangaId) await removeFromReadlist.mutateAsync({ mangaId });
  };

  const READLIST_STATUS_OPTIONS: { value: MangaReadlistStatus; label: string }[] = [
    { value: "plan_to_read", label: "Plan to Read" },
    { value: "reading", label: "Reading" },
    { value: "completed", label: "Completed" },
    { value: "on_hold", label: "On Hold" },
    { value: "dropped", label: "Dropped" },
  ];
  const currentReadlistStatus = readlistEntry?.status as MangaReadlistStatus | undefined;
  const currentReadlistLabel = READLIST_STATUS_OPTIONS.find((o) => o.value === currentReadlistStatus)?.label;

  const displayRating =
    typeof info.score === "number" && Number.isFinite(info.score)
      ? (info.score / 10).toFixed(1)
      : null;

  return (
    <>
      <Helmet>
        <title>{displayTitle} — Manga on Tatakai</title>
        <meta name="description" content={info.synopsis?.slice(0, 160) || `Track ${displayTitle}, rate it, and add it to your lists on Tatakai.`} />
        <meta property="og:title" content={`${displayTitle} — Manga on Tatakai`} />
        <meta property="og:description" content={info.synopsis?.slice(0, 160) || `Track and discuss ${displayTitle} on Tatakai — the otaku community.`} />
        <meta property="og:image" content={info.coverImage || ""} />
        <meta property="og:type" content="book" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/30">
        {!isNative && <Background />}
        {showSidebar && <Sidebar />}

        <main className={cn(
          "relative z-10 py-6 max-w-[1800px] mx-auto pb-24 lg:pb-6",
          isNative ? "px-4 pt-4" : "pl-6 md:pl-32 pr-6 pt-10"
        )}>
          {/* Banner Image Background */}
          {bannerUrl && (
            <div className="absolute top-0 left-0 w-full h-[50vh] xl:h-[60vh] -z-10 overflow-hidden opacity-30 md:opacity-40">
              <img
                src={bannerUrl}
                alt="Banner"
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
            <span className="font-medium text-sm">Back</span>
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
                      In Tatakai DB
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                      <Database className="w-3.5 h-3.5" />
                      Not in DB yet
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
                      Edit content
                    </Button>
                  )}
                </div>

                {isAdmin && (
                  <ContentEditSheet
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    mediaType="manga"
                    title={displayTitle}
                    id={
                      (info.anilistId ? String(info.anilistId) : "") ||
                      info.tatakaiId ||
                      mangaId ||
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
                      format: info.format ?? "",
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

                {isNative && info && (
                  <MangaDownloadModal
                    isOpen={showMangaDownload}
                    onClose={() => setShowMangaDownload(false)}
                    chapters={chapters}
                    anilistId={Number(info.anilistId) || 0}
                    title={displayTitle}
                    posterUrl={coverImageSrc}
                    kind={mangaDownloadKind}
                  />
                )}

                <div className="flex flex-wrap gap-3 mb-6">
                  {displayRating && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber/20 text-amber">
                      <Star className="w-4 h-4 fill-amber" />
                      <span className="font-bold">{displayRating}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                    <BookOpen className="w-4 h-4" />
                    <span className="capitalize">{playlistMediaFormat}</span>
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
                      <span>{info.totalChapters} Chapters</span>
                    </div>
                  )}
                  {typeof info.totalVolumes === "number" && info.totalVolumes > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                      <BookOpen className="w-4 h-4" />
                      <span>{info.totalVolumes} Volumes</span>
                    </div>
                  )}
                </div>

                {info.authors && info.authors.length > 0 && (
                  <p className="text-muted-foreground text-sm md:text-base font-medium flex flex-wrap items-center gap-2 mb-4">
                    <Users className="w-4 h-4 shrink-0" />
                    By{" "}
                    {info.authors.map((author, idx) => (
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
                  {info.genres?.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => navigate(`/search?genre=${encodeURIComponent(genre)}&type=manga`)}
                      className="px-3 py-1.5 rounded-lg bg-muted text-sm font-medium hover:bg-primary/20 hover:text-primary transition-colors"
                    >
                      {genre}
                    </button>
                  ))}
                </div>

                {/* Tags in Hero */}
                {combinedMangaTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mr-1 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-primary" />
                      Tags:
                    </span>
                    {combinedMangaTags.slice(0, 14).map((tag: any) => (
                      <button
                        key={`hero-tag-${tag.id || tag.name}`}
                        type="button"
                        onClick={() => navigate(`/search?mangaTag=${encodeURIComponent(tag.name)}&type=manga`)}
                        className="px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-xs text-muted-foreground hover:text-primary transition-all flex items-center gap-1 group"
                        title={tag.rank ? `${tag.name} (${tag.rank}%) • Click to search` : `${tag.name} • Click to search`}
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
                  {hasSavedProgress ? "Continue Reading" : "Read From Chapter 1"}
                </button>
                <AddToPlaylistButton
                  animeId={`manga:${String(info.anilistId || info.malId || mangaId || "")}`}
                  animeName={displayTitle}
                  animePoster={info.coverImage || undefined}
                  mediaType="manga"
                  mediaFormat={playlistMediaFormat}
                  className="h-auto border border-white/15 bg-white/5 text-foreground px-6 py-3.5 rounded-xl font-bold hover:bg-white/10 active:scale-95 transition-all"
                />
                {isNative && (
                  <button
                    onClick={() => setShowMangaDownload(true)}
                    disabled={sortedChapters.length === 0}
                    className="flex items-center justify-center gap-2 border border-white/15 bg-white/5 text-foreground px-6 py-3.5 rounded-xl font-bold hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Download all chapters"
                  >
                    <Download className="w-5 h-5" />
                    Download
                  </button>
                )}
                {!user ? (
                  <button
                    onClick={() => navigate("/auth")}
                    className="flex items-center justify-center gap-2 border border-white/15 bg-white/5 text-foreground px-6 py-3.5 rounded-xl font-bold hover:bg-white/10 active:scale-95 transition-all"
                  >
                    <BookmarkPlus className="w-5 h-5" />
                    Sign In for Readlist
                  </button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        disabled={addToReadlist.isPending || removeFromReadlist.isPending}
                        className="flex items-center justify-center gap-2 border border-white/15 bg-white/5 text-foreground px-6 py-3.5 rounded-xl font-bold hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {currentReadlistStatus ? <BookmarkCheck className="w-5 h-5 text-primary" /> : <BookmarkPlus className="w-5 h-5" />}
                        {currentReadlistLabel ?? "Add to Readlist"}
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
                            Remove from Readlist
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
                    Synopsis
                  </h3>
                  <GlassPanel className="p-6 md:p-8 relative overflow-hidden group">
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap relative z-10 text-sm md:text-base">
                      {info.synopsis}
                    </p>
                  </GlassPanel>
                </section>
              )}

              {combinedMangaTags.length > 0 && (
                <section>
                  <h3 className="font-display text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                    <Palette className="w-5 h-5 text-primary" />
                    Tags
                  </h3>
                  <GlassPanel className="p-5">
                    <div className="flex flex-wrap gap-1.5">
                      {combinedMangaTags.slice(0, 40).map((tag: any) => (
                        <button
                          key={`tag-${tag.id ?? tag.name}`}
                          type="button"
                          onClick={() => navigate(`/search?mangaTag=${encodeURIComponent(tag.name)}&type=manga`)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors hover:border-primary/40 hover:text-primary flex items-center gap-1 ${
                            tag.weight === 'defining'
                              ? 'bg-primary/10 border-primary/20 text-primary/80'
                              : tag.weight === 'core'
                              ? 'bg-white/5 border-white/10 text-foreground/70'
                              : 'bg-white/[0.03] border-white/5 text-muted-foreground'
                          }`}
                          title={tag.rank ? `${tag.name} (${tag.rank}%) • Click to search` : `${tag.name} • Click to search`}
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
                    Series Tree
                  </h3>
                  <RelationTree relations={info.relations} />
                </section>
              )}

              {/* Characters Section — AnimePage-aligned GlassPanel cards */}
              {info.characters && info.characters.length > 0 && (
                <section className="mb-10">
                  <h3 className="font-display text-xl md:text-2xl font-bold mb-6 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Characters
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
                            {char.role || "Character"}
                          </p>
                        </div>
                      </GlassPanel>
                    ))}
                  </div>
                </section>
              )}

              {/* Chapters List */}
              <section id="manga-chapters-section">
                <div className="mb-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-display text-xl md:text-2xl font-bold flex items-center gap-2">
                      <Layers className="w-5 h-5 text-primary" />
                      Chapters
                    </h3>
                    <div className="flex items-center gap-2">
                      {isNative && (
                        <Button
                          size="sm"
                          onClick={() => setShowMangaDownload(true)}
                          disabled={chapters.length === 0}
                          className="h-8 gap-1.5 rounded-lg glow-primary text-xs font-bold"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download all
                        </Button>
                      )}
                      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Sort by
                      </label>
                      <select
                        value={chapterSortMode}
                        onChange={(event) => setChapterSortMode(event.target.value as ChapterSortMode)}
                        className="rounded-lg border border-white/10 bg-background/70 px-2.5 py-1.5 text-xs font-semibold"
                      >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                      </select>
                      <span className="text-sm font-bold text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        {isChapterListLoading
                          ? "Loading..."
                          : hasChapterFilters
                            ? `${filteredDisplayChapters.length} of ${displayChapters.length} matches`
                            : `${displayChapters.length} available`}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="relative flex-1 min-w-[220px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={chapterSearchTerm}
                        onChange={(event) => setChapterSearchTerm(event.target.value)}
                        placeholder="Search chapter number/title/provider"
                        className="w-full rounded-xl border border-white/10 bg-background/70 pl-9 pr-3 py-2 text-sm font-medium text-foreground focus:border-primary/50 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Volume
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
                        <option value="all">All volumes</option>
                        {volumeSections.map((volumeItem) => (
                          <option key={`volume-filter-${volumeItem.volume}`} value={volumeItem.volume}>
                            Volume {volumeItem.volume}
                          </option>
                        ))}
                      </select>
                    </div>

                    {(chapterSearchTerm.trim().length > 0 || selectedVolumeFilter != null) && (
                      <button
                        onClick={() => {
                          setChapterSearchTerm("");
                          setSelectedVolumeFilter(null);
                        }}
                        className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
                      >
                        Clear
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
                            title={`${group.length} chapters`}
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
                      <span>Loading chapters...</span>
                    </div>
                  </GlassPanel>
                ) : filteredDisplayChapters.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {chapterCards.map((chapter) => (
                      <div key={`${chapter.canonicalOrder}-${chapter.chapterNumber ?? "?"}`}>
                        {/* Kitsu chapter enrichment: thumbnail + synopsis */}
                        {((chapter as any)._kitsuThumbnail || (chapter as any)._kitsuSynopsis) && (
                          <div className="mb-1 flex gap-3 px-3 pt-3 pb-0">
                            {(chapter as any)._kitsuThumbnail && (
                              <img
                                src={(chapter as any)._kitsuThumbnail}
                                alt=""
                                className="w-16 h-10 object-cover rounded-lg border border-white/10 shrink-0"
                                loading="lazy"
                              />
                            )}
                            {(chapter as any)._kitsuSynopsis && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                {(chapter as any)._kitsuSynopsis}
                              </p>
                            )}
                          </div>
                        )}
                        <MangaChapterProviderRows
                          key={`${chapter.canonicalOrder}-${chapter.chapterNumber ?? "?"}`}
                          chapter={{
                          chapterNumber: chapter.chapterNumber ?? null,
                          chapterTitle: chapter.chapterTitle ?? null,
                          sources: (chapter.sources || []).map((src) => ({
                            provider: src.provider,
                            chapterKey: src.chapterKey || "",
                            providerChapterId: src.providerChapterId || src.chapterKey || "",
                            language: src.language ?? null,
                            scanlator: src.scanlator ?? null,
                          })),
                        }}
                        bestSource={getBestSource(chapter)}
                        preferredProvider={preferredProvider}
                        effectivePreferredLanguage={effectivePreferredLanguage}
                        onNavigate={(provider, chapterKey) => {
                          const src = chapter.sources?.find(
                            (s) => s.provider === provider && s.chapterKey === chapterKey,
                          );
                          // goToReader threads provider + providerChapterId +
                          // chapterNumber + chapterTitle and passes the chapter's
                          // reliability-sorted sources as fallback alternatives.
                          goToReader(
                            chapter,
                            src ?? { provider, chapterKey, providerChapterId: chapterKey, language: null, scanlator: null, releaseDate: null },
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
                        ? "No chapters available yet."
                        : hasChapterFilters
                          ? "No chapters match your current filters or search."
                          : "No chapters match the selected provider/language filters. Try Auto."}
                    </p>
                  </GlassPanel>
                )}
              </section>

              {volumeSections.length > 0 && (
                <section>
                  <h3 className="font-display text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-primary" />
                    Volumes
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {volumeSections.map((volumeItem) => (
                      <GlassPanel key={`volume-${volumeItem.volume}`} className="p-4 border border-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-base font-bold">Volume {volumeItem.volume}</p>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {volumeItem.readableCount}/{volumeItem.chapterCount} readable
                          </span>
                        </div>

                        <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
                          Chapters {volumeItem.rangeLabel}
                        </p>

                        {volumeItem.firstChapterTitle && (
                          <p className="mt-1 text-xs text-foreground/80 line-clamp-1">
                            Starts: {volumeItem.firstChapterTitle}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => goToReader(volumeItem.firstChapter, volumeItem.firstSource, 0)}
                            disabled={!volumeItem.firstChapterKey}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Read Volume
                          </button>

                          <button
                            onClick={() => goToReader(volumeItem.latestChapter, volumeItem.latestSource, 0)}
                            disabled={!volumeItem.latestChapterKey}
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Latest in Volume
                          </button>

                          <button
                            onClick={() => {
                              setSelectedVolumeFilter(volumeItem.volume);
                              setChapterSearchTerm("");
                              setSelectedChapterGroup(0);
                              setChapterSortMode("oldest");
                              const chapterSection = document.getElementById("manga-chapters-section");
                              chapterSection?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
                          >
                            View Chapters
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
                                {chapterItem.chapterNumber != null ? `Ch ${chapterItem.chapterNumber}` : "Open chapter"}
                              </button>
                            ))}
                            {volumeItem.readableChapters.length > 6 && (
                              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                                +{volumeItem.readableChapters.length - 6} more
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
                  Recommendations
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
                      <div key={`manga-rec-${card.id}`} className="flex flex-col">
                        <UnifiedMediaCard item={card} className="flex-1" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <GlassPanel className="p-5">
                    <p className="text-sm text-muted-foreground">
                      Recommendations are warming up. Check back in a moment.
                    </p>
                  </GlassPanel>
                )}
              </section>

              <section>
                <Comments
                  entityType="manga"
                  entityId={String(mangaId || info.anilistId || info.malId || "")}
                  entityName={displayTitle}
                />
              </section>
            </div>
            <div className="space-y-4">
              <GlassPanel className="p-5">
                <h4 className="font-display font-bold mb-3">Metadata</h4>
                <div className="mb-4">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Preferred source
                  </label>
                  <select
                    value={preferredProvider}
                    onChange={(event) => setPreferredProvider(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-background/70 px-3 py-2 text-sm font-medium text-foreground focus:border-primary/50 focus:outline-none"
                  >
                    <option value="auto">Auto (Best source per chapter)</option>
                    {providerOptions.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Preferred language
                  </label>
                  <select
                    value={preferredLanguage}
                    onChange={(event) => setPreferredLanguage(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-background/70 px-3 py-2 text-sm font-medium text-foreground focus:border-primary/50 focus:outline-none"
                  >
                    <option value="auto">
                      {profilePreferredMangaLanguage === "auto"
                        ? "Auto (All languages)"
                        : `Auto (Display setting: ${formatLanguageLabel(profilePreferredMangaLanguage)})`}
                    </option>
                    {languageOptions.map((language) => (
                      <option key={language.value} value={language.value}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Status: <span className="text-foreground">{info.status || "unknown"}</span></p>
                  <p>Format: <span className="text-foreground">{info.mediaType || "manga"}</span></p>
                  <p>Total chapters: <span className="text-foreground">{info.totalChapters ?? anilistMetadata?.chapters ?? "?"}</span></p>
                  <p>Total volumes: <span className="text-foreground">{info.totalVolumes ?? anilistMetadata?.volumes ?? "?"}</span></p>

                  {info.publishers && info.publishers.length > 0 && (
                    <p>Publishers: <span className="text-foreground">{info.publishers.join(", ")}</span></p>
                  )}

                  {jikanData?.serializations && jikanData.serializations.length > 0 && (
                    <p>Serialization: <span className="text-foreground">{jikanData.serializations.map((s: any) => s.name).join(", ")}</span></p>
                  )}

                  {info.yearStart && (
                    <p>Aired: <span className="text-foreground">{info.yearStart}{info.yearEnd ? ` to ${info.yearEnd}` : " (Ongoing)"}</span></p>
                  )}
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Genres
                  </p>
                  {info.genres && info.genres.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {info.genres.map((genre) => (
                        <button
                          key={`meta-genre-${genre}`}
                          type="button"
                          onClick={() => navigate(`/manga/genre/${encodeURIComponent(genre)}`)}
                          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          {genre}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No genres available.</p>
                  )}
                </div>

                {Array.isArray(anilistMangaMeta?.tags) && anilistMangaMeta.tags.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      AniList Tags
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {anilistMangaMeta.tags.filter((tag: any) => tag?.name).map((tag: any) => (
                        <button
                          key={tag.name}
                          type="button"
                          title={tag.isAdult ? "Adult AniList tag" : "Search this AniList tag"}
                          onClick={() => navigate(`/search?mangaTag=${encodeURIComponent(tag.name)}&type=manga`)}
                          className="rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary/80 transition-colors hover:border-primary/40 hover:bg-primary/15"
                        >
                          #{tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* MangaBaka enrichment: cross-site ratings */}
                {mangaBakaData && Object.keys(mangaBakaData.sources).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Cross-site Ratings
                    </p>
                    <div className="space-y-1.5">
                      {Object.entries(mangaBakaData.sources)
                        .filter(([, src]) => src.ratingNormalized !== null)
                        .sort(([, a], [, b]) => (b.ratingNormalized ?? 0) - (a.ratingNormalized ?? 0))
                        .map(([key, src]) => {
                          const label = key === 'anilist' ? 'AniList' : key === 'my_anime_list' ? 'MAL' : key === 'kitsu' ? 'Kitsu' : key === 'manga_updates' ? 'MU' : key === 'anime_planet' ? 'AP' : key === 'shikimori' ? 'Shikimori' : key === 'anime_news_network' ? 'ANN' : key.replace(/_/g, ' ');
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
                {mangaBakaData && mangaBakaData.publishers.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Publishers
                    </p>
                    <div className="space-y-1">
                      {mangaBakaData.publishers.map((pub, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-foreground/80">{pub.name}</span>
                          {pub.type && (
                            <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-white/5">
                              {pub.type}{pub.note ? ` · ${pub.note}` : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* MangaBaka: anime coverage */}
                {mangaBakaData?.animeCoverage && mangaBakaData.hasAnime && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Anime Coverage
                    </p>
                    <p className="text-xs text-foreground/80">
                      {mangaBakaData.animeCoverage.start && `From: ${mangaBakaData.animeCoverage.start}`}
                      {mangaBakaData.animeCoverage.end && ` → ${mangaBakaData.animeCoverage.end}`}
                    </p>
                  </div>
                )}

                {/* MangaBaka: external links */}
                {mangaBakaData && mangaBakaData.links.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      External Links
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {mangaBakaData.links.slice(0, 6).map((link, i) => (
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
