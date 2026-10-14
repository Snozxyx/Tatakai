import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Link2, Trash2, CheckCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getMalAuthUrl, disconnectMal, assertWebMalRedirectMatchesOrigin, isMalLoginPendingFresh, clearMalOAuthStorage } from '@/lib/mal';
import {
  getMangaBakaAuthUrl,
  disconnectMangaBaka,
  getMangaBakaStatus,
  assertWebMangabakaRedirectMatchesOrigin,
  isMangaBakaLoginPendingFresh,
  clearMangaBakaOAuthStorage,
  readMangaBakaCachedStatus,
  MANGABAKA_ACCENT,
  MANGABAKA_LOGO_URL,
  MANGABAKA_SITE_URL,
} from '@/lib/mangabaka';
import { getAniListAuthUrl, disconnectAniList } from '@/lib/externalIntegrations';
import {
  isNativeOAuthApp,
  openOAuthInBrowser,
  buildDesktopOAuthState,
  getWebAnilistRedirectUri,
  getWebMalRedirectUri,
  getWebMangabakaRedirectUri,
} from '@/lib/desktopOAuth';
import { toast } from 'sonner';
import { SyncPreviewModal } from '@/components/integrations/SyncPreviewModal';
import { useIntegrationSync, type Integration, type MediaType, type SyncProposalItem } from '@/hooks/user/useIntegrationSync';
import {
  SettingsBadge,
  SettingsEmptyState,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';

export function IntegrationsPanel() {
  const { user, profile, refreshProfile } = useAuth();

  // MangaBaka (OAuth2) state — tokens live server-side; the UI only learns
  // { connected, username } from the status endpoint. Initialized from the
  // local snapshot so the card paints instantly like MAL/AniList; the server
  // check revalidates in the background and corrects it if it changed.
  const [hasMangaBaka, setHasMangaBaka] = useState(() => {
    try {
      return readMangaBakaCachedStatus().connected;
    } catch {
      return false;
    }
  });
  const [mangabakaUsername, setMangabakaUsername] = useState<string | null>(() => {
    try {
      return readMangaBakaCachedStatus().username;
    } catch {
      return null;
    }
  });
  const [isMangaBakaStatusLoading, setIsMangaBakaStatusLoading] = useState(false);
  const [mangabakaStatusError, setMangabakaStatusError] = useState<string | null>(null);
  const [mangabakaLogoFailed, setMangabakaLogoFailed] = useState(false);

  // Hydrate MangaBaka connection state (server holds the tokens). A failed
  // check surfaces as an error (with retry) — never as a fake "not connected".
  const refreshMangaBakaStatus = useCallback(async () => {
    if (!user) {
      setHasMangaBaka(false);
      setMangabakaUsername(null);
      setMangabakaStatusError(null);
      return;
    }
    setIsMangaBakaStatusLoading(true);
    try {
      const s = await getMangaBakaStatus();
      setHasMangaBaka(s.connected);
      setMangabakaUsername(s.username);
      setMangabakaStatusError(null);
    } catch (err) {
      setHasMangaBaka(false);
      setMangabakaUsername(null);
      setMangabakaStatusError(err instanceof Error ? err.message : 'Could not reach the MangaBaka status.');
    } finally {
      setIsMangaBakaStatusLoading(false);
    }
  }, [user]);

  // Hydrate MangaBaka connection state (server holds the tokens).
  useEffect(() => {
    void refreshMangaBakaStatus();
  }, [refreshMangaBakaStatus]);

  // Smart Sync (approval-modal) State
  const integrationSync = useIntegrationSync();
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncModalIntegration, setSyncModalIntegration] = useState<Integration>('mal');
  const [syncModalMediaType, setSyncModalMediaType] = useState<MediaType | undefined>(undefined);

  const handleMALConnect = async (force = false) => {
    try {
      // Each Connect click mints a fresh PKCE verifier, permanently invalidating
      // any MAL tab opened by a previous click (its code would die with
      // `invalid_grant`). If a login is still in flight, make restarting
      // explicit instead of silently dooming the open tab.
      if (!force && isMalLoginPendingFresh()) {
        toast.warning('A MyAnimeList login is already in progress.', {
          description: 'Only the newest MAL tab can complete — finish it, or discard it and start fresh.',
          duration: 10000,
          action: {
            label: 'Discard & restart',
            onClick: () => {
              clearMalOAuthStorage();
              void handleMALConnect(true);
            },
          },
        });
        return;
      }
      if (isNativeOAuthApp()) {
        // Packaged apps use the shared https redirect + a state marker; the web
        // redirect page forwards the callback to the app via `tatakai://`
        // (AniList/MAL dashboards only need the https URI registered).
        const url = await getMalAuthUrl(getWebMalRedirectUri(), buildDesktopOAuthState());
        if (await openOAuthInBrowser(url)) {
          toast.info('Complete the MyAnimeList login in your browser, then return to the app.');
          return;
        }
        // In-app navigation to myanimelist.net is blocked by the desktop
        // shell (will-navigate allow-list), so falling back to it would leave
        // the user stuck. Surface the failure instead of a dead navigation.
        toast.error('Could not open your browser for MyAnimeList login. Please copy the login link manually.', {
          action: {
            label: 'Copy link',
            onClick: () => {
              void navigator.clipboard?.writeText(url).then(
                () => toast.success('Login link copied — paste it into your browser.'),
                () => toast.error('Copy failed. Please try again.'),
              );
            },
          },
        });
        return;
      }
      const redirectUri = getWebMalRedirectUri();
      // Origin check BEFORE minting a verifier/state: generating the URL
      // overwrites the stored PKCE verifier, which permanently invalidates any
      // MAL tab opened by a previous click. A localhost build sending the
      // production redirect URI (or vice versa) can never complete — surface
      // the setup fix instead of dooming the previous tab and navigating.
      try {
        assertWebMalRedirectMatchesOrigin(redirectUri);
      } catch (err) {
        // assertWebMalRedirectMatchesOrigin throws the setup explanation;
        // anything else (URL parse) falls through to the navigation attempt.
        if (err instanceof Error && err.message.startsWith("MAL login can't complete")) {
          toast.error(err.message, { duration: 9000 });
          return;
        }
      }
      window.location.href = getMalAuthUrl(redirectUri);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open MyAnimeList login.');
    }
  };

  const handleAniListConnect = async () => {
    try {
      if (isNativeOAuthApp()) {
        // Same https bridge as MAL: `tatakai://` is never sent as redirect_uri.
        const url = getAniListAuthUrl(getWebAnilistRedirectUri(), buildDesktopOAuthState());
        if (await openOAuthInBrowser(url)) {
          toast.info('Complete the AniList login in your browser, then return to the app.');
          return;
        }
        toast.error('Could not open your browser for AniList login. Please copy the login link manually.', {
          action: {
            label: 'Copy link',
            onClick: () => {
              void navigator.clipboard?.writeText(url).then(
                () => toast.success('Login link copied — paste it into your browser.'),
                () => toast.error('Copy failed. Please try again.'),
              );
            },
          },
        });
        return;
      }
      window.location.href = getAniListAuthUrl();
    } catch {
      toast.error('Could not open AniList login. Please try again.');
    }
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

  const handleMangaBakaConnect = async (force = false) => {
    try {
      // Same guard as MAL: each Connect click mints a fresh verifier, killing
      // any MangaBaka tab opened by a previous click.
      if (!force && isMangaBakaLoginPendingFresh()) {
        toast.warning('A MangaBaka login is already in progress.', {
          description: 'Only the newest MangaBaka tab can complete — finish it, or discard it and start fresh.',
          duration: 10000,
          action: {
            label: 'Discard & restart',
            onClick: () => {
              clearMangaBakaOAuthStorage();
              void handleMangaBakaConnect(true);
            },
          },
        });
        return;
      }
      if (isNativeOAuthApp()) {
        const url = await getMangaBakaAuthUrl(getWebMangabakaRedirectUri(), buildDesktopOAuthState());
        if (await openOAuthInBrowser(url)) {
          toast.info('Complete the MangaBaka login in your browser, then return to the app.');
          return;
        }
        toast.error('Could not open your browser for MangaBaka login. Please copy the login link manually.', {
          action: {
            label: 'Copy link',
            onClick: () => {
              void navigator.clipboard?.writeText(url).then(
                () => toast.success('Login link copied — paste it into your browser.'),
                () => toast.error('Copy failed. Please try again.'),
              );
            },
          },
        });
        return;
      }
      const redirectUri = getWebMangabakaRedirectUri();
      try {
        assertWebMangabakaRedirectMatchesOrigin(redirectUri);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("MangaBaka login can't complete")) {
          toast.error(err.message, { duration: 9000 });
          return;
        }
      }
      window.location.href = await getMangaBakaAuthUrl(redirectUri);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open MangaBaka login.');
    }
  };

  const handleMangaBakaDisconnect = async () => {
    try {
      await disconnectMangaBaka();
      setHasMangaBaka(false);
      setMangabakaUsername(null);
      setMangabakaStatusError(null);
      toast.success('MangaBaka disconnected');
    } catch {
      toast.error('Failed to disconnect MangaBaka');
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
   * Per-service full sync: watchlist + watch history + readlist diffed against
   * the chosen tracker (import, export, and conflicts) in one approval modal.
   * MangaBaka syncs the manga readlist (it is a manga-only tracker).
   */
  const handleOpenSync = useCallback(async (integration: Integration) => {
    setSyncModalIntegration(integration);
    setSyncModalMediaType(undefined);
    setSyncModalOpen(true);
    await integrationSync.loadUnifiedPreview(integration);
  }, [integrationSync]);

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
                      onClick={() => void handleMALConnect()}
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

            {/* MangaBaka — OAuth2 manga tracker */}
            <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
              <div className="absolute top-0 right-0 p-8 -mr-8 -mt-8 bg-[#e30047]/10 rounded-full blur-3xl group-hover:bg-[#e30047]/20 transition-all duration-500" />

              <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-[#1a1a1e] border border-white/10 flex items-center justify-center overflow-hidden shadow-lg shadow-[#e30047]/10">
                    {!mangabakaLogoFailed ? (
                      <img
                        src={MANGABAKA_LOGO_URL}
                        alt="MangaBaka"
                        className="w-10 h-10 object-contain"
                        loading="lazy"
                        onError={() => setMangabakaLogoFailed(true)}
                      />
                    ) : (
                      <span className="text-[#e30047] font-black text-lg">MB</span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      MangaBaka
                      {hasMangaBaka && <SettingsBadge tone="success">Connected</SettingsBadge>}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {hasMangaBaka
                        ? `Linked to MangaBaka account: ${mangabakaUsername || 'Active'}`
                        : 'Sync your manga readlist and chapter progress automatically'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {hasMangaBaka ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleMangaBakaDisconnect()}
                      className="gap-2 border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/40 transition-all w-full sm:w-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="default"
                      onClick={() => void handleMangaBakaConnect()}
                      disabled={isMangaBakaStatusLoading}
                      className="gap-2 bg-[#e30047] hover:bg-[#e30047]/90 text-white px-6 shadow-lg shadow-[#e30047]/20"
                    >
                      {isMangaBakaStatusLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ExternalLink className="w-4 h-4" />
                      )}
                      Connect MangaBaka
                    </Button>
                  )}
                </div>
              </div>

              {hasMangaBaka ? (
                <div className="relative mt-5 pt-5 border-t border-white/5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-success" />
                    Auto-sync is active. Chapter updates push to MangaBaka while you read.
                    Manage the connection anytime from{' '}
                    <a
                      href={MANGABAKA_SITE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-foreground"
                    >
                      mangabaka.org
                    </a>.
                  </div>
                </div>
              ) : mangabakaStatusError ? (
                <div className="relative mt-5 pt-5 border-t border-white/5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-amber-400">
                    <span>Couldn't check the MangaBaka connection: {mangabakaStatusError}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={isMangaBakaStatusLoading}
                      onClick={() => void refreshMangaBakaStatus()}
                    >
                      {isMangaBakaStatusLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Retry
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Per-service full sync — one button per connected tracker.
                Watchlist + watch history + readlist are diffed against the
                tracker (import, export, conflicts) in one approval modal.
                MangaBaka covers the manga readlist (manga-only tracker). */}
            {(hasMAL || hasAniList || hasMangaBaka) && (
              <SettingsSection
                icon={RefreshCw}
                eyebrow="Sync"
                title="Sync"
                description="Review changes per service before applying. Episode and chapter updates also push automatically in the background."
              >
                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                  {hasMAL && (
                    <Button
                      onClick={() => void handleOpenSync('mal')}
                      disabled={integrationSync.isLoadingPreview}
                      className="gap-2 text-white shadow-md w-full sm:w-auto"
                      style={{ backgroundColor: '#2E51A2' }}
                    >
                      {integrationSync.isLoadingPreview ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Sync with MyAnimeList
                    </Button>
                  )}
                  {hasAniList && (
                    <Button
                      onClick={() => void handleOpenSync('anilist')}
                      disabled={integrationSync.isLoadingPreview}
                      className="gap-2 text-white shadow-md w-full sm:w-auto"
                      style={{ backgroundColor: '#02A9FF' }}
                    >
                      {integrationSync.isLoadingPreview ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Sync with AniList
                    </Button>
                  )}
                  {hasMangaBaka && (
                    <Button
                      onClick={() => void handleOpenSync('mangabaka')}
                      disabled={integrationSync.isLoadingPreview}
                      className="gap-2 text-white shadow-md w-full sm:w-auto"
                      style={{ backgroundColor: MANGABAKA_ACCENT }}
                    >
                      {integrationSync.isLoadingPreview ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Sync with MangaBaka
                    </Button>
                  )}
                </div>
              </SettingsSection>
            )}

            <SettingsSection
              title="What syncs"
              description="Watchlist, watch history, and manga readlist with chapter progress sync with each connected service after you review the changes. Episode and chapter updates also push automatically in the background."
            />
          </>
        ) : (
          <SettingsEmptyState
            icon={Link2}
            title="Sign in to connect external services"
            description="Link MyAnimeList, AniList, or MangaBaka to sync your watchlist, readlist, and progress automatically."
          />
        )}
      </div>

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
