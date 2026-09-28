import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Eye, EyeOff, Globe, History, Search, Shield, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { useUpdateProfilePrivacy } from '@/hooks/user/useProfileFeatures';
import { useClearAllWatchHistory } from '@/hooks/user/useWatchHistory';
import {
  SettingRow,
  SettingsBadge,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';

/**
 * Privacy: mature-content controls, public-profile toggle, and history clears.
 * Extracted from the old "privacy" tab. `section` scrolls a sub-anchor (e.g.
 * `mature-content-controls`) into view once mounted, for deep-links.
 */
export function PrivacyPanel({ section }: { section?: string }) {
  const { user, profile } = useAuth();
  const { settings: contentSafetySettings, updateSettings: updateContentSafetySettings } = useContentSafetySettings();
  const updatePrivacy = useUpdateProfilePrivacy();
  const clearHistory = useClearAllWatchHistory();

  const [isPublic, setIsPublic] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    if (profile) {
      setIsPublic(profile.is_public ?? true);
    }
  }, [profile]);

  useEffect(() => {
    if (!section) return;
    const el = document.getElementById(section);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [section]);

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

  const handleClearHistory = async () => {
    try {
      await clearHistory.mutateAsync();
      toast.success('All watch history cleared');
      setShowClearConfirm(false);
    } catch {
      toast.error('Failed to clear history');
    }
  };

  const matureControls = (signedIn: boolean) => (
    <SettingsSection
      id="mature-content-controls"
      icon={AlertTriangle}
      eyebrow="Content safety"
      title="Mature content controls"
      description={
        signedIn
          ? 'Hide 18+ titles by default, blur explicit search results, and decide whether warnings appear before opening.'
          : 'These settings are local to this device and apply even when you are not signed in.'
      }
    >
      <div>
        <SettingRow
          title="Show Mature Media Everywhere"
          description="Includes mature titles in home shelves and non-explicit discovery lists."
          control={
            <Switch
              checked={contentSafetySettings.showAdultEverywhere}
              onCheckedChange={(checked) => {
                updateContentSafetySettings({ showAdultEverywhere: checked });
                if (signedIn) {
                  toast.success(
                    checked
                      ? 'Mature media is now visible across discovery.'
                      : 'Mature media will stay hidden unless explicitly searched.',
                  );
                }
              }}
            />
          }
        />
        <SettingRow
          title="Blur Mature Search Results"
          description="When explicit queries are used in safe mode, mature covers stay blurred in search results."
          control={
            <Switch
              checked={contentSafetySettings.blurAdultInSearch}
              onCheckedChange={(checked) => {
                updateContentSafetySettings({ blurAdultInSearch: checked });
                if (signedIn) {
                  toast.success(checked ? 'Mature search results will be blurred.' : 'Mature search results will be shown clearly.');
                }
              }}
            />
          }
        />
        <SettingRow
          title="Warn Before Opening Mature Media"
          description="Shows a warning screen before loading mature manga or anime details, chapters, or episodes."
          control={
            <Switch
              checked={contentSafetySettings.warnBeforeAdultOpen}
              onCheckedChange={(checked) => {
                updateContentSafetySettings({ warnBeforeAdultOpen: checked });
                if (signedIn) {
                  toast.success(checked ? 'Mature content warnings enabled.' : 'Mature content warnings disabled.');
                }
              }}
            />
          }
        />
      </div>
    </SettingsSection>
  );

  if (!user) {
    return (
      <div className="space-y-6">
        {matureControls(false)}
        <SettingsSection icon={Shield} eyebrow="Account" title="Profile privacy">
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <p className="text-sm text-muted-foreground">Sign in to manage profile privacy settings</p>
            <Button onClick={() => (window.location.href = '/auth')}>Sign In</Button>
          </div>
        </SettingsSection>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {matureControls(true)}

      <SettingsSection
        icon={isPublic ? Globe : EyeOff}
        eyebrow="Visibility"
        title="Public profile"
        description="Control who can see your profile, watchlist, and history."
      >
        <div className="space-y-3">
          <SettingRow
            title="Public Profile"
            badge={
              <SettingsBadge tone={isPublic ? 'success' : 'muted'}>
                {isPublic ? 'Public' : 'Private'}
              </SettingsBadge>
            }
            description={
              isPublic
                ? 'Your profile, watchlist, and history are visible to everyone.'
                : 'Only you can see your profile, watchlist, and history.'
            }
            control={
              <Switch checked={isPublic} onCheckedChange={handlePrivacyChange} disabled={updatePrivacy.isPending} />
            }
          />
          <div className="rounded-xl border border-white/5 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">When your profile is public, other users can view your:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Profile information and avatar</li>
              <li>Watchlist (favorited anime)</li>
              <li>Watch history and progress</li>
              <li>Tier lists you've created</li>
            </ul>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={History}
        eyebrow="Data"
        title="History"
        description="Permanently remove your watch and search history."
      >
        <div>
          <SettingRow
            icon={Trash2}
            title="Clear Watch History"
            description="Permanently delete all your watch history. This action cannot be undone."
            control={
              !showClearConfirm ? (
                <Button variant="destructive" size="sm" onClick={() => setShowClearConfirm(true)} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              ) : undefined
            }
          >
            {showClearConfirm && (
              <div className="space-y-3">
                <div className="rounded-lg border border-destructive bg-destructive/20 p-3">
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
                    <Trash2 className="h-4 w-4" />
                    {clearHistory.isPending ? 'Clearing...' : 'Yes, Delete All'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(false)} disabled={clearHistory.isPending}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </SettingRow>
          <SettingRow
            icon={Search}
            title="Clear Search History"
            description="Delete all your search history stored locally on this device."
            control={
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
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
