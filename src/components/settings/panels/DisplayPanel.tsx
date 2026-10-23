import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FlaskConical, Gauge, Languages, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/ui/useTheme';
import { useAppLanguage } from '@/hooks/ui/useLanguage';
import { usePreferredTitleLanguage } from '@/hooks/ui/useTitleLanguage';
import { setPreferredTitleLanguage, setAccountTitleLanguage, type TitleLanguage } from '@/lib/titleLanguage';
import { FeatureFlag, useFeatureFlag, toggleFlag } from '@/core/feature-flags';
import {
  SettingRow,
  SettingsBadge,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';

type PreferredMangaLanguage = 'auto' | 'jp' | 'en' | 'kr' | 'zh';

const normalizePreferredMangaLanguage = (value: unknown): PreferredMangaLanguage => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'jp' || normalized.startsWith('ja') || normalized.includes('japanese')) return 'jp';
  if (normalized === 'kr' || normalized.startsWith('ko') || normalized.includes('korean')) return 'kr';
  if (normalized === 'zh' || normalized.startsWith('zh') || normalized.includes('chinese')) return 'zh';
  if (normalized === 'en' || normalized.startsWith('en') || normalized.includes('english')) return 'en';
  return 'auto';
};

/**
 * Display: app interface language, title/manga language, Ultra-Lite /
 * reduce-motion / high-contrast, and admin-only feature-flag overrides.
 */
