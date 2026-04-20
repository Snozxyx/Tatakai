import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ThemeSelector } from '@/components/settings/ThemeSelector';
import { VideoSettingsPanel } from '@/components/video/VideoSettingsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, List, Sparkles, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useContentSafetySettings } from '@/hooks/useContentSafetySettings';
import { useUpdateProfilePrivacy } from '@/hooks/useProfileFeatures';
import { useClearAllWatchHistory } from '@/hooks/useWatchHistory';
import {
  getMalAuthUrl,
  fetchMalUserList,
  fetchMalMangaList,
  mapMalStatusToTatakai,
  mapMalMangaStatusToTatakai,
  disconnectMal,
  updateMalAnimeStatus,
  updateMalMangaStatus,
} from '@/lib/mal';
import {
  getAniListAuthUrl,
  disconnectAniList,
  fetchAniListUserList,
  fetchAniListMangaList,
  updateAniListAnimeStatus,
  updateAniListMangaStatus,
  mapAniListMangaStatusToTatakai,
  mapTatakaiMangaStatusToAniList,
} from '@/lib/externalIntegrations';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Palette, Film, Monitor, Info, Link2, Eye, EyeOff, Globe, CheckCircle, ExternalLink, Shield, History, Trash2, Search, Bell, MessageCircle, Laptop
} from 'lucide-react';

type PreferredMangaLanguage = 'auto' | 'jp' | 'en' | 'kr' | 'zh';
type ImportMediaType = 'anime' | 'manga';

type ExternalImportItem = {
  malId: number | null;
  anilistId: number | null;
  malTitle: string;
  targetId: string;
  confidence: 'exact' | 'new' | 'guessed';
  poster: string | null;
  status: string;
  progress?: number | null;
  selected: boolean;
};

const toSlugValue = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const buildFallbackMangaId = (title: string, malId?: number | null, anilistId?: number | null) => {
  if (anilistId) return `anilist:${anilistId}`;
  if (malId) return `mal:${malId}`;

  const slug = toSlugValue(title);
  return slug ? `slug:${slug}` : '';
};

const toPositiveChapterProgress = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
};

const normalizeMangaSyncStatus = (status: unknown, chapterProgress?: number | null): string => {
  const normalizedStatus = String(status || 'plan_to_read').trim().toLowerCase();
  if ((chapterProgress ?? 0) > 0 && normalizedStatus === 'plan_to_read') {
    return 'reading';
  }
  return normalizedStatus || 'plan_to_read';
};

const normalizePreferredMangaLanguage = (value: unknown): PreferredMangaLanguage => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'jp' || normalized.startsWith('ja') || normalized.includes('japanese')) return 'jp';
  if (normalized === 'kr' || normalized.startsWith('ko') || normalized.includes('korean')) return 'kr';
  if (normalized === 'zh' || normalized.startsWith('zh') || normalized.includes('chinese')) return 'zh';
  if (normalized === 'en' || normalized.startsWith('en') || normalized.includes('english')) return 'en';
  return 'auto';
};

