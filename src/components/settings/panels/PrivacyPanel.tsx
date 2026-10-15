import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, EyeOff, Globe, History, Search, Shield, Trash2 } from 'lucide-react';
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
  const { t } = useTranslation();
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
      toast.success(value ? t('privacy.publicNow') : t('privacy.privateNow'));
    } catch (error) {
      setIsPublic(!value);
      toast.error(t('privacy.updateFailed'));
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearHistory.mutateAsync();
      toast.success(t('privacy.historyCleared'));
      setShowClearConfirm(false);
    } catch {
      toast.error(t('privacy.historyClearFailed'));
    }
  };

  const matureControls = (signedIn: boolean) => (
    <SettingsSection
      id="mature-content-controls"
      icon={AlertTriangle}
      eyebrow={t('privacy.matureEyebrow')}
      title={t('privacy.matureTitle')}
      description={
        signedIn
          ? t('privacy.matureDescriptionSignedIn')
          : t('privacy.matureDescriptionGuest')
      }
    >
      <div>
        <SettingRow
          title={t('privacy.showEverywhere')}
          description={t('privacy.showEverywhereDescription')}
          control={
            <Switch
              checked={contentSafetySettings.showAdultEverywhere}
              onCheckedChange={(checked) => {
                updateContentSafetySettings({ showAdultEverywhere: checked });
                if (signedIn) {
                  toast.success(
                    checked
                      ? t('privacy.showEverywhereOn')
                      : t('privacy.showEverywhereOff'),
                  );
                }
              }}
            />
          }
        />
        <SettingRow
          title={t('privacy.blurSearch')}
          description={t('privacy.blurSearchDescription')}
          control={
            <Switch
              checked={contentSafetySettings.blurAdultInSearch}
              onCheckedChange={(checked) => {
                updateContentSafetySettings({ blurAdultInSearch: checked });
                if (signedIn) {
                  toast.success(checked ? t('privacy.blurSearchOn') : t('privacy.blurSearchOff'));
                }
              }}
            />
          }
        />
        <SettingRow
          title={t('privacy.warnBefore')}
          description={t('privacy.warnBeforeDescription')}
          control={
            <Switch
              checked={contentSafetySettings.warnBeforeAdultOpen}
              onCheckedChange={(checked) => {
                updateContentSafetySettings({ warnBeforeAdultOpen: checked });
                if (signedIn) {
                  toast.success(checked ? t('privacy.warnOn') : t('privacy.warnOff'));
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
        <SettingsSection icon={Shield} eyebrow={t('privacy.accountEyebrow')} title={t('privacy.profilePrivacyTitle')}>
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <p className="text-sm text-muted-foreground">{t('privacy.signInPrompt')}</p>
            <Button onClick={() => (window.location.href = '/auth')}>{t('privacy.signIn')}</Button>
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
        eyebrow={t('privacy.visibilityEyebrow')}
        title={t('privacy.publicProfileTitle')}
        description={t('privacy.publicProfileDescription')}
      >
        <div className="space-y-3">
          <SettingRow
            title={t('privacy.publicProfile')}
            badge={
              <SettingsBadge tone={isPublic ? 'success' : 'muted'}>
                {isPublic ? t('privacy.public') : t('privacy.private')}
              </SettingsBadge>
            }
            description={
              isPublic
                ? t('privacy.publicDescription')
                : t('privacy.privateDescription')
            }
            control={
              <Switch checked={isPublic} onCheckedChange={handlePrivacyChange} disabled={updatePrivacy.isPending} />
            }
          />
          <div className="rounded-xl border border-white/5 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">{t('privacy.visibleToOthers')}</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>{t('privacy.visibleInfo')}</li>
              <li>{t('privacy.visibleWatchlist')}</li>
              <li>{t('privacy.visibleHistory')}</li>
              <li>{t('privacy.visibleTierLists')}</li>
            </ul>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={History}
        eyebrow={t('privacy.historyEyebrow')}
        title={t('privacy.historyTitle')}
        description={t('privacy.historyDescription')}
      >
        <div>
          <SettingRow
            icon={Trash2}
            title={t('privacy.clearWatchHistory')}
            description={t('privacy.clearWatchHistoryDescription')}
            control={
              !showClearConfirm ? (
                <Button variant="destructive" size="sm" onClick={() => setShowClearConfirm(true)} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  {t('privacy.clear')}
                </Button>
              ) : undefined
            }
          >
            {showClearConfirm && (
              <div className="space-y-3">
                <div className="rounded-lg border border-destructive bg-destructive/20 p-3">
                  <p className="text-sm font-medium text-destructive">
                    {t('privacy.clearConfirm')}
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
                    {clearHistory.isPending ? t('common.clearing') : t('common.yesDeleteAll')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(false)} disabled={clearHistory.isPending}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </SettingRow>
          <SettingRow
            icon={Search}
            title={t('privacy.clearSearchHistory')}
            description={t('privacy.clearSearchHistoryDescription')}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  try {
                    localStorage.removeItem('tatakai_search_history');
                    toast.success(t('privacy.searchCleared'));
                  } catch {
                    toast.error(t('privacy.searchClearFailed'));
                  }
                }}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {t('privacy.clear')}
              </Button>
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
