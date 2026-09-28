import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { List, Search, Loader2, Link2, Trash2, CheckCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { contentGraph, toAnimeCard } from '@/core';
import { getMalAuthUrl, disconnectMal } from '@/lib/mal';
import { getAniListAuthUrl, disconnectAniList } from '@/lib/externalIntegrations';
import {
  isDesktopApp,
  openOAuthInBrowser,
  DESKTOP_ANILIST_REDIRECT_URI,
  DESKTOP_MAL_REDIRECT_URI,
} from '@/lib/desktopOAuth';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";
import { SyncPreviewModal } from '@/components/integrations/SyncPreviewModal';
import { useIntegrationSync, type Integration, type MediaType, type SyncProposalItem } from '@/hooks/user/useIntegrationSync';
import {
  SettingsBadge,
  SettingsEmptyState,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';

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

export function IntegrationsPanel() {
  const { user, profile, refreshProfile } = useAuth();

  const [malImportList, setMalImportList] = useState<ExternalImportItem[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [searchingIdx, setSearchingIdx] = useState<number | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [manualSearchResults, setManualSearchResults] = useState<any[]>([]);
  const [isManualSearching, setIsManualSearching] = useState(false);
  const [importSource, setImportSource] = useState<'mal' | 'anilist'>('mal');
  const [importMediaType, setImportMediaType] = useState<ImportMediaType>('anime');

  // Smart Sync (approval-modal) State
  const integrationSync = useIntegrationSync();
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncModalIntegration, setSyncModalIntegration] = useState<Integration>('mal');
  const [syncModalMediaType, setSyncModalMediaType] = useState<MediaType | undefined>(undefined);

  const handleManualSearch = async (query: string) => {
    setManualSearchQuery(query);
    if (query.length < 2) {
      setManualSearchResults([]);
      return;
    }

    setIsManualSearching(true);
    try {
      if (importMediaType === 'manga') {
        const { searchManga } = await import('@/core/content/manga-client');
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
        const results = await contentGraph.search({ query, page: 1, perPage: 10 });
        setManualSearchResults((results?.media || []).map(toAnimeCard));
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

  const handleMALConnect = async () => {
    try {
      if (isDesktopApp()) {
        const url = await getMalAuthUrl(DESKTOP_MAL_REDIRECT_URI);
        if (openOAuthInBrowser(url)) {
          toast.info('Complete the MyAnimeList login in your browser, then return to the app.');
          return;
        }
        window.location.href = url;
        return;
      }
      const url = await getMalAuthUrl();
      window.location.href = url;
    } catch (err) {
      toast.error('Failed to generate MAL auth URL');
    }
  };

  const handleAniListConnect = () => {
    if (isDesktopApp()) {
      const url = getAniListAuthUrl(DESKTOP_ANILIST_REDIRECT_URI);
      if (openOAuthInBrowser(url)) {
        toast.info('Complete the AniList login in your browser, then return to the app.');
        return;
      }
      window.location.href = url;
      return;
    }
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

  // Use the non-sensitive identity columns to detect a linked account. The
  // access-token columns are not always returned to the client (column-level
  // grants), so keying "Connected" off the token left the badge stuck on
  // "Connect" even after a successful link. user_id/username are always cleared
  // on disconnect, so they're a reliable connection signal.
  const hasMAL = !!(profile?.mal_user_id || (profile as any)?.mal_access_token);
  const hasAniList = !!(
    profile?.anilist_user_id ||
    (profile as any)?.anilist_username ||
    (profile as any)?.anilist_access_token
  );

  /**
   * Single-button unified sync: anime + manga together in one modal. Prioritizes
   * AniList (source of truth) when both are linked, otherwise uses whichever is
   * connected. AniList's episode/chapter wins on any mismatch (server-enforced).
   */
  const handleOpenUnifiedSync = useCallback(async () => {
    const integration: Integration = hasAniList ? 'anilist' : 'mal';
    setSyncModalIntegration(integration);
    setSyncModalMediaType(undefined);
    setSyncModalOpen(true);
    await integrationSync.loadUnifiedPreview(integration);
  }, [integrationSync, hasAniList]);

  /**
   * Called when the user confirms selected items in the SyncPreviewModal.
   */
  const handleApplySyncModal = useCallback(async (selectedItems: SyncProposalItem[]) => {
    const result = await integrationSync.applySync(syncModalIntegration, selectedItems);
    if (result.success) {
      toast.success(`Sync applied successfully — ${selectedItems.length} change${selectedItems.length !== 1 ? 's' : ''} applied.`);
      setSyncModalOpen(false);
    } else {
      toast.error(`Sync failed: ${result.error}`);
    }
  }, [integrationSync, syncModalIntegration]);

  return (
    <>
      <div className="space-y-6">
        {user ? (
          <>
            {/* MyAnimeList */}
            <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
              <div className="absolute top-0 right-0 p-8 -mr-8 -mt-8 bg-[#2E51A2]/10 rounded-full blur-3xl group-hover:bg-[#2E51A2]/20 transition-all duration-500" />

              <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-[#2E51A2] flex items-center justify-center text-white font-black text-xl shadow-lg shadow-[#2E51A2]/20">
                    MAL
                  </div>
                  <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      MyAnimeList
                      {hasMAL && <SettingsBadge tone="success">Connected</SettingsBadge>}
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
                <div className="relative mt-5 pt-5 border-t border-white/5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-success" />
                    Auto-sync is active. Episode / chapter updates push to MAL in the background.
                  </div>
                </div>
              )}
            </div>

            {/* AniList */}
            <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
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
                      {hasAniList && <SettingsBadge tone="success">Connected</SettingsBadge>}
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
                <div className="relative mt-5 pt-5 border-t border-white/5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-success" />
                    Auto-sync is active. Chapter and episode updates push to AniList while you watch/read.
                  </div>
                </div>
              )}
            </div>

            {/* One unified Sync button — anime + manga together, one modal.
                Prioritizes AniList as the source of truth on any mismatch. */}
            {(hasMAL || hasAniList) && (
              <SettingsSection
                icon={RefreshCw}
                eyebrow="Sync"
                title="Sync everything"
                description={
                  hasAniList
                    ? 'Reviews anime & manga in one list before applying. AniList is the source of truth — its episode/chapter wins on any mismatch.'
                    : 'Reviews anime & manga in one list before applying. Syncs with MyAnimeList.'
                }
                action={
                  <Button
                    onClick={handleOpenUnifiedSync}
                    disabled={integrationSync.isLoadingPreview}
                    className="gap-2 text-white shadow-md w-full sm:w-auto"
                    style={{ backgroundColor: hasAniList ? '#02A9FF' : '#2E51A2' }}
                  >
                    {integrationSync.isLoadingPreview ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Sync{hasAniList ? ' with AniList' : ' with MAL'}
                  </Button>
                }
              />
            )}

            <SettingsSection
              title="What syncs"
              description="Anime watchlist / watch progress plus manga readlist / chapter progress are synced with connected services in the background."
            />
          </>
        ) : (
          <SettingsEmptyState
            icon={Link2}
            title="Sign in to connect external services"
            description="Link MyAnimeList or AniList to sync your watchlist, readlist, and progress automatically."
          />
        )}
      </div>

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
                          <Input
                            autoFocus
                            className="h-8 text-xs"
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

      {/* Smart Sync approval modal — always shown with manual confirmation required */}
      <SyncPreviewModal
        isOpen={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        onApply={handleApplySyncModal}
        items={integrationSync.previewItems}
        integration={syncModalIntegration}
        mediaType={syncModalMediaType}
        isLoading={integrationSync.isLoadingPreview}
        isApplying={integrationSync.isApplying}
      />
    </>
  );
}