export function DisplayPanel() {
  const { t } = useTranslation();
  const { user, profile, refreshProfile, isAdmin } = useAuth();
  const { theme, setTheme, reduceMotion, setReduceMotion, highContrast, setHighContrast } = useTheme();
  const { preference, setLanguage, supportedLanguages } = useAppLanguage();

  const preferredTitleLanguage = usePreferredTitleLanguage();
  const [preferredMangaLanguage, setPreferredMangaLanguage] = useState<PreferredMangaLanguage>('auto');

  const ffContentGraph = useFeatureFlag(FeatureFlag.CONTENT_GRAPH);
  const ffVirtualGrid = useFeatureFlag(FeatureFlag.VIRTUAL_GRID);
  const ffBlurhashImages = useFeatureFlag(FeatureFlag.BLURHASH_IMAGES);
  const ffTatakaiRuntime = useFeatureFlag(FeatureFlag.TATAKAI_RUNTIME);

  useEffect(() => {
    if (profile) {
      setPreferredMangaLanguage(normalizePreferredMangaLanguage((profile as any).preferred_manga_language));
    }
  }, [profile]);

  const handleTitleLanguageChange = async (value: TitleLanguage) => {
    const previousValue = preferredTitleLanguage;
    setPreferredTitleLanguage(value);
    if (!user?.id) {
      toast.success(t('display.titles.titleUpdated', { value: t(`display.titles.${value}`) }));
      return;
    }
    setAccountTitleLanguage(value);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_title_language: value })
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success(t('display.titles.titleUpdated', { value: t(`display.titles.${value}`) }));
    } catch (err) {
      setPreferredTitleLanguage(previousValue);
      setAccountTitleLanguage(previousValue);
      toast.error(t('display.titles.titleUpdateFailed'));
    }
  };

  const handleMangaLanguageChange = async (value: PreferredMangaLanguage) => {
    if (!user?.id) {
      toast.error(t('display.titles.signInRequired'));
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
      toast.success(t('display.titles.mangaUpdated'));
    } catch (err) {
      setPreferredMangaLanguage(previousValue);
      toast.error(t('display.titles.mangaUpdateFailed'));
    }
  };

  const handleAppLanguageChange = (value: string) => {
    const resolved = setLanguage(value);
    const label =
      value === 'auto'
        ? t('display.appLanguage.options.auto')
        : (supportedLanguages.find((l) => l.code === resolved)?.label ?? resolved);
    toast.success(t('display.appLanguage.saved', { language: label }));
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <SettingsSection
          icon={FlaskConical}
          eyebrow={t('display.admin.eyebrow')}
          title={t('display.admin.title')}
          description={t('display.admin.description')}
          action={<SettingsBadge tone="warning">{t('display.admin.badge')}</SettingsBadge>}
        >
          <div className="flex flex-col">
            <SettingRow
              title={t('display.admin.contentGraph')}
              description={t('display.admin.contentGraphDescription')}
              control={
                <Switch
                  checked={ffContentGraph}
                  onCheckedChange={(checked) => toggleFlag(FeatureFlag.CONTENT_GRAPH, checked)}
                />
              }
            />
            <SettingRow
              title={t('display.admin.virtualGrid')}
              description={t('display.admin.virtualGridDescription')}
              control={
                <Switch
                  checked={ffVirtualGrid}
                  onCheckedChange={(checked) => toggleFlag(FeatureFlag.VIRTUAL_GRID, checked)}
                />
              }
            />
            <SettingRow
              title={t('display.admin.blurhash')}
              description={t('display.admin.blurhashDescription')}
              control={
                <Switch
                  checked={ffBlurhashImages}
                  onCheckedChange={(checked) => toggleFlag(FeatureFlag.BLURHASH_IMAGES, checked)}
                />
              }
            />
            <SettingRow
              title={t('display.admin.runtime')}
              description={t('display.admin.runtimeDescription')}
              control={
                <Switch
                  checked={ffTatakaiRuntime}
                  onCheckedChange={(checked) => toggleFlag(FeatureFlag.TATAKAI_RUNTIME, checked)}
                />
              }
            />
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        icon={Languages}
        eyebrow={t('display.appLanguage.eyebrow')}
        title={t('display.appLanguage.title')}
        description={t('display.appLanguage.description')}
      >
        <div className="flex flex-col">
          <SettingRow
            title={t('display.appLanguage.label')}
            description={t('display.appLanguage.labelDescription')}
            control={
              <Select value={preference} onValueChange={handleAppLanguageChange}>
                <SelectTrigger className="h-9 w-44 rounded-lg text-sm">
                  <SelectValue placeholder={t('display.titles.selectLanguage')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('display.appLanguage.options.auto')}</SelectItem>
                  {supportedLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {t(`display.appLanguage.options.${lang.code}`, { defaultValue: lang.label })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Languages}
        eyebrow={t('display.titles.eyebrow')}
        title={t('display.titles.title')}
        description={t('display.titles.description')}
      >
        <div className="flex flex-col">
          <SettingRow
            title={t('display.titles.preferredTitle')}
            description={t('display.titles.preferredTitleDescription')}
            control={
              <Select value={preferredTitleLanguage} onValueChange={(value: TitleLanguage) => handleTitleLanguageChange(value)}>
                <SelectTrigger className="h-9 w-36 rounded-lg text-sm">
                  <SelectValue placeholder={t('display.titles.selectLanguage')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="romaji">{t('display.titles.romaji')}</SelectItem>
                  <SelectItem value="english">{t('display.titles.english')}</SelectItem>
                  <SelectItem value="native">{t('display.titles.native')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title={t('display.titles.preferredManga')}
            description={t('display.titles.preferredMangaDescription')}
            control={
              <Select value={preferredMangaLanguage} onValueChange={(value: PreferredMangaLanguage) => handleMangaLanguageChange(value)}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm">
                  <SelectValue placeholder={t('display.titles.selectLanguage')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('display.titles.auto')}</SelectItem>
                  <SelectItem value="en">{t('display.titles.en')}</SelectItem>
                  <SelectItem value="jp">{t('display.titles.jp')}</SelectItem>
                  <SelectItem value="kr">{t('display.titles.kr')}</SelectItem>
                  <SelectItem value="zh">{t('display.titles.zh')}</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Gauge}
        eyebrow={t('display.motion.eyebrow')}
        title={t('display.motion.title')}
        description={t('display.motion.description')}
      >
        <div className="flex flex-col">
          <SettingRow
            tone="accent"
            title={t('display.motion.ultraLite')}
            badge={<SettingsBadge tone="warning">{t('display.motion.maxSpeed')}</SettingsBadge>}
            icon={Sparkles}
            description={t('display.motion.ultraLiteDescription')}
            control={
              <Switch
                aria-label={t('display.motion.ultraLite')}
                checked={theme === 'ultra-lite'}
                onCheckedChange={(checked) => setTheme(checked ? 'ultra-lite' : 'cherry-blossom')}
              />
            }
          />
          <SettingRow
            title={t('display.motion.reduceMotion')}
            description={t('display.motion.reduceMotionDescription')}
            control={<Switch aria-label={t('display.motion.reduceMotion')} checked={reduceMotion} onCheckedChange={setReduceMotion} />}
          />
          <SettingRow
            title={t('display.motion.highContrast')}
            description={t('display.motion.highContrastDescription')}
            control={<Switch aria-label={t('display.motion.highContrast')} checked={highContrast} onCheckedChange={setHighContrast} />}
          />
        </div>
      </SettingsSection>
    </div>
  );
}