const FALLBACK_CHANGELOG = [
  {
    version: '5.2.0',
    date: '2026-04-20',
    changes: [
      'Source Host Priority: JustAnime/Goku stream selection now prefers vod.netmagcdn.com:2228 before watching.onl variants',
      'Preview Playback Stability: Fixed anime card/trending preview edge cases for non-HLS sources and retry behavior',
      'Homepage Startup Optimization: Deferred non-critical sections and startup listeners to improve first paint responsiveness',
      'Proxy Reliability Upgrade: Added bounded retries, no-repeat proxy attempts, and in-flight dedupe for proxy requests',
      'Subtitle Robustness: Added subtitle normalization-to-VTT and improved fetch fallbacks for desktop and mobile players',
      'Editor Draft Recovery: Added autosave/restore for tierlist and playlist editing with stale draft cleanup',
      'Auth/Session Bootstrap: Added fail-fast timeouts and reduced startup background request pressure',
    ],
  },
  {
    version: '5.0.1',
    date: '2026-04-18',
    changes: [
      'Producer Search Routing: Producer chips now open the dedicated producer search route and the search page loads producer results directly',
      'Tierlist Character Links: Tierlist character cards now prefer MAL numeric IDs for stable character page navigation',
      'Curated Discovery Lanes: Added manual homepage curation tools plus new manga/anime discovery lanes and quick filters',
      'Admin Surface Expansion: Added API health, canonical snapshot, and source validation tools to the admin dashboard',
      'Playback and Proxy Resilience: Improved codec recovery, source blocking, and provider refresh behavior during stream failures',
      'Version Sync: Bumped the package version and aligned the settings changelog with the new release entry',
    ],
  },
  {
    version: '5.0.0',
    date: '2026-04-08',
    changes: [
      'V5 Release Surface: Added hero release messaging across home, settings, and popup entry points for the new generation launch',
      'V4 Announcement Popup Migration: Repurposed the legacy V4 popup into a V5 launch popup with direct link to Settings > Changelog',
      'Mobile Rollout Behavior: While the announcement popup is active, mobile bottom navigation is disabled and hidden to prevent accidental route changes',
      'Motion Prompt Timing: Reduce-motion prompt is deferred for 1 minute during the mobile launch popup window',
      'Manga V5 Overhaul: Added Manga release banner, hero spotlight carousel, trending grid, index showcase, continue-reading rail, and infinite genre sections',
      'Manga Detail Upgrade: Added chapter search, chapter grouping for large catalogs, provider/language filters, and clickable volume-to-chapter navigation',
      'Manga Reader Upgrade: Improved source handling, chapter controls, keyboard shortcuts, and polished reader state persistence flow',
      'Content Safety Controls: Added mature manga visibility controls, warnings, and blur-aware card rendering',
      'Architecture Refresh: Split large pages into modular route folders (base/auth/watch/profile/admin/legal/error) and added AppRoutes composition',
      'Provider Core Upgrade: Added multi-provider aggregation pipeline (Animelok, AnimeKai, Animepahe, Animeya, WatchAW, DesiDub, Toonstream, ToonWorld, Hindi APIs)',
      'Playback Reliability: Added source health scoring, preflight checks, adaptive failover, referer retry fallback, and telemetry storage for stream diagnostics',
      'Integrations: MAL and AniList sync now map titles more reliably and import lists more accurately for anime and manga',
      'Watch2Together: Added reconnect recovery, host transfer controls, synced countdown start, and chat export support',
      'Search and Discovery: Added cleaner anime/character search filters and improved screenshot matching controls',
      'Recommendations: Added explainability cards and user feedback persistence for recommendation quality tuning',
      'Security and Ops: Strengthened auth/proxy handling, hardened headers, and expanded CI quality gates (lint/type/test)',
    ],
  },
  {
    version: '4.1.20',
    date: '2026-03-03',
    changes: [
      'Release Sync: Synchronized version metadata in package files, changelog, and desktop splash screen',
      'Publish Consistency: Finalized v4.1.20 release alignment for tagging and deployment',
    ],
  },
  {
    version: '4.1.19',
    date: '2026-03-03',
    changes: [
      'Production Security: Request signature verification is now production-only with replay protection',
      'Public API Stability: Signature checks are selective so public scraper routes remain accessible',
      'Review Popup Webhook: Review submissions now trigger Discord notifications via secure backend webhook proxy',
      'Security Hardening: Discord webhook URLs remain server-side env vars only and are never exposed in frontend',
      'Version Sync: Updated app version references and desktop splash screen to match release version',
    ],
  },
  {
    version: '4.1.18',
    date: '2026-02-28',
    changes: [
      'High Quality Covers: Anime info page now fetches full-size cover art from Jikan (MAL) API',
      'Achievement System: 12 rank-tier achievements from Filler Watcher to Hashira',
      'Admin: Grant and revoke achievements manually per-user via Admin panel',
      'Profile Rank: Manual achievement grants now reflect in rank badge and name color',
      'Comments: Fixed focus border color on comment textarea',
      'Comments: Rank name animated effects now visible in episode comments',
      'Comments: Added anime title and episode context pill to comments header',
      'Anime Page: Uses unified EpisodeComments component for consistent styling',
      'Card Images: All anime cards upgraded to AniList large CDN resolution',
    ],
  },
  {
    version: '4.0.0',
    date: '2026-01-26',
    changes: [
      'Social Marketplace: Added contributor profiles and clickable usernames',
      'Custom Playback Speed: Set any video speed from 0.1x to 10.0x',
      'Transparency: View your own pending marketplace items immediately',
      'Global Scraper Overhaul: Fixed 404/500 errors on Desidubanime and Aniworld',
      'Primary Server Fix: Restored HD-1 and HD-2 via optimized direct API access',
      'Stability: Increased fetch timeouts and improved HLS referer handling'
    ],
  },
  {
    version: '2.0.0',
    date: '2026-01-08',
    changes: [
      'Added upcoming anime section from Jikan API',
      'Added changelog section in settings',
      'Fixed Vercel routing for direct URL access',
      'Enhanced privacy settings for watchlist and history',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-01-03',
    changes: [
      'Added playlists feature',
      'Added tier lists with sharing',
      'Added social links to profiles',
      'Public profile support with privacy controls',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-01-02',
    changes: [
      'Added admin dashboard',
      'Enhanced video player settings',
      'Added MyAnimeList and AniList integrations',
    ],
  },
  {
    version: '1.7.0',
    date: '2025-12-31',
    changes: [
      'Initial release with core features',
      'Multi-theme support',
      'Watch history tracking',
      'Watchlist management',
    ],
  },
];

import { DesktopSettings } from '@/components/settings/DesktopSettings';
import { MobileSettings } from '@/components/settings/MobileSettings';
import { useIsNativeApp } from '@/hooks/useIsNativeApp';
import { Capacitor } from '@capacitor/core';

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const isNative = useIsNativeApp();
  const isMobile = Capacitor.isNativePlatform();
  const requestedTab = searchParams.get('tab');

  const { user, profile, refreshProfile } = useAuth();
  const { themes, theme, setTheme, reduceMotion, setReduceMotion, highContrast, setHighContrast } = useTheme();
  const { settings: contentSafetySettings, updateSettings: updateContentSafetySettings } = useContentSafetySettings();
  const updatePrivacy = useUpdateProfilePrivacy();
  const clearHistory = useClearAllWatchHistory();
  const [isPublic, setIsPublic] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState(requestedTab || 'appearance');

  useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);


  // Use hardcoded changelog
  const CHANGELOG = FALLBACK_CHANGELOG;

  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [malImportList, setMalImportList] = useState<ExternalImportItem[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [searchingIdx, setSearchingIdx] = useState<number | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [manualSearchResults, setManualSearchResults] = useState<any[]>([]);
  const [isManualSearching, setIsManualSearching] = useState(false);
  const [malAutoDelete, setMalAutoDelete] = useState(false);
  const [malSyncTarget, setMalSyncTarget] = useState<ImportMediaType>('anime');

  // AniList State
  const [isAniListImporting, setIsAniListImporting] = useState(false);
  const [isAniListExporting, setIsAniListExporting] = useState(false);
  const [aniListSyncTarget, setAniListSyncTarget] = useState<ImportMediaType>('anime');
  const [importSource, setImportSource] = useState<'mal' | 'anilist'>('mal');
  const [importMediaType, setImportMediaType] = useState<ImportMediaType>('anime');
  const [preferredTitleLanguage, setPreferredTitleLanguage] = useState<'romaji' | 'english' | 'native'>('romaji');
  const [preferredMangaLanguage, setPreferredMangaLanguage] = useState<PreferredMangaLanguage>('auto');
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (profile) {
      setIsPublic(profile.is_public ?? true);
      setMalAutoDelete(profile.mal_auto_delete ?? false);
      setPreferredTitleLanguage(profile.preferred_title_language || 'romaji');
      setPreferredMangaLanguage(normalizePreferredMangaLanguage((profile as any).preferred_manga_language));
    }
  }, [profile]);

  const handleTitleLanguageChange = async (value: 'romaji' | 'english' | 'native') => {
    if (!user?.id) {
      toast.error('Please sign in to save title language preferences');
      return;
    }

    const previousValue = preferredTitleLanguage;
    setPreferredTitleLanguage(value);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_title_language: value })
        .eq('user_id', user.id);

      if (error) throw error;
      await refreshProfile();
      toast.success(`Title language preference updated to ${value}`);
    } catch (err) {
      setPreferredTitleLanguage(previousValue);
      toast.error('Failed to update title language preference');
    }
  };

  const handleMangaLanguageChange = async (value: PreferredMangaLanguage) => {
    if (!user?.id) {
      toast.error('Please sign in to save manga language preferences');
      return;
    }

    const previousValue = preferredMangaLanguage;
    setPreferredMangaLanguage(value);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_manga_language: value })
        .eq('user_id', user.id);

      if (error) throw error;
      await refreshProfile();
      toast.success('Preferred manga language updated');
    } catch (err) {
      setPreferredMangaLanguage(previousValue);
      toast.error('Failed to update manga language preference');
    }
  };

  const handleMalAutoDeleteChange = async (enabled: boolean) => {
    if (!user?.id) {
      toast.error('Please sign in to update MAL sync settings');
      return;
    }

    setMalAutoDelete(enabled);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ mal_auto_delete: enabled })
        .eq('user_id', user.id);

      if (error) throw error;
      await refreshProfile();
      toast.success(enabled ? 'MAL Auto-Sync Deletions enabled' : 'MAL Auto-Sync Deletions disabled');
    } catch (err) {
      setMalAutoDelete(!enabled);
      toast.error('Failed to update MAL auto-delete setting');
    }
  };

  const handlePrivacyChange = async (value: boolean) => {
    setIsPublic(value);
    try {
      await updatePrivacy.mutateAsync(value);
      toast.success(value ? 'Profile is now public' : 'Profile is now private');
    } catch (error) {
      setIsPublic(!value);
      toast.error('Failed to update privacy settings');
    }
  };

  const handleImportFromMal = async () => {
    if (isImporting) return;
    setIsImporting(true);
    setImportSource('mal');
    setImportMediaType('anime');
    const toastId = toast.loading('Fetching your MyAnimeList list...');

    try {
      if (!profile?.mal_access_token) {
        throw new Error('MAL is not connected');
      }

      const malList = await fetchMalUserList();
      console.log(`[Settings] Received ${malList?.length || 0} items from MAL`);

      if (!malList || malList.length === 0) {
        toast.dismiss(toastId);
        toast.info('Your MyAnimeList list is empty.');
        setIsImporting(false);
        return;
      }

      toast.loading(`Preparing ${malList.length} MAL items using ID mapping...`, { id: toastId });

      // Fetch existing watchlist to prevent duplicates
      const { data: existingWatchlist } = await supabase
        .from('watchlist')
        .select('anime_id, mal_id, anilist_id')
        .eq('user_id', user!.id);

      const existingMalIds = new Map<number, string>();
      existingWatchlist?.forEach(item => {
        if (item.mal_id) existingMalIds.set(Number(item.mal_id), item.anime_id);
      });

      // Prepare processed list using stable MAL IDs (no title-based auto matching)
      const processedItems: ExternalImportItem[] = [];

      for (let i = 0; i < malList.length; i++) {
        const item = malList[i];
        const malId = item.node.id;
        const malTitle = item.node.title;

        const mappedId = existingMalIds.get(malId);
        const targetId = mappedId || `mal-${malId}`;
        const confidence: 'exact' | 'new' = mappedId ? 'exact' : 'new';

        processedItems.push({
          malId,
          anilistId: null,
          malTitle,
          targetId,
          confidence,
          poster: item.node.main_picture?.large || item.node.main_picture?.medium || null,
          status: mapMalStatusToTatakai(item.list_status.status),
          selected: true
        });
      }

      setMalImportList(processedItems);
      setIsImportModalOpen(true);
      toast.dismiss(toastId);
    } catch (err: any) {
      console.error('[Settings] Preparation failed:', err);
      toast.error(`Preparation failed: ${err.message}`, { id: toastId });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportMangaFromMal = async () => {
    if (isImporting) return;
    setIsImporting(true);
    setImportSource('mal');
    setImportMediaType('manga');
    const toastId = toast.loading('Fetching your MyAnimeList manga list...');

    try {
      if (!profile?.mal_access_token) {
        throw new Error('MAL is not connected');
      }

      const malList = await fetchMalMangaList();
      if (!malList || malList.length === 0) {
        toast.dismiss(toastId);
        toast.info('Your MyAnimeList manga list is empty.');
        return;
      }

      toast.loading(`Preparing ${malList.length} MAL manga entries...`, { id: toastId });

      const { data: existingReadlist } = await supabase
        .from('manga_readlist')
        .select('manga_id, mal_id, anilist_id')
        .eq('user_id', user!.id);

      const existingMalIds = new Map<number, string>();
      existingReadlist?.forEach((entry: any) => {
        if (entry.mal_id) existingMalIds.set(Number(entry.mal_id), entry.manga_id);
      });

      const processedItems: ExternalImportItem[] = malList.map((item: any) => {
        const malId = Number(item?.node?.id);
        const malTitle = String(item?.node?.title || '').trim() || 'Unknown title';
        const mappedId = existingMalIds.get(malId);
        const targetId = mappedId || buildFallbackMangaId(malTitle, malId, null);
        const progress = Number(item?.list_status?.num_chapters_read || 0);

        return {
          malId: Number.isFinite(malId) ? malId : null,
          anilistId: null,
          malTitle,
          targetId,
          confidence: mappedId ? 'exact' : 'new',
          poster: item?.node?.main_picture?.large || item?.node?.main_picture?.medium || null,
          status: mapMalMangaStatusToTatakai(item?.list_status?.status),
          progress: Number.isFinite(progress) && progress > 0 ? progress : null,
          selected: Boolean(targetId),
        };
      }).filter((entry) => Boolean(entry.targetId));

      setMalImportList(processedItems);
      setIsImportModalOpen(true);
      toast.dismiss(toastId);
    } catch (err: any) {
      console.error('[Settings] Manga MAL import failed:', err);
      toast.error(`Manga import failed: ${err.message}`, { id: toastId });
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportMangaToMal = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading('Syncing manga readlist to MAL...');

    try {
      if (!profile?.mal_access_token) throw new Error('MAL is not connected');

      const { data: readlist, error } = await supabase
        .from('manga_readlist')
        .select('*')
        .eq('user_id', user!.id);

      if (error) throw error;

      const itemsToSync = (readlist || []).filter((item: any) => Boolean(item.mal_id));
      if (itemsToSync.length === 0) {
        toast.info('No manga with MAL IDs found in your readlist.', { id: toastId });
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const item of itemsToSync) {
        try {
          const chapterProgress = toPositiveChapterProgress(item.last_chapter_number);
          const statusForSync = normalizeMangaSyncStatus(item.status, chapterProgress);
          await updateMalMangaStatus(
            String(item.mal_id),
            statusForSync,
            undefined,
            chapterProgress ?? undefined,
          );
          successCount++;
        } catch (err) {
          console.warn(`[Settings] Failed to sync manga ${item.manga_title} to MAL`, err);
          failCount++;
        }
      }

      toast.success(
        failCount === 0
          ? `Successfully exported ${successCount} manga entries to MyAnimeList!`
          : `Manga export complete: ${successCount} synced, ${failCount} failed.`,
        { id: toastId }
      );
    } catch (err: any) {
      toast.error(`Manga export failed: ${err.message}`, { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const handleManualSearch = async (query: string) => {
    setManualSearchQuery(query);
    if (query.length < 2) {
      setManualSearchResults([]);
      return;
    }

    setIsManualSearching(true);
    try {
      if (importMediaType === 'manga') {
        const { searchManga } = await import('@/services/manga.service');
        const results = await searchManga(query, 1, 10, { mode: 'search', provider: 'all' });
        const mappedResults = (results?.results || [])
          .map((row: any) => {
            const fallbackId = buildFallbackMangaId(
              row?.canonicalTitle || row?.title?.english || row?.title?.romaji || row?.title?.native || '',
              Number.isFinite(Number(row?.malId)) ? Number(row.malId) : null,
              Number.isFinite(Number(row?.anilistId)) ? Number(row.anilistId) : null,
            );

            const id = String(row?.id || '').trim() || fallbackId;
            if (!id) return null;

            return {
              id,
              name: row?.canonicalTitle || row?.title?.english || row?.title?.romaji || row?.title?.native || 'Unknown title',
              poster: row?.poster || '/placeholder.svg',
              type: row?.mediaType || 'manga',
            };
          })
          .filter(Boolean);

        setManualSearchResults(mappedResults);
      } else {
        const { searchAnime } = await import('@/lib/api');
        const results = await searchAnime(query);
        setManualSearchResults(results?.animes || []);
      }
    } catch (e) {
      console.warn('Manual search failed:', e);
    } finally {
      setIsManualSearching(false);
    }
  };

  const handleSelectManualMatch = (idx: number, entry: any) => {
    const newList = [...malImportList];
    newList[idx] = {
      ...newList[idx],
      targetId: entry.id,
      malTitle: entry.name,
      poster: entry.poster,
      confidence: 'exact', // Selection marks it as verified/exact
      selected: true
    };
    setMalImportList(newList);
    setSearchingIdx(null);
    setManualSearchQuery('');
    setManualSearchResults([]);
  };

  const handleConfirmImport = async (items: any[]) => {
    const selectedItems = items.filter(i => i.selected);
    if (selectedItems.length === 0) {
      setIsImportModalOpen(false);
      return;
    }

    const toastId = toast.loading(`Importing ${selectedItems.length} items...`);
    try {
      if (importMediaType === 'manga') {
        const seen = new Set<string>();
        const readlistItems = selectedItems
          .map((item) => {
            const chapterProgress = toPositiveChapterProgress(item.progress);
            return {
              user_id: user!.id,
              manga_id: item.targetId,
              manga_title: item.malTitle,
              manga_poster: item.poster || null,
              status: normalizeMangaSyncStatus(item.status, chapterProgress),
              mal_id: item.malId,
              anilist_id: item.anilistId || null,
              last_chapter_number: chapterProgress,
              updated_at: new Date().toISOString(),
            };
          })
          .filter((item) => {
            const key = `${item.user_id}:${item.manga_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

        const { error } = await supabase
          .from('manga_readlist')
          .upsert(readlistItems, { onConflict: 'user_id,manga_id' });

        if (error) throw error;
        toast.success(`Successfully imported ${readlistItems.length} manga entries!`, { id: toastId });
      } else {
        // Deduplicate items by (user_id, anime_id) to prevent conflicts
        const seen = new Set<string>();
        const watchlistItems = selectedItems
          .map((item) => ({
            user_id: user!.id,
            anime_id: item.targetId,
            anime_name: item.malTitle,
            anime_poster: item.poster,
            status: item.status,
            mal_id: item.malId,
            anilist_id: item.anilistId || null,
            updated_at: new Date().toISOString()
          }))
          .filter((item) => {
            const key = `${item.user_id}:${item.anime_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

        const { error } = await supabase
          .from('watchlist')
          .upsert(watchlistItems, { onConflict: 'user_id,anime_id' });

        if (error) throw error;
        toast.success(`Successfully imported ${watchlistItems.length} items!`, { id: toastId });
      }

      setIsImportModalOpen(false);
      refreshProfile();
    } catch (err: any) {
      console.error('[Settings] Confirm Import failed:', err);
      toast.error(`Import failed: ${err.message}`, { id: toastId });
    }
  };

  const handleExportToMal = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading('Preparing library export...');

    try {
      if (!profile?.mal_access_token) {
        throw new Error('MAL is not connected');
      }

      // Fetch Tatakai watchlist
      const { data: watchlist, error: fetchError } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user!.id);

      if (fetchError) throw fetchError;

      const itemsToSync = watchlist?.filter(item => !!item.mal_id) || [];

      if (itemsToSync.length === 0) {
        toast.dismiss(toastId);
        toast.info('No items with MyAnimeList IDs found in your watchlist.');
        setIsExporting(false);
        return;
      }

      toast.loading(`Syncing ${itemsToSync.length} items to MAL...`, { id: toastId });

      let successCount = 0;
      let failCount = 0;

      // Fetch all watch history for the user in one go to optimize
      const { data: historyData } = await supabase
        .from('watch_history')
        .select('anime_id, episode_number')
        .eq('user_id', user!.id);

      // Map progress to anime
      const progressMap = new Map();
      historyData?.forEach(h => {
        const current = progressMap.get(h.anime_id) || 0;
        if (h.episode_number > current) progressMap.set(h.anime_id, h.episode_number);
      });

      // Sync items in smaller batches or sequence
      for (const item of itemsToSync) {
        try {
          const progress = progressMap.get(item.anime_id);
          await updateMalAnimeStatus(
            String(item.mal_id),
            item.status,
            undefined,
            progress
          );
          successCount++;
        } catch (err) {
          console.warn(`[Settings] Failed to sync ${item.anime_name}:`, err);
          failCount++;
        }
      }

      if (failCount === 0) {
        toast.success(`Successfully exported ${successCount} items to MyAnimeList!`, { id: toastId });
      } else {
        toast.info(`Export complete: ${successCount} synced, ${failCount} failed.`, { id: toastId });
      }
    } catch (err: any) {
      console.error('[Settings] Export failed:', err);
      toast.error(`Export failed: ${err.message}`, { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const handleMALConnect = async () => {
    try {
      const url = await getMalAuthUrl();
      window.location.href = url;
    } catch (err) {
      toast.error('Failed to generate MAL auth URL');
    }
  };

  const handleAniListConnect = () => {
    window.location.href = getAniListAuthUrl();
  };

  const handleMALDisconnect = async () => {
    if (!user) return;
    try {
      await disconnectMal(user.id);
      await refreshProfile();
      toast.success('MyAnimeList disconnected');
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const handleAniListDisconnect = async () => {
    if (!user) return;
    try {
      await disconnectAniList(user.id);
      await refreshProfile();
      toast.success('AniList disconnected');
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const handleImportFromAniList = async () => {
    if (isAniListImporting) return;
    setIsAniListImporting(true);
    setImportSource('anilist');
    setImportMediaType('anime');
    const toastId = toast.loading('Fetching your AniList library...');

    try {
      if (!profile?.anilist_access_token) {
        throw new Error('AniList is not connected');
      }

      // We use the AniList user ID from profile if available, otherwise we might need to fetch it first
      let userId = profile.anilist_user_id;
      if (!userId) {
        // Quick fetch of user
        const { fetchAniListUser } = await import('@/lib/externalIntegrations');
        const aniUser = await fetchAniListUser(profile.anilist_access_token);
        userId = aniUser.id;
      }

      const aniList = await fetchAniListUserList(profile.anilist_access_token, Number(userId));
      console.log(`[Settings] Received ${aniList?.length || 0} items from AniList`);

      if (!aniList || aniList.length === 0) {
        toast.dismiss(toastId);
        toast.info('Your AniList library is empty.');
        setIsAniListImporting(false);
        return;
      }

      toast.loading(`Preparing ${aniList.length} AniList items using ID mapping...`, { id: toastId });

      // Reuse the same logic as MAL for matching
      // Fetch existing watchlist
      const { data: existingWatchlist } = await supabase
        .from('watchlist')
        .select('anime_id, mal_id, anilist_id')
        .eq('user_id', user!.id);

      const existingMalIds = new Map<number, string>();
      const existingAniListIds = new Map<number, string>();
      existingWatchlist?.forEach((entry: any) => {
        if (entry.mal_id) existingMalIds.set(Number(entry.mal_id), entry.anime_id);
        if (entry.anilist_id) existingAniListIds.set(Number(entry.anilist_id), entry.anime_id);
      });

      const processedItems = [];

      for (const item of aniList) {
        // item is an entry with .media
        const media = item.media;
        const anilistId = Number(media.id);
        const malId = media.idMal ? Number(media.idMal) : null;
        const title = media.title.english || media.title.romaji || media.title.native;

        const mappedByAniList = existingAniListIds.get(anilistId);
        const mappedByMal = malId ? existingMalIds.get(malId) : undefined;
        let targetId: string | undefined = mappedByAniList || mappedByMal;
        let confidence: 'exact' | 'new' = targetId ? 'exact' : 'new';

        if (!targetId) {
          targetId = malId ? `mal-${malId}` : `anilist-${anilistId}`;
          confidence = 'new';
        }

        if (targetId) {
          processedItems.push({
            malId,
            anilistId,
            malTitle: title,
            targetId,
            confidence,
            poster: media.coverImage.large || media.coverImage.medium,
            status: mapAniListStatusToTatakai(item.status),
            selected: true
          });
        }
      }

      setMalImportList(processedItems); // We reuse the same modal state/list
      setIsImportModalOpen(true);
      toast.dismiss(toastId);

    } catch (err: any) {
      console.error('[Settings] AniList Import failed:', err);
      toast.error(`Import failed: ${err.message}`, { id: toastId });
    } finally {
      setIsAniListImporting(false);
    }
  };

  const handleImportMangaFromAniList = async () => {
    if (isAniListImporting) return;
    setIsAniListImporting(true);
    setImportSource('anilist');
    setImportMediaType('manga');
    const toastId = toast.loading('Fetching your AniList manga library...');

    try {
      if (!profile?.anilist_access_token) {
        throw new Error('AniList is not connected');
      }

      let userId = profile.anilist_user_id;
      if (!userId) {
        const { fetchAniListUser } = await import('@/lib/externalIntegrations');
        const aniUser = await fetchAniListUser(profile.anilist_access_token);
        userId = aniUser.id;
      }

      const aniList = await fetchAniListMangaList(profile.anilist_access_token, Number(userId));
      if (!aniList || aniList.length === 0) {
        toast.dismiss(toastId);
        toast.info('Your AniList manga library is empty.');
        return;
      }

      toast.loading(`Preparing ${aniList.length} AniList manga entries...`, { id: toastId });

      const { data: existingReadlist } = await supabase
        .from('manga_readlist')
        .select('manga_id, mal_id, anilist_id')
        .eq('user_id', user!.id);

      const existingMalIds = new Map<number, string>();
      const existingAniListIds = new Map<number, string>();
      existingReadlist?.forEach((entry: any) => {
        if (entry.mal_id) existingMalIds.set(Number(entry.mal_id), entry.manga_id);
        if (entry.anilist_id) existingAniListIds.set(Number(entry.anilist_id), entry.manga_id);
      });

      const processedItems: ExternalImportItem[] = [];

      for (const item of aniList) {
        const media = item.media;
        const anilistId = Number(media?.id);
        const malId = media?.idMal ? Number(media.idMal) : null;
        const title = media?.title?.english || media?.title?.romaji || media?.title?.native || 'Unknown title';

        const mappedByAniList = Number.isFinite(anilistId) ? existingAniListIds.get(anilistId) : undefined;
        const mappedByMal = malId ? existingMalIds.get(malId) : undefined;
        const targetId = mappedByAniList || mappedByMal || buildFallbackMangaId(title, malId, anilistId);

        if (!targetId) continue;

        processedItems.push({
          malId,
          anilistId: Number.isFinite(anilistId) ? anilistId : null,
          malTitle: title,
          targetId,
          confidence: (mappedByAniList || mappedByMal) ? 'exact' : 'new',
          poster: media?.coverImage?.large || media?.coverImage?.medium || null,
          status: mapAniListMangaStatusToTatakai(item.status),
          progress: Number.isFinite(Number(item.progress)) && Number(item.progress) > 0 ? Number(item.progress) : null,
          selected: true,
        });
      }

      setMalImportList(processedItems);
      setIsImportModalOpen(true);
      toast.dismiss(toastId);
    } catch (err: any) {
      console.error('[Settings] AniList Manga Import failed:', err);
      toast.error(`Manga import failed: ${err.message}`, { id: toastId });
    } finally {
      setIsAniListImporting(false);
    }
  };

  const handleExportToAniList = async () => {
    if (isAniListExporting) return;
    setIsAniListExporting(true);
    const toastId = toast.loading('Syncing library to AniList...');

    try {
      if (!profile?.anilist_access_token) throw new Error('AniList not connected');

      // Fetch Tatakai watchlist
      const { data: watchlist } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user!.id);

      if (!watchlist || watchlist.length === 0) {
        toast.info('Watchlist is empty', { id: toastId });
        return;
      }

      let successCount = 0;
      let failCount = 0;

      const { searchAniListAnime } = await import('@/lib/externalIntegrations');

      for (const item of watchlist) {
        try {
          // We need the AniList Media ID.
          let mediaId = item.anilist_id || null;

          if (!mediaId && item.mal_id) {
            const results = await searchAniListAnime(item.anime_name);
            const match = results.find(r => r.idMal == item.mal_id) || results[0];
            if (match) mediaId = match.id;
          } else if (!mediaId) {
            const results = await searchAniListAnime(item.anime_name);
            if (results.length > 0) mediaId = results[0].id;
          }

          if (mediaId) {
            await updateAniListAnimeStatus(
              profile.anilist_access_token,
              mediaId,
              mapTatakaiStatusToAniList(item.status),
            );
            successCount++;
          } else {
            failCount++;
          }
        } catch (e) {
          console.warn(`Failed to sync ${item.anime_name} to AniList`, e);
          failCount++;
        }

        // Respect AniList API rate limits (90 req/min)
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      toast.success(`Synced ${successCount} items to AniList (${failCount} failed/skipped)`, { id: toastId });

    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`, { id: toastId });
    } finally {
      setIsAniListExporting(false);
    }
  };

  const handleExportMangaToAniList = async () => {
    if (isAniListExporting) return;
    setIsAniListExporting(true);
    const toastId = toast.loading('Syncing manga readlist to AniList...');

    try {
      if (!profile?.anilist_access_token) throw new Error('AniList not connected');

      const { data: readlist } = await supabase
        .from('manga_readlist')
        .select('*')
        .eq('user_id', user!.id);

      if (!readlist || readlist.length === 0) {
        toast.info('Manga readlist is empty', { id: toastId });
        return;
      }

      let successCount = 0;
      let failCount = 0;

      const { searchAniListManga } = await import('@/lib/externalIntegrations');

      for (const item of readlist) {
        try {
          let mediaId = item.anilist_id || null;

          if (!mediaId && item.mal_id) {
            const results = await searchAniListManga(item.manga_title);
            const match = results.find((result) => Number(result.idMal) === Number(item.mal_id)) || results[0];
            if (match) mediaId = match.id;
          } else if (!mediaId) {
            const results = await searchAniListManga(item.manga_title);
            if (results.length > 0) mediaId = results[0].id;
          }

          if (mediaId) {
            const chapterProgress = toPositiveChapterProgress(item.last_chapter_number);
            const statusForSync = normalizeMangaSyncStatus(item.status, chapterProgress);
            await updateAniListMangaStatus(
              profile.anilist_access_token,
              Number(mediaId),
              mapTatakaiMangaStatusToAniList(statusForSync),
              chapterProgress ?? undefined,
            );
            successCount++;
          } else {
            failCount++;
          }
        } catch (e) {
          console.warn(`Failed to sync manga ${item.manga_title} to AniList`, e);
          failCount++;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      toast.success(`Manga sync complete: ${successCount} synced (${failCount} failed/skipped)`, { id: toastId });
    } catch (err: any) {
      toast.error(`Manga export failed: ${err.message}`, { id: toastId });
    } finally {
      setIsAniListExporting(false);
    }
  };

  const handleImportFromMalByMediaType = async () => {
    if (malSyncTarget === 'manga') {
      await handleImportMangaFromMal();
      return;
    }
    await handleImportFromMal();
  };

  const handleExportToMalByMediaType = async () => {
    if (malSyncTarget === 'manga') {
      await handleExportMangaToMal();
      return;
    }
    await handleExportToMal();
  };

  const handleImportFromAniListByMediaType = async () => {
    if (aniListSyncTarget === 'manga') {
      await handleImportMangaFromAniList();
      return;
    }
    await handleImportFromAniList();
  };

  const handleExportToAniListByMediaType = async () => {
    if (aniListSyncTarget === 'manga') {
      await handleExportMangaToAniList();
      return;
    }
    await handleExportToAniList();
  };

  function mapAniListStatusToTatakai(status: string) {
    const map: Record<string, string> = {
      'CURRENT': 'watching',
      'COMPLETED': 'completed',
      'PLANNING': 'plan_to_watch',
      'DROPPED': 'dropped',
      'PAUSED': 'on_hold',
      'REPEATING': 'watching'
    };
    return map[status] || 'plan_to_watch';
  }

  function mapTatakaiStatusToAniList(status: string) {
    const map: Record<string, any> = {
      'watching': 'CURRENT',
      'completed': 'COMPLETED',
      'plan_to_watch': 'PLANNING',
      'dropped': 'DROPPED',
      'on_hold': 'PAUSED'
    };
    return map[status] || 'PLANNING';
  }

  const handleClearHistory = async () => {
    try {
      await clearHistory.mutateAsync();
      toast.success('All watch history cleared');
      setShowClearConfirm(false);
    } catch {
      toast.error('Failed to clear history');
    }
  };

  const hasMAL = !!profile?.mal_access_token;
  const hasAniList = !!profile?.anilist_access_token;




  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className={cn(
        "relative z-10 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6",
        isNative ? "pl-6" : "pl-6 md:pl-32"
      )}>
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
        </div>

        <div className="mb-8">
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">Customize your viewing experience</p>
        </div>

        {/* Settings Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50 p-1 flex-wrap h-auto gap-1">
            <TabsTrigger value="appearance" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Palette className="w-4 h-4" />
              Appearance
            </TabsTrigger>
            {isNative && (
              <TabsTrigger value="desktop" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Laptop className="w-4 h-4" />
                App
              </TabsTrigger>
            )}
            <TabsTrigger value="player" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Film className="w-4 h-4" />
              Video Player
            </TabsTrigger>
            <TabsTrigger value="display" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Monitor className="w-4 h-4" />
              Display
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Shield className="w-4 h-4" />
              Privacy
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Link2 className="w-4 h-4" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="about" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Info className="w-4 h-4" />
              About
            </TabsTrigger>
            <TabsTrigger value="changelog" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <History className="w-4 h-4" />
              Changelog
            </TabsTrigger>
          </TabsList>

          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <ThemeSelector />
          </TabsContent>

          {/* Desktop Tab */}
          {!isMobile && (
            <TabsContent value="desktop">
              <DesktopSettings />
            </TabsContent>
          )}

          {/* Mobile Tab */}
          {isMobile && (
            <TabsContent value="desktop">
              <MobileSettings />
            </TabsContent>
          )}

          {/* Video Player Tab */}
          <TabsContent value="player">
            <GlassPanel className="p-6">
              <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                <Film className="w-5 h-5 text-primary" />
                Video Player Settings
              </h2>
              <VideoSettingsPanel isOpen={true} onClose={() => { }} embedded />
            </GlassPanel>
          </TabsContent>

          {/* Display Tab */}
          <TabsContent value="display">
            <GlassPanel className="p-6">
              <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                <Monitor className="w-5 h-5 text-primary" />
                Display Settings
              </h2>
              <div className="space-y-6">
                <div className="flex flex-col gap-3 p-4 rounded-xl bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Preferred Title Language</p>
                      <p className="text-sm text-muted-foreground">Select how anime titles should be displayed</p>
                    </div>
                    <Select
                      value={preferredTitleLanguage}
                      onValueChange={(value: any) => handleTitleLanguageChange(value)}
                    >
                      <SelectTrigger className="w-[140px] bg-background/50 border-white/10">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="romaji">Romaji</SelectItem>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="native">Native</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-3 p-4 rounded-xl bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Preferred Manga Language</p>
                      <p className="text-sm text-muted-foreground">Choose your default manga translation language</p>
                    </div>
                    <Select
                      value={preferredMangaLanguage}
                      onValueChange={(value: PreferredMangaLanguage) => handleMangaLanguageChange(value)}
                    >
                      <SelectTrigger className="w-[180px] bg-background/50 border-white/10">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="jp">Japanese</SelectItem>
                        <SelectItem value="kr">Korean</SelectItem>
                        <SelectItem value="zh">Chinese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-primary/20">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      Ultra Lite Mode
                      <span className="px-2 py-0.5 rounded-full bg-yellow-500 text-[10px] font-black text-black uppercase">Max Speed</span>
                    </p>
                    <p className="text-sm text-muted-foreground">Disables all filters, animations, and heavy styles for low-end devices</p>
                  </div>
                  <Switch
                    checked={theme === 'ultra-lite'}
                    onCheckedChange={(checked) => setTheme(checked ? 'ultra-lite' : 'cherry-blossom')}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                  <div>
                    <p className="font-medium">Reduce Motion</p>
                    <p className="text-sm text-muted-foreground">Minimize animations for better performance</p>
                  </div>
                  <Switch
                    checked={reduceMotion}
                    onCheckedChange={setReduceMotion}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                  <div>
                    <p className="font-medium">High Contrast Mode</p>
                    <p className="text-sm text-muted-foreground">Increase visual contrast for accessibility</p>
                  </div>
                  <Switch
                    checked={highContrast}
                    onCheckedChange={setHighContrast}
                  />
                </div>
              </div>
            </GlassPanel>
          </TabsContent>

          {/* Privacy Tab */}
          <TabsContent value="privacy">
            <GlassPanel className="p-6">
              <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Privacy Settings
              </h2>
              {user ? (
                <div className="space-y-6">
                  <div id="mature-content-controls" className="p-4 rounded-xl bg-muted/30 border border-white/10">
                    <div className="flex items-start gap-3 mb-4">
                      <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Mature Content Controls</p>
                        <p className="text-sm text-muted-foreground">
                          Hide 18+ titles by default, blur explicit search results, and decide whether warnings appear before opening.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-white/5">
                        <div>
                          <p className="font-medium text-sm">Show Mature Media Everywhere</p>
                          <p className="text-xs text-muted-foreground">
                            Includes mature titles in home shelves and non-explicit discovery lists.
                          </p>
                        </div>
                        <Switch
                          checked={contentSafetySettings.showAdultEverywhere}
                          onCheckedChange={(checked) => {
                            updateContentSafetySettings({ showAdultEverywhere: checked });
                            toast.success(
                              checked
                                ? 'Mature media is now visible across discovery.'
                                : 'Mature media will stay hidden unless explicitly searched.'
                            );
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-white/5">
                        <div>
                          <p className="font-medium text-sm">Blur Mature Search Results</p>
                          <p className="text-xs text-muted-foreground">
                            When explicit queries are used in safe mode, mature covers stay blurred in search results.
                          </p>
                        </div>
                        <Switch
                          checked={contentSafetySettings.blurAdultInSearch}
                          onCheckedChange={(checked) => {
                            updateContentSafetySettings({ blurAdultInSearch: checked });
                            toast.success(checked ? 'Mature search results will be blurred.' : 'Mature search results will be shown clearly.');
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-white/5">
                        <div>
                          <p className="font-medium text-sm">Warn Before Opening Mature Media</p>
                          <p className="text-xs text-muted-foreground">
                            Shows a warning screen before loading mature manga details or chapters.
                          </p>
                        </div>
                        <Switch
                          checked={contentSafetySettings.warnBeforeAdultOpen}
                          onCheckedChange={(checked) => {
                            updateContentSafetySettings({ warnBeforeAdultOpen: checked });
                            toast.success(checked ? 'Mature content warnings enabled.' : 'Mature content warnings disabled.');
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-4">
                      {isPublic ? (
                        <Globe className="w-6 h-6 text-green-500" />
                      ) : (
                        <EyeOff className="w-6 h-6 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">Public Profile</p>
                        <p className="text-sm text-muted-foreground">
                          {isPublic
                            ? 'Your profile, watchlist, and history are visible to everyone'
                            : 'Only you can see your profile, watchlist, and history'}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={isPublic}
                      onCheckedChange={handlePrivacyChange}
                      disabled={updatePrivacy.isPending}
                    />
                  </div>

                  <div className="p-4 rounded-xl bg-muted/20 border border-muted">
                    <p className="text-sm text-muted-foreground">
                      When your profile is public, other users can view your:
                    </p>
                    <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1">
                      <li>Profile information and avatar</li>
                      <li>Watchlist (favorited anime)</li>
                      <li>Watch history and progress</li>
                      <li>Tier lists you've created</li>
                    </ul>
                  </div>

                  {/* Clear Watch History */}
                  <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                    <div className="flex items-start gap-4">
                      <Trash2 className="w-5 h-5 text-destructive mt-1" />
                      <div className="flex-1">
                        <p className="font-medium mb-1">Clear Watch History</p>
                        <p className="text-sm text-muted-foreground mb-4">
                          Permanently delete all your watch history. This action cannot be undone.
                        </p>
                        {showClearConfirm ? (
                          <div className="space-y-3">
                            <div className="p-3 rounded-lg bg-destructive/20 border border-destructive">
                              <p className="text-sm font-medium text-destructive">
                                Are you sure? This will permanently delete all your watch history and progress.
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleClearHistory}
                                disabled={clearHistory.isPending}
                                className="gap-2"
                              >
                                <Trash2 className="w-4 h-4" />
                                {clearHistory.isPending ? 'Clearing...' : 'Yes, Delete All'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowClearConfirm(false)}
                                disabled={clearHistory.isPending}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setShowClearConfirm(true)}
                            className="gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Clear All History
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Clear Search History */}
                    <div className="flex items-start gap-4 pt-6 border-t border-border/50">
                      <Search className="w-5 h-5 text-destructive mt-1" />
                      <div className="flex-1">
                        <p className="font-medium mb-1">Clear Search History</p>
                        <p className="text-sm text-muted-foreground mb-4">
                          Delete all your search history stored locally on this device.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            try {
                              localStorage.removeItem('tatakai_search_history');
                              toast.success('Search history cleared');
                            } catch {
                              toast.error('Failed to clear search history');
                            }
                          }}
                          className="gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Clear Search History
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div id="mature-content-controls" className="p-4 rounded-xl bg-muted/30 border border-white/10">
                    <div className="flex items-start gap-3 mb-4">
                      <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Mature Content Controls</p>
                        <p className="text-sm text-muted-foreground">
                          These settings are local to this device and apply even when you are not signed in.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-white/5">
                        <div>
                          <p className="font-medium text-sm">Show Mature Media Everywhere</p>
                          <p className="text-xs text-muted-foreground">Display mature manga in all discovery sections.</p>
                        </div>
                        <Switch
                          checked={contentSafetySettings.showAdultEverywhere}
                          onCheckedChange={(checked) => updateContentSafetySettings({ showAdultEverywhere: checked })}
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-white/5">
                        <div>
                          <p className="font-medium text-sm">Blur Mature Search Results</p>
                          <p className="text-xs text-muted-foreground">Keep explicit-result covers blurred while browsing.</p>
                        </div>
                        <Switch
                          checked={contentSafetySettings.blurAdultInSearch}
                          onCheckedChange={(checked) => updateContentSafetySettings({ blurAdultInSearch: checked })}
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-background/40 border border-white/5">
                        <div>
                          <p className="font-medium text-sm">Warn Before Opening Mature Media</p>
                          <p className="text-xs text-muted-foreground">Require confirmation before entering mature manga pages.</p>
                        </div>
                        <Switch
                          checked={contentSafetySettings.warnBeforeAdultOpen}
                          onCheckedChange={(checked) => updateContentSafetySettings({ warnBeforeAdultOpen: checked })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="text-center py-4">
                    <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Sign in to manage profile privacy settings</p>
                    <Button onClick={() => window.location.href = '/auth'} className="mt-4">
                      Sign In
                    </Button>
                  </div>
                </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations">
            <GlassPanel className="p-6">
              <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" />
                External Integrations
              </h2>
              {user ? (
                <div className="space-y-6">
                  {/* MyAnimeList */}
                  <div className="p-5 rounded-2xl bg-muted/20 border border-white/5 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-8 -mr-8 -mt-8 bg-[#2E51A2]/10 rounded-full blur-3xl group-hover:bg-[#2E51A2]/20 transition-all duration-500" />

                    <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-[#2E51A2] flex items-center justify-center text-white font-black text-xl shadow-lg shadow-[#2E51A2]/20">
                          MAL
                        </div>
                        <div>
                          <h3 className="text-lg font-bold flex items-center gap-2">
                            MyAnimeList
                            {hasMAL && <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20 py-0 h-5">Connected</Badge>}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {hasMAL
                              ? `Linked to MAL account: ${profile?.mal_user_id || 'Active'}`
                              : 'Sync your anime and manga lists and ratings automatically'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {hasMAL ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleMALDisconnect}
                            className="gap-2 border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/40 transition-all w-full sm:w-auto"
                          >
                            <Trash2 className="w-4 h-4" />
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            size="default"
                            onClick={handleMALConnect}
                            className="gap-2 bg-[#2E51A2] hover:bg-[#2E51A2]/90 px-6 shadow-lg shadow-[#2E51A2]/20"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Connect MyAnimeList
                          </Button>
                        )}
                      </div>
                    </div>

                    {hasMAL && (
                      <div className="relative mt-5 pt-5 border-t border-white/5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Sync target
                          </p>
                          <div className="inline-flex rounded-xl border border-[#2E51A2]/25 bg-[#2E51A2]/5 p-1 gap-1 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => setMalSyncTarget('anime')}
                              className={cn(
                                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                                malSyncTarget === 'anime'
                                  ? 'bg-[#2E51A2] text-white shadow-sm'
                                  : 'text-[#2E51A2] hover:bg-[#2E51A2]/10'
                              )}
                            >
                              Anime
                            </button>
                            <button
                              type="button"
                              onClick={() => setMalSyncTarget('manga')}
                              className={cn(
                                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                                malSyncTarget === 'manga'
                                  ? 'bg-[#2E51A2] text-white shadow-sm'
                                  : 'text-[#2E51A2] hover:bg-[#2E51A2]/10'
                              )}
                            >
                              Manga
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={handleImportFromMalByMediaType}
                            disabled={isImporting}
                            className="gap-2 bg-[#2E51A2] hover:bg-[#2E51A2]/90 text-white shadow-md shadow-[#2E51A2]/20 active:scale-95 transition-all"
                          >
                            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <List className="w-4 h-4" />}
                            {malSyncTarget === 'manga' ? 'Sync Manga from MAL' : 'Sync Anime from MAL'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportToMalByMediaType}
                            disabled={isExporting}
                            className="gap-2 border-[#2E51A2]/30 text-[#2E51A2] hover:bg-[#2E51A2]/5 transition-all"
                          >
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <List className="w-4 h-4 rotate-180" />}
                            {malSyncTarget === 'manga' ? 'Force Push Manga to MAL' : 'Force Push Anime to MAL'}
                          </Button>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          Background auto-sync is active. Any changes you make in Tatakai will be reflected on MAL instantly.
                        </div>

                        {/* <div className="mt-4 p-4 rounded-xl bg-destructive/5 border border-destructive/20 border-dashed">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-destructive/10">
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                              </div>
                              <div>
                                <p className="font-bold text-[10px] text-destructive uppercase tracking-widest mb-0.5">Dangerous Setting</p>
                                <p className="font-semibold text-sm">Sync Watchlist Deletions</p>
                                <p className="text-xs text-muted-foreground leading-relaxed">If you remove an anime from your Tatakai watchlist, it will be automatically <span className="text-destructive font-bold uppercase underline">deleted</span> from your MyAnimeList account.</p>
                              </div>
                            </div>
                            <Switch
                              checked={malAutoDelete}
                              onCheckedChange={handleMalAutoDeleteChange}
                            />
                          </div>
                        </div> */}
                      </div>
                    )}
                  </div>

                  {/* AniList */}
                  <div className="p-5 rounded-2xl bg-muted/20 border border-white/5 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-8 -mr-8 -mt-8 bg-[#02A9FF]/10 rounded-full blur-3xl group-hover:bg-[#02A9FF]/20 transition-all duration-500" />

                    <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-[#02A9FF] flex items-center justify-center shadow-lg shadow-[#02A9FF]/20">
                          <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white">
                            <path d="M6.361 2.943 0 21.056h4.942l1.077-3.133H11.4l1.052 3.133H22.9c.71 0 1.1-.392 1.1-1.101V17.53c0-.71-.39-1.101-1.1-1.101h-6.483V4.045c0-.71-.392-1.102-1.101-1.102h-2.422c-.71 0-1.101.392-1.101 1.102v1.064l-.758-2.166zm2.324 5.948 1.688 5.018H7.144z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold flex items-center gap-2">
                            AniList
                            {hasAniList && <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20 py-0 h-5">Connected</Badge>}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {hasAniList
                              ? `Linked to AniList account: ${profile?.anilist_user_id || 'Active'}`
                              : 'Sync anime watch progress and manga chapter progress automatically'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {hasAniList ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAniListDisconnect}
                            className="gap-2 border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/40 transition-all w-full sm:w-auto"
                          >
                            <Trash2 className="w-4 h-4" />
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            size="default"
                            onClick={handleAniListConnect}
                            className="gap-2 bg-[#02A9FF] hover:bg-[#02A9FF]/90 px-6 shadow-lg shadow-[#02A9FF]/20"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Connect AniList
                          </Button>
                        )}
                      </div>
                    </div>

                    {hasAniList && (
                      <div className="relative mt-5 pt-5 border-t border-white/5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Sync target
                          </p>
                          <div className="inline-flex rounded-xl border border-[#02A9FF]/25 bg-[#02A9FF]/5 p-1 gap-1 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => setAniListSyncTarget('anime')}
                              className={cn(
                                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                                aniListSyncTarget === 'anime'
                                  ? 'bg-[#02A9FF] text-white shadow-sm'
                                  : 'text-[#02A9FF] hover:bg-[#02A9FF]/10'
                              )}
                            >
                              Anime
                            </button>
                            <button
                              type="button"
                              onClick={() => setAniListSyncTarget('manga')}
                              className={cn(
                                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                                aniListSyncTarget === 'manga'
                                  ? 'bg-[#02A9FF] text-white shadow-sm'
                                  : 'text-[#02A9FF] hover:bg-[#02A9FF]/10'
                              )}
                            >
                              Manga
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={handleImportFromAniListByMediaType}
                            disabled={isAniListImporting}
                            className="gap-2 bg-[#02A9FF] hover:bg-[#02A9FF]/90 text-white shadow-md shadow-[#02A9FF]/20 active:scale-95 transition-all"
                          >
                            {isAniListImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <List className="w-4 h-4" />}
                            {aniListSyncTarget === 'manga' ? 'Sync Manga from AniList' : 'Sync Anime from AniList'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportToAniListByMediaType}
                            disabled={isAniListExporting}
                            className="gap-2 border-[#02A9FF]/30 text-[#02A9FF] hover:bg-[#02A9FF]/5 transition-all"
                          >
                            {isAniListExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <List className="w-4 h-4 rotate-180" />}
                            {aniListSyncTarget === 'manga' ? 'Force Push Manga to AniList' : 'Force Push Anime to AniList'}
                          </Button>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          Background auto-sync is active. Chapter and episode updates are pushed while you watch/read.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-muted/20 border border-muted">
                    <p className="text-sm text-muted-foreground">
                      <strong>What syncs:</strong> Anime watchlist/watch progress plus manga readlist/chapter progress
                      are automatically synced with connected services in the background.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Link2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Sign in to connect external services</p>
                  <Button onClick={() => window.location.href = '/auth'} className="mt-4">
                    Sign In
                  </Button>
                </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* About Tab */}
          <TabsContent value="about">
            <GlassPanel className="p-6">
              <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" />
                About
              </h2>
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-muted/30 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium mb-1">Tatakai</p>
                    <p className="text-sm text-muted-foreground">Version {__APP_VERSION__}</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    A modern anime streaming platform with Smart TV support,
                    beautiful themes, and powerful video player features.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-primary/10 text-center">
                    <p className="text-2xl font-bold text-primary">{themes.length}</p>
                    <p className="text-sm text-muted-foreground">Themes</p>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary/10 text-center">
                    <p className="text-2xl font-bold text-secondary">∞</p>
                    <p className="text-sm text-muted-foreground">Anime</p>
                  </div>
                </div>

                {/* Legal Links */}
                <div className="p-4 rounded-xl bg-muted/30">
                  <p className="font-medium mb-3">Legal & Policies</p>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.location.href = '/terms'}
                      className="justify-start"
                    >
                      Terms & Conditions
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.location.href = '/dmca'}
                      className="justify-start"
                    >
                      DMCA Policy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.location.href = '/suggestions'}
                      className="justify-start"
                    >
                      Send Feedback
                    </Button>
                  </div>
                </div>
              </div>
            </GlassPanel>
          </TabsContent>

          {/* Changelog Tab */}
          <TabsContent value="changelog">
            <GlassPanel className="p-6">
              <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Changelog
              </h2>
              <div className="space-y-6">
                {CHANGELOG.map((release, index) => (
                  <div key={release.version} className={`p-4 rounded-xl ${index === 0 ? 'bg-primary/10 border border-primary/20' : 'bg-muted/30'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${index === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          v{release.version}
                        </span>
                        {index === 0 && (
                          <span className="px-2 py-1 rounded-md bg-green-500/20 text-green-500 text-xs font-bold">
                            Latest
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">{release.date}</span>
                    </div>
                    <ul className="space-y-2">
                      {release.changes.map((change, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-primary mt-1">•</span>
                          <span className="text-foreground/80">{change}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </TabsContent>

        </Tabs>
      </main>
      <MobileNav />


      {/* MAL Import Selection Modal */}
      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              {importSource === 'mal' ? (
                <>
                  <List className="w-6 h-6 text-[#2E51A2]" />
                  {importMediaType === 'manga' ? 'Import Manga from MyAnimeList' : 'Import Anime from MyAnimeList'}
                </>
              ) : (
                <>
                  <List className="w-6 h-6 text-[#02A9FF]" />
                  {importMediaType === 'manga' ? 'Import Manga from AniList' : 'Import Anime from AniList'}
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-1">
              Select the {importMediaType === 'manga' ? 'manga' : 'anime'} you want to import. Matching is ID-first, and you can manually choose a different Tatakai match for any row.
            </DialogDescription>
          </DialogHeader>

          {/* <div className="px-6 py-2">
            <div className={cn(
              "border rounded-lg p-3 flex items-start gap-3 text-sm",
              importSource === 'mal' ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : "bg-[#02A9FF]/10 border-[#02A9FF]/20 text-[#02A9FF]"
            )}>
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>
                <strong>ID Identification Notice</strong>: Imports are ID-first only. We use <code>{importSource === 'mal' ? 'mal_id' : 'anilist_id'}</code> / <code>mal_id</code> mappings directly and avoid automatic title guesses. Use <strong>Manual Match</strong> to override any {importMediaType === 'manga' ? 'entry' : 'item'}.
              </p>
            </div> */}

          <ScrollArea className="h-[60vh] px-6 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-6">
              {malImportList.map((item, idx) => (
                <div
                  key={`${item.targetId || item.anilistId || item.malId || idx}-${idx}`}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                    item.selected ? "bg-primary/5 border-primary/30" : "bg-muted/30 border-transparent hover:bg-muted/50"
                  )}
                  onClick={() => {
                    const newList = [...malImportList];
                    newList[idx].selected = !newList[idx].selected;
                    setMalImportList(newList);
                  }}
                >
                  <Checkbox
                    checked={item.selected}
                    className="data-[state=checked]:bg-[#2E51A2] data-[state=checked]:border-[#2E51A2]"
                  />

                  <div className="relative w-12 h-16 rounded overflow-hidden flex-shrink-0 bg-muted">
                    {item.poster && (
                      <img src={item.poster} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">{item.malTitle}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] opacity-70 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (searchingIdx === idx) {
                            setSearchingIdx(null);
                          } else {
                            setSearchingIdx(idx);
                            setManualSearchQuery(item.malTitle);
                            handleManualSearch(item.malTitle);
                          }
                        }}
                      >
                        <Search className="w-3 h-3" />
                        <span>Manual Match</span>
                      </Button>
                    </div>

                    {searchingIdx === idx ? (
                      <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <div className="relative">
                          <input
                            autoFocus
                            className="w-full bg-background border border-border/50 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="Search Tatakai..."
                            value={manualSearchQuery}
                            onChange={(e) => handleManualSearch(e.target.value)}
                          />
                          {isManualSearching && (
                            <Loader2 className="absolute right-2 top-2 w-3 h-3 animate-spin opacity-50" />
                          )}
                        </div>

                        {manualSearchResults.length > 0 && (
                          <div className="max-h-32 overflow-y-auto rounded-lg border border-border/30 bg-muted/50 p-1 space-y-1">
                            {manualSearchResults.slice(0, 5).map((result) => (
                              <div
                                key={result.id}
                                className="flex items-center gap-2 p-1.5 hover:bg-primary/10 rounded cursor-pointer transition-colors"
                                onClick={() => handleSelectManualMatch(idx, result)}
                              >
                                <img src={result.poster} className="w-6 h-8 object-cover rounded shadow-sm" alt="" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-medium truncate">{result.name}</p>
                                  <p className="text-[8px] text-muted-foreground">{result.type || (importMediaType === 'manga' ? 'Manga' : 'Anime')}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px] py-0 px-1 uppercase opacity-70">
                          {item.status.replace('_', ' ')}
                        </Badge>

                        {item.confidence === 'exact' && (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] py-0 px-1">Exact Match</Badge>
                        )}
                        {item.confidence === 'guessed' && (
                          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px] py-0 px-1">Best Match</Badge>
                        )}
                        {item.confidence === 'new' && (
                          <Badge className="bg-muted text-muted-foreground border-transparent text-[10px] py-0 px-1">New to Tatakai</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="p-6 pt-2 bg-muted/30 border-t border-border/50">
            <div className="flex items-center justify-between w-full">
              <p className="text-xs text-muted-foreground">
                {malImportList.filter(i => i.selected).length} {importMediaType === 'manga' ? 'manga' : 'anime'} selected
              </p>
              <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={() => setIsImportModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className={cn(
                    importSource === 'mal'
                      ? 'bg-[#2E51A2] hover:bg-[#2E51A2]/90'
                      : 'bg-[#02A9FF] hover:bg-[#02A9FF]/90 text-white'
                  )}
                  onClick={() => handleConfirmImport(malImportList)}
                >
                  Confirm Import
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
