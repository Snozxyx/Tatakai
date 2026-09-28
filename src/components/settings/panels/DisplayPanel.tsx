import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FlaskConical, Gauge, Languages, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/ui/useTheme';
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
 * Display: title/manga language, Ultra-Lite / reduce-motion / high-contrast,
 * and admin-only feature-flag overrides. Extracted from the old "display" tab.
 */
export function DisplayPanel() {
  const { user, profile, refreshProfile, isAdmin } = useAuth();
  const { theme, setTheme, reduceMotion, setReduceMotion, highContrast, setHighContrast } = useTheme();

  const [preferredTitleLanguage, setPreferredTitleLanguage] = useState<'romaji' | 'english' | 'native'>('romaji');
  const [preferredMangaLanguage, setPreferredMangaLanguage] = useState<PreferredMangaLanguage>('auto');

  const ffContentGraph = useFeatureFlag(FeatureFlag.CONTENT_GRAPH);
  const ffVirtualGrid = useFeatureFlag(FeatureFlag.VIRTUAL_GRID);
  const ffBlurhashImages = useFeatureFlag(FeatureFlag.BLURHASH_IMAGES);
  const ffTatakaiRuntime = useFeatureFlag(FeatureFlag.TATAKAI_RUNTIME);

  useEffect(() => {
    if (profile) {
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

  return (
    <div className="space-y-6">
      {isAdmin && (
        <SettingsSection
          icon={FlaskConical}
          eyebrow="Admin"
          title="Feature flags"
          description="Override experimental features via localStorage."
          action={<SettingsBadge tone="warning">Admin</SettingsBadge>}
        >
          <div className="flex flex-col">
            <SettingRow
              title="Content Graph"
              description="Use AniList/Jikan content graph APIs"
              control={
                <Switch
                  checked={ffContentGraph}
                  onCheckedChange={(checked) => toggleFlag(FeatureFlag.CONTENT_GRAPH, checked)}
                />
              }
            />
            <SettingRow
              title="Virtual Grid"
              description="Render large browse lists with virtualization"
              control={
                <Switch
                  checked={ffVirtualGrid}
                  onCheckedChange={(checked) => toggleFlag(FeatureFlag.VIRTUAL_GRID, checked)}
                />
              }
            />
            <SettingRow
              title="BlurHash Covers"
              description="Use BlurHash placeholders for posters"
              control={
                <Switch
                  checked={ffBlurhashImages}
                  onCheckedChange={(checked) => toggleFlag(FeatureFlag.BLURHASH_IMAGES, checked)}
                />
              }
            />
            <SettingRow
              title="Tatakai Runtime"
              description="Reserved for local runtime bridge"
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
        eyebrow="Language"
        title="Titles & translations"
        description="Choose how titles are displayed and your default manga translation language."
      >
        <div className="flex flex-col">
          <SettingRow
            title="Preferred Title Language"
            description="Select how anime titles should be displayed"
            control={
              <Select value={preferredTitleLanguage} onValueChange={(value: any) => handleTitleLanguageChange(value)}>
                <SelectTrigger className="h-9 w-36 rounded-lg text-sm">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="romaji">Romaji</SelectItem>
                  <SelectItem value="english">English</SelectItem>
                  <SelectItem value="native">Native</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            title="Preferred Manga Language"
            description="Choose your default manga translation language"
            control={
              <Select value={preferredMangaLanguage} onValueChange={(value: PreferredMangaLanguage) => handleMangaLanguageChange(value)}>
                <SelectTrigger className="h-9 w-40 rounded-lg text-sm">
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
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Gauge}
        eyebrow="Performance & accessibility"
        title="Motion & contrast"
        description="Tune visual effects for performance and accessibility."
      >
        <div className="flex flex-col">
          <SettingRow
            tone="accent"
            title="Ultra Lite Mode"
            badge={<SettingsBadge tone="warning">Max Speed</SettingsBadge>}
            icon={Sparkles}
            description="Disables all filters, animations, and heavy styles for low-end devices"
            control={
              <Switch
                checked={theme === 'ultra-lite'}
                onCheckedChange={(checked) => setTheme(checked ? 'ultra-lite' : 'cherry-blossom')}
              />
            }
          />
          <SettingRow
            title="Reduce Motion"
            description="Minimize animations for better performance"
            control={<Switch checked={reduceMotion} onCheckedChange={setReduceMotion} />}
          />
          <SettingRow
            title="High Contrast Mode"
            description="Increase visual contrast for accessibility"
            control={<Switch checked={highContrast} onCheckedChange={setHighContrast} />}
          />
        </div>
      </SettingsSection>
    </div>
  );
}
