import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMangaDetail, useMangaChapters } from "@/hooks/useMangaData";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Skeleton } from "@/components/ui/skeleton-custom";
import { UnifiedMediaCard, type UnifiedMediaCardProps } from "@/components/UnifiedMediaCard";
import { EpisodeComments } from "@/components/video/EpisodeComments";
import { AddToPlaylistButton } from "@/components/playlist/AddToPlaylistButton";
import { getProxiedImageUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { searchManga } from "@/services/manga.service";
import { inferMangaAdultFlag } from "@/lib/contentSafety";
import type { MangaSearchItem } from "@/types/manga";
import {
  ArrowLeft,
  BookOpen,
  Star,
  Sparkles,
  Layers,
  Users,
  AlertTriangle,
  BookmarkPlus,
  BookmarkCheck,
  Loader2,
  Search,
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { useContentSafetySettings } from "@/hooks/useContentSafetySettings";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMangaReadlistItem,
  useRemoveFromMangaReadlist,
  useUpsertMangaReadlist,
} from "@/hooks/useMangaReadlist";

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

const queryAniListBanner = async (id: number) => {
  try {
    const query = `
      query ($id: Int) {
        Media (id: $id, type: MANGA) {
          bannerImage
        }
      }
    `;
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { id } })
    });
    const data = await res.json();
    return data?.data?.Media?.bannerImage;
  } catch {
    return null;
  }
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
  const { user, profile } = useAuth();
  const { settings: contentSafetySettings, updateSettings: updateContentSafetySettings } = useContentSafetySettings();
  const [allowAdultForSession, setAllowAdultForSession] = useState(false);

  const { data: mangaData, isLoading: loadingInfo, error } = useMangaDetail(mangaId);
  const { data: chapterData, isLoading: loadingChapters } = useMangaChapters(mangaId);
  const { data: readlistEntry } = useMangaReadlistItem(mangaId);
  const addToReadlist = useUpsertMangaReadlist();
  const removeFromReadlist = useRemoveFromMangaReadlist();
  const rawCoverImage = mangaData?.detail?.coverImage || "";
  const [coverImageSrc, setCoverImageSrc] = useState<string>(() => getProxiedImageUrl(rawCoverImage));
  const [coverFallbackTried, setCoverFallbackTried] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  useEffect(() => {
    setCoverFallbackTried(false);
    setCoverImageSrc(getProxiedImageUrl(rawCoverImage));
  }, [rawCoverImage]);

  useEffect(() => {
    const anilistId = mangaData?.detail?.anilistId;
    if (anilistId) {
      queryAniListBanner(anilistId).then(banner => {
        if (banner) setBannerUrl(getProxiedImageUrl(banner));
      });
    }
  }, [mangaData?.detail?.anilistId]);

  const chapters = useMemo(() => chapterData?.mappedChapters || [], [chapterData?.mappedChapters]);
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

  const getBestSourceKey = (chapter: (typeof sortedChapters)[number] | undefined) => {
    return getBestSource(chapter)?.chapterKey || null;
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
          readableChapters: readable.map((entry) => ({
            chapterKey: entry.source?.chapterKey || "",
            chapterNumber: entry.chapter.chapterNumber,
            chapterTitle: entry.chapter.chapterTitle,
          })),
        };
      });
  }, [sortedChapters, preferredProvider, effectivePreferredLanguage]);

  // Desktop vs Mobile sidebar display
  const showSidebar = !isNative;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mangaId]);

  useEffect(() => {
    setAllowAdultForSession(false);
    setPreferredProvider("auto");
    setPreferredLanguage(profilePreferredMangaLanguage);
    setChapterSortMode("newest");
    setChapterSearchTerm("");
    setSelectedChapterGroup(0);
    setSelectedVolumeFilter(null);
  }, [mangaId, profilePreferredMangaLanguage]);

  useEffect(() => {
    if (preferredLanguage !== "auto") return;
    setPreferredLanguage(profilePreferredMangaLanguage);
  }, [preferredLanguage, profilePreferredMangaLanguage]);

  useEffect(() => {
    if (preferredProvider === "auto") return;
    if (!providerOptions.includes(preferredProvider)) {
      setPreferredProvider("auto");
    }
  }, [preferredProvider, providerOptions]);

  useEffect(() => {
    if (preferredLanguage === "auto") return;
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

  const recommendationTerms = useMemo(() => {
    if (!info) return [];

    const terms = [
      info.canonicalTitle,
      info.title?.english,
      info.title?.romaji,
      ...info.genres.slice(0, 3).map((genre) => `${genre} manga`),
    ];

    return Array.from(
      new Set(
        terms
          .map((term) => String(term || "").trim())
          .filter((term) => term.length > 0),
      ),
    ).slice(0, 4);
  }, [info]);

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
          searchManga(term, 1, index === 0 ? 12 : 10, { provider: "all" }),
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

  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {!isNative && <Background />}
        {showSidebar && <Sidebar />}
        <main className={cn("relative z-10 py-6 max-w-[1800px] mx-auto", isNative ? "p-6" : "pl-6 md:pl-32 pr-6")}>
          <div className="space-y-8">
            <Skeleton className="h-8 w-32" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Skeleton className="aspect-[3/4] rounded-3xl" />
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
          <GlassPanel className="p-6 md:p-8 border border-amber-500/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 mt-1" />
              <div>
                <h1 className="text-2xl md:text-3xl font-black">Sensitive Content Warning</h1>
                <p className="mt-2 text-muted-foreground">
                  This manga is marked as mature content. Continue only if you are comfortable viewing 18+ material.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-muted-foreground">
                Title: <span className="text-foreground font-semibold">{info.canonicalTitle || info.title?.english || info.title?.romaji || "Unknown"}</span>
              </p>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-rose-500/30">
              <div className="relative">
                <img
                  src="/manga18+.jpg"
                  alt="18+ Content Banner"
                  className="h-32 w-full object-cover md:h-40"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-black/70" />
                <div className="absolute inset-0 flex items-end p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-100">
                    Mature Content • 18+ Only
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 rounded-lg border border-white/15 bg-white/5 text-sm font-bold hover:bg-white/10 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={() => setAllowAdultForSession(true)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 transition-all"
              >
                Continue
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
      navigate(
        `/manga/read/${mangaId}?chapterKey=${encodeURIComponent(readlistEntry.last_chapter_key)}&page=${savedPage}`,
      );
      return;
    }

    if (visibleChapters.length > 0 || sortedChapters.length > 0) {
      const firstReadableChapter = visibleChapters[0] || sortedChapters[0];
      const sourceKey = getBestSourceKey(firstReadableChapter);
      if (sourceKey) {
        navigate(`/manga/read/${mangaId}?chapterKey=${encodeURIComponent(sourceKey)}&page=0`);
      }
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

  const displayRating =
    typeof info.score === "number" && Number.isFinite(info.score)
      ? (info.score / 10).toFixed(1)
      : null;

  return (
    <>
      <Helmet>
        <title>{displayTitle} - Read Manga | Tatakai</title>
        <meta name="description" content={info.synopsis?.slice(0, 160) || `Read ${displayTitle} online for free.`} />
        <meta property="og:title" content={`${displayTitle} - Read Manga | Tatakai`} />
        <meta property="og:description" content={info.synopsis?.slice(0, 160) || `Read ${displayTitle} online for free.`} />
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

          {/* Hero Section */}
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] xl:grid-cols-[350px_1fr] gap-8 mb-12">
            {/* Poster */}
            <div className="relative mx-auto lg:mx-0 w-full max-w-[280px] lg:max-w-none group">
              <div className="aspect-[3/4] rounded-3xl overflow-hidden shadow-2xl relative ring-1 ring-white/10 group-hover:ring-primary/50 transition-all duration-500 z-10 bg-background/80">
                <img
                  src={coverImageSrc}
                  alt={displayTitle}
                  className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
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
                <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10 pointer-events-none" />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background/90 via-background/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            </div>

            {/* Info */}
            <div className="flex flex-col justify-end space-y-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  {info.status && (
                    <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-xs font-bold uppercase tracking-wider backdrop-blur-sm border border-primary/20">
                      {info.status}
                    </span>
                  )}
                  {info.mediaType && (
                    <span className="px-3 py-1 rounded-full bg-white/5 text-foreground text-xs font-bold uppercase tracking-wider backdrop-blur-sm border border-white/10 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      {info.mediaType}
                    </span>
                  )}
                  {displayRating && (
                    <span className="px-3 py-1 rounded-full bg-amber/10 text-amber text-xs font-bold uppercase tracking-wider backdrop-blur-sm border border-amber/20 flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      {displayRating}
                    </span>
                  )}
                  {typeof info.totalVolumes === "number" && info.totalVolumes > 0 && (
                    <span className="px-3 py-1 rounded-full bg-white/5 text-foreground text-xs font-bold uppercase tracking-wider backdrop-blur-sm border border-white/10 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      {info.totalVolumes} Volumes
                    </span>
                  )}
                </div>

                <h1 className="text-3xl md:text-5xl lg:text-6xl font-display font-bold leading-tight tracking-tight lg:leading-[1.1]">
                  {displayTitle}
                </h1>

                {info.authors && info.authors.length > 0 && (
                  <p className="text-muted-foreground text-sm md:text-base font-medium flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    By {info.authors.join(", ")}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-4">
                  {info.genres?.map(genre => (
                    <span key={genre} className="px-2.5 py-1 rounded-md bg-white/5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider border border-white/5">
                      {genre}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-4 pt-4">
                <button
                  onClick={handleReadNow}
                  disabled={sortedChapters.length === 0}
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-bold hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed group w-full sm:w-auto"
                >
                  <BookOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  {hasSavedProgress ? "Continue Reading" : "Read From Chapter 1"}
                </button>
                <AddToPlaylistButton
                  animeId={`manga:${String(info.anilistId || info.malId || mangaId || "")}`}
                  animeName={displayTitle}
                  animePoster={info.coverImage || undefined}
                  mediaType="manga"
                  className="h-auto border border-white/15 bg-white/5 text-foreground px-6 py-4 rounded-2xl font-bold hover:bg-white/10 active:scale-95 transition-all w-full sm:w-auto"
                />
                <button
                  onClick={handleToggleReadlist}
                  disabled={addToReadlist.isPending || removeFromReadlist.isPending}
                  className="flex items-center justify-center gap-2 border border-white/15 bg-white/5 text-foreground px-6 py-4 rounded-2xl font-bold hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  {isInReadlist ? <BookmarkCheck className="w-5 h-5 text-primary" /> : <BookmarkPlus className="w-5 h-5" />}
                  {!user ? "Sign In for Readlist" : isInReadlist ? "In Readlist" : "Add to Readlist"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8">
            <div className="space-y-8">
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

              {/* Chapters List */}
              <section id="manga-chapters-section">
                <div className="mb-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-display text-xl md:text-2xl font-bold flex items-center gap-2">
                      <Layers className="w-5 h-5 text-primary" />
                      Chapters
                    </h3>
                    <div className="flex items-center gap-2">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {chapterCards.map((chapter) => {
                      const sourceKey = getBestSourceKey(chapter);
                      const highlightedSource = getBestSource(chapter);
                      const releaseDate =
                        highlightedSource?.releaseDate ||
                        chapter.sources?.find((source) => source.releaseDate)?.releaseDate;

                      const languageBadges = Array.from(
                        new Set(chapter.sources?.map((source) => formatLanguageLabel(source.language)) || []),
                      ).slice(0, 3);

                      return (
                        <button
                          key={`${chapter.canonicalOrder}-${sourceKey || "no-source"}`}
                          onClick={() => {
                            if (!sourceKey) return;
                            navigate(`/manga/read/${mangaId}?chapterKey=${encodeURIComponent(sourceKey)}&page=0`);
                          }}
                          className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-primary/10 transition-all text-left group flex items-center justify-between"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                              {chapter.chapterTitle || `Chapter ${chapter.chapterNumber ?? "?"}`}
                            </p>
                            {typeof chapter.volume === "number" && chapter.volume > 0 && (
                              <p className="text-[10px] font-bold uppercase tracking-wider text-primary/90 mt-1">
                                Volume {chapter.volume}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">
                              {releaseDate ? new Date(releaseDate).toLocaleDateString() : "Unknown date"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {chapter.sources?.slice(0, 2).map((source) => {
                                const sourceLanguage = formatLanguageLabel(source.language);
                                const providerMatch =
                                  preferredProvider !== "auto" && source.provider === preferredProvider;
                                const languageMatch =
                                  effectivePreferredLanguage !== "auto" &&
                                  normalizeLanguageKey(source.language) === effectivePreferredLanguage;

                                return (
                                  <span
                                    key={`${chapter.canonicalOrder}-${source.provider}-${sourceLanguage}`}
                                    className={cn(
                                      "rounded-md px-1.5 py-0.5 text-[9px] uppercase tracking-wider border",
                                      providerMatch || languageMatch
                                        ? "border-primary/50 bg-primary/15 text-primary"
                                        : "border-white/10 bg-white/5 text-muted-foreground",
                                    )}
                                  >
                                    {source.provider} • {sourceLanguage}
                                  </span>
                                );
                              })}

                              {chapter.sources.length > 2 && (
                                <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                                  +{chapter.sources.length - 2} sources
                                </span>
                              )}

                              {languageBadges.map((language) => (
                                <span
                                  key={`${chapter.canonicalOrder}-lang-${language}`}
                                  className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-emerald-300"
                                >
                                  {language}
                                </span>
                              ))}
                            </div>
                          </div>
                          <BookOpen className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
                        </button>
                      );
                    })}
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
                            onClick={() => {
                              if (!mangaId || !volumeItem.firstChapterKey) return;
                              navigate(`/manga/read/${mangaId}?chapterKey=${encodeURIComponent(volumeItem.firstChapterKey)}&page=0`);
                            }}
                            disabled={!volumeItem.firstChapterKey}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Read Volume
                          </button>

                          <button
                            onClick={() => {
                              if (!mangaId || !volumeItem.latestChapterKey) return;
                              navigate(`/manga/read/${mangaId}?chapterKey=${encodeURIComponent(volumeItem.latestChapterKey)}&page=0`);
                            }}
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
                                onClick={() => {
                                  if (!mangaId || !chapterItem.chapterKey) return;
                                  navigate(`/manga/read/${mangaId}?chapterKey=${encodeURIComponent(chapterItem.chapterKey)}&page=0`);
                                }}
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

                {loadingRecommendations ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <Skeleton key={`rec-skeleton-${index}`} className="aspect-[3/4] rounded-2xl" />
                    ))}
                  </div>
                ) : recommendationCards.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {recommendationCards.map((card) => (
                      <UnifiedMediaCard key={`manga-rec-${card.id}`} item={card} />
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
                <EpisodeComments
                  animeId={`manga:${String(mangaId || info.anilistId || info.malId || "")}`}
                  animeName={displayTitle}
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
                  <p>Total chapters: <span className="text-foreground">{info.totalChapters ?? "?"}</span></p>
                  <p>Total volumes: <span className="text-foreground">{info.totalVolumes ?? "?"}</span></p>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Genres
                  </p>
                  {info.genres && info.genres.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {info.genres.map((genre) => (
                        <span
                          key={`meta-genre-${genre}`}
                          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No genres available.</p>
                  )}
                </div>
              </GlassPanel>
            </div>
          </div>
        </main>
        <MobileNav />
      </div>
    </>
  );
}