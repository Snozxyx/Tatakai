import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { ThemeSelector } from '@/components/settings/ThemeSelector';
import { VideoSettingsPanel } from '@/components/video/VideoSettingsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useUpdateProfilePrivacy } from '@/hooks/useProfileFeatures';
import { useChangelog } from '@/hooks/useAdminFeatures';
import { useClearAllWatchHistory } from '@/hooks/useWatchHistory';
import { getMALAuthUrl, getAniListAuthUrl, disconnectMAL, disconnectAniList } from '@/lib/externalIntegrations';
import { toast } from 'sonner';
import {
  ArrowLeft, Palette, Film, Monitor, Info, Link2, Eye, EyeOff, Globe, CheckCircle, ExternalLink, Shield, History, Trash2, Search, Smartphone, Download, Wifi, FolderOpen, Play, Zap, Gauge
} from 'lucide-react';

// Fallback changelog entries if database is empty
const FALLBACK_CHANGELOG = [
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

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { themes } = useTheme();
  const updatePrivacy = useUpdateProfilePrivacy();
  const clearHistory = useClearAllWatchHistory();
  const { data: dbChangelog = [], isLoading: loadingChangelog } = useChangelog();
  const [isPublic, setIsPublic] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Mobile app settings (disabled for web)
  const isNative = false;
  const [downloadWifiOnly, setDownloadWifiOnly] = useState(() => {
    try {
      return localStorage.getItem('tatakai_download_wifi_only') === 'true';
    } catch {
      return false;
    }
  });
  const [offlinePlaybackEnabled, setOfflinePlaybackEnabled] = useState(() => {
    try {
      return localStorage.getItem('tatakai_offline_playback') !== 'false';
    } catch {
      return true;
    }
  });
  const [downloadLocation, setDownloadLocation] = useState(() => {
    try {
      return localStorage.getItem('tatakai_download_location') || 'internal';
    } catch {
      return 'internal';
    }
  });
  
  const [ultraLiteMode, setUltraLiteMode] = useState(() => {
    try {
      return localStorage.getItem('tatakai_ultra_lite_mode') === 'true';
    } catch {
      return false;
    }
  });

  const handleUltraLiteModeChange = (enabled: boolean) => {
    setUltraLiteMode(enabled);
    try {
      localStorage.setItem('tatakai_ultra_lite_mode', enabled.toString());
      
      // Apply ultra lite mode effects
      if (enabled) {
        // Disable animations and reduce motion
        document.documentElement.style.setProperty('--motion-scale', '0.5');
        document.body.classList.add('ultra-lite-mode');
        // Reduce image quality
        document.documentElement.style.setProperty('--image-quality', 'low');
        // Reduce particle effects
        document.body.classList.add('reduce-motion');
        toast.success('Ultra Lite Mode enabled - Performance optimized');
      } else {
        // Restore normal settings
        document.documentElement.style.setProperty('--motion-scale', '1');
        document.body.classList.remove('ultra-lite-mode');
        document.documentElement.style.setProperty('--image-quality', 'high');
        document.body.classList.remove('reduce-motion');
        toast.success('Ultra Lite Mode disabled - Normal settings restored');
      }
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleDownloadLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setDownloadLocation(value);
    localStorage.setItem('tatakai_download_location', value);
    toast.success(`Download location set to ${value === 'internal' ? 'Internal' : 'External'} Storage`);
  };

  // Use database changelog if available, otherwise fallback
  const CHANGELOG = dbChangelog.length > 0
    ? dbChangelog.map(c => ({ version: c.version, date: c.release_date, changes: c.changes }))
    : FALLBACK_CHANGELOG;

  useEffect(() => {
    if (profile) {
      setIsPublic(profile.is_public ?? true);
    }
  }, [profile]);

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

  const handleMALConnect = () => {
    window.location.href = getMALAuthUrl();
  };

  const handleAniListConnect = () => {
    window.location.href = getAniListAuthUrl();
  };

  const handleMALDisconnect = async () => {
    if (!user) return;
    try {
      await disconnectMAL(user.id);
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

  const handleDownloadWifiOnlyChange = (value: boolean) => {
    setDownloadWifiOnly(value);
    try {
      localStorage.setItem('tatakai_download_wifi_only', value.toString());
      toast.success(value ? 'Downloads will only use Wi-Fi' : 'Downloads can use any network');
    } catch {
      toast.error('Failed to save setting');
    }
  };

  const handleOfflinePlaybackChange = (value: boolean) => {
    setOfflinePlaybackEnabled(value);
    try {
      localStorage.setItem('tatakai_offline_playback', value.toString());
      toast.success(value ? 'Offline playback enabled' : 'Offline playback disabled');
    } catch {
      toast.error('Failed to save setting');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Background />
      <Sidebar />

      <main className="relative z-10 pl-6 md:pl-32 pr-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
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
        <Tabs defaultValue="appearance" className="space-y-6">
          <TabsList className="bg-muted/50 p-1 flex-wrap h-auto gap-1">
            <TabsTrigger value="appearance" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Palette className="w-4 h-4" />
              Appearance
            </TabsTrigger>
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
            {isNative && (
              <TabsTrigger value="app" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Smartphone className="w-4 h-4" />
                App
              </TabsTrigger>
            )}
          </TabsList>

          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <ThemeSelector />
          </TabsContent>

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
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                  <div>
                    <p className="font-medium">Ultra Lite Mode</p>
                    <p className="text-sm text-muted-foreground">Maximum performance mode for low-end devices and slow connections</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={ultraLiteMode}
                      onChange={(e) => handleUltraLiteModeChange(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                  <div>
                    <p className="font-medium">Reduce Motion (Soon)</p>
                    <p className="text-sm text-muted-foreground">Minimize animations for better performance</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                  <div>
                    <p className="font-medium">High Contrast Mode (Soon)</p>
                    <p className="text-sm text-muted-foreground">Increase visual contrast for accessibility</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
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
                <div className="text-center py-8">
                  <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Sign in to manage your privacy settings</p>
                  <Button onClick={() => navigate('/auth')} className="mt-4">
                    Sign In
                  </Button>
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
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-[#2E51A2] flex items-center justify-center text-white font-bold text-lg">
                        MAL
                      </div>
                      <div>
                        <p className="font-medium">MyAnimeList</p>
                        <p className="text-sm text-muted-foreground">
                          {hasMAL ? (
                            <span className="flex items-center gap-1 text-green-500">
                              <CheckCircle className="w-3 h-3" />
                              Connected
                            </span>
                          ) : (
                            'Sync your anime list and ratings'
                          )}
                        </p>
                      </div>
                    </div>
                    {hasMAL ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleMALDisconnect}
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleMALConnect}
                        className="gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Connect
                      </Button>
                    )}
                  </div>

                  {/* AniList */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-[#02A9FF] flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
                          <path d="M6.361 2.943 0 21.056h4.942l1.077-3.133H11.4l1.052 3.133H22.9c.71 0 1.1-.392 1.1-1.101V17.53c0-.71-.39-1.101-1.1-1.101h-6.483V4.045c0-.71-.392-1.102-1.101-1.102h-2.422c-.71 0-1.101.392-1.101 1.102v1.064l-.758-2.166zm2.324 5.948 1.688 5.018H7.144z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium">AniList</p>
                        <p className="text-sm text-muted-foreground">
                          {hasAniList ? (
                            <span className="flex items-center gap-1 text-green-500">
                              <CheckCircle className="w-3 h-3" />
                              Connected
                            </span>
                          ) : (
                            'Sync your anime list and activity'
                          )}
                        </p>
                      </div>
                    </div>
                    {hasAniList ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAniListDisconnect}
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleAniListConnect}
                        className="gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Connect
                      </Button>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-muted/20 border border-muted">
                    <p className="text-sm text-muted-foreground">
                      <strong>What syncs:</strong> Your watchlist, watch progress, and ratings will be
                      automatically synced with connected services. This happens in real-time as you watch.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Link2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Sign in to connect external services</p>
                  <Button onClick={() => navigate('/auth')} className="mt-4">
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
                <div className="p-4 rounded-xl bg-muted/30">
                  <p className="font-medium mb-1">Tatakai</p>
                  <p className="text-sm text-muted-foreground">Version {__APP_VERSION__}</p>
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
                      onClick={() => navigate('/terms')}
                      className="justify-start"
                    >
                      Terms & Conditions
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/dmca')}
                      className="justify-start"
                    >
                      DMCA Policy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate('/suggestions')}
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

          {/* App Settings Tab - Only on native platforms */}
          {isNative && (
            <TabsContent value="app">
              <GlassPanel className="p-6">
                <h2 className="font-display text-xl font-semibold mb-6 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-primary" />
                  App Settings
                </h2>
                <div className="space-y-6">
                  {/* App Logo & Version */}
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30">
                    <img
                      src="/logo.png"
                      alt="Tatakai"
                      className="w-16 h-16 rounded-xl"
                    />
                    <div>
                      <p className="font-bold text-lg">Tatakai</p>
                      <p className="text-sm text-muted-foreground">Version {__APP_VERSION__}</p>
                    </div>
                  </div>

                  {/* Download Location */}
                  <div className="p-4 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-4 mb-3">
                      <FolderOpen className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">Download Location</p>
                        <p className="text-sm text-muted-foreground">Choose where to save downloaded videos</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <select
                        value={downloadLocation}
                        onChange={handleDownloadLocationChange}
                        className="w-full bg-muted/50 border border-border/50 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="internal">Internal Storage (/data/data/...)</option>
                        <option value="external">External Storage (/sdcard/Android/...)</option>
                      </select>
                      <p className="text-xs text-muted-foreground pl-1">
                        Note: External storage requires additional permissions.
                      </p>
                    </div>
                  </div>

                  {/* Offline Playback */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-4">
                      <Play className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">Offline Playback</p>
                        <p className="text-sm text-muted-foreground">
                          Watch downloaded videos with subtitles when offline
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={offlinePlaybackEnabled}
                      onCheckedChange={handleOfflinePlaybackChange}
                    />
                  </div>

                  {/* Download over Wi-Fi Only */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                    <div className="flex items-center gap-4">
                      <Wifi className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          Download over Wi-Fi Only
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Only download videos when connected to Wi-Fi
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={downloadWifiOnly}
                      onCheckedChange={handleDownloadWifiOnlyChange}
                    />
                  </div>

                  {/* View Downloads */}
                  <Button
                    onClick={() => navigate('/downloads')}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <Download className="w-4 h-4" />
                    View Downloaded Videos
                  </Button>
                </div>
              </GlassPanel>
            </TabsContent>
          )}
        </Tabs>
      </main>

      <MobileNav />
    </div>
  );
}
