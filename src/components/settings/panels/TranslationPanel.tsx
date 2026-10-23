import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Cable, Languages, MessageSquare, MonitorPlay, ScrollText, Users, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SettingRow,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';
import { TranslationStatus } from '@/components/settings/TranslationStatus';
import { useTranslationConfig } from '@/hooks/translation/useTranslationConfig';
import { useDeviceTranslation } from '@/hooks/community/useDeviceTranslation';
import {
  setDeviceTranslationEnabled,
} from '@/lib/community/onDeviceTranslation';
import {
  setTranslationConfig,
  type TranslationProviderId,
} from '@/lib/translation/config';
import { TRANSLATION_LANGUAGES } from '@/lib/translation/languages';
import { CLOUD_PROVIDERS, clearTranslationCache, translateTexts } from '@/lib/translation/translate';

const PROVIDER_FIELDS: Record<TranslationProviderId, { url?: boolean; apiKey?: boolean; model?: boolean; region?: boolean }> = {
  auto: {},
  gtx: {},
  edge: {},
  google: { apiKey: true },
  deepl: { apiKey: true },
  deeplx: { url: true },
  azure: { apiKey: true, region: true },
  openai: { url: true, apiKey: true, model: true },
  'on-device': {},
};

/**
 * Settings → Translation: one home for every translation surface.
 *
 * The engine section picks the provider (the two free endpoints need no
 * account, keyed services use the user's own credentials, on-device runs
 * offline), the language section picks one shared target, and each surface —
 * community posts, comments, subtitles, novels — has its own on/off switch.
 */
export function TranslationPanel() {
  const { t } = useTranslation();
  const config = useTranslationConfig();
  const device = useDeviceTranslation();
  const [testing, setTesting] = useState(false);

  const provider = config.provider;
  const fields = PROVIDER_FIELDS[provider] ?? {};

  const providerLabel = (id: TranslationProviderId) =>
    id === 'on-device'
      ? t('translation.providerOnDevice')
      : id === 'auto'
      ? t('translation.providerAuto')
      : (CLOUD_PROVIDERS.find((p) => p.id === id)?.label ?? id);

  const runTest = async () => {
    setTesting(true);
    try {
      const result = await translateTexts(['Hello, this is a translation test.'], {
        target: resolveTestTarget(),
      });
      toast.success(t('translation.testSuccess', { provider: providerLabel(result.engine) }));
    } catch (error) {
      toast.error(
        t('translation.testFailed', { error: (error as Error)?.message || 'unknown error' }),
      );
    } finally {
      setTesting(false);
    }
  };

  // The test sentence is English; if the shared target IS English the engine
  // would no-op, so verify against Spanish in that case.
  const resolveTestTarget = () => {
    const target = config.targetLanguage === 'auto' ? 'es' : config.targetLanguage;
    return target === 'en' ? 'es' : target;
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        icon={Cable}
        title={t('translation.engineTitle')}
        description={t('translation.engineDescription')}
      >
        <div className="flex flex-col">
          <SettingRow
            title={t('translation.enabled')}
            description={t('translation.enabledDescription')}
            tone="accent"
            control={
              <Switch
                aria-label={t('translation.enabled')}
                checked={config.enabled}
                onCheckedChange={(checked) => setTranslationConfig({ enabled: checked })}
              />
            }
          />
          {config.enabled && (
            <>
              <SettingRow
                title={t('translation.provider')}
                description={provider === 'openai' ? t('translation.providerOpenAiDescription') : undefined}
                control={
                  <Select
                    value={provider}
                    onValueChange={(value) =>
                      setTranslationConfig({ provider: value as TranslationProviderId })
                    }
                  >
                    <SelectTrigger className="h-9 w-64 rounded-lg text-sm" aria-label={t('translation.provider')}>
                      <SelectValue className="block max-w-[13rem] truncate" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="auto">{t('translation.providerAuto')}</SelectItem>
                      <SelectItem value="on-device">{t('translation.providerOnDevice')}</SelectItem>
                      {CLOUD_PROVIDERS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              {fields.url && (
                <SettingRow
                  title={t('translation.url')}
                  control={
                    <Input
                      type="url"
                      inputMode="url"
                      className="h-9 w-72 text-sm"
                      placeholder="https://…"
                      value={config.url}
                      onChange={(event) => setTranslationConfig({ url: event.target.value })}
                    />
                  }
                />
              )}
              {fields.apiKey && (
                <SettingRow
                  title={t('translation.apiKey')}
                  control={
                    <Input
                      type="password"
                      autoComplete="off"
                      className="h-9 w-72 text-sm"
                      value={config.apiKey}
                      onChange={(event) => setTranslationConfig({ apiKey: event.target.value })}
                    />
                  }
                />
              )}
              {fields.model && (
                <SettingRow
                  title={t('translation.model')}
                  control={
                    <Input
                      className="h-9 w-72 text-sm"
                      placeholder={t('translation.modelPlaceholder') || undefined}
                      value={config.model}
                      onChange={(event) => setTranslationConfig({ model: event.target.value })}
                    />
                  }
                />
              )}
              {fields.region && (
                <SettingRow
                  title={t('translation.region')}
                  control={
                    <Input
                      className="h-9 w-72 text-sm"
                      placeholder={t('translation.regionPlaceholder') || undefined}
                      value={config.region}
                      onChange={(event) => setTranslationConfig({ region: event.target.value })}
                    />
                  }
                />
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => void runTest()} disabled={testing}>
                  {testing ? t('translation.testing') : t('translation.test')}
                </Button>
              </div>
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Languages}
        title={t('translation.languageTitle')}
        description={t('translation.languageDescription')}
      >
        <SettingRow
          title={t('translation.languageValue')}
          control={
            <Select
              value={config.targetLanguage || 'auto'}
              onValueChange={(value) =>
                setTranslationConfig({ targetLanguage: value === 'auto' ? 'auto' : value })
              }
            >
              <SelectTrigger className="h-9 w-60 rounded-lg text-sm" aria-label={t('translation.languageValue')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="auto">{t('translation.auto')}</SelectItem>
                {TRANSLATION_LANGUAGES.map((language) => (
                  <SelectItem key={language.code} value={language.code}>
                    {language.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <div className="flex flex-col">
          <SettingRow
            title={t('translation.cacheTitle')}
            description={t('translation.cacheDescription')}
            control={
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  clearTranslationCache();
                  toast.success(t('translation.cacheCleared'));
                }}
              >
                <Trash2 className="h-4 w-4" />
                {t('translation.clearCache')}
              </Button>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Users}
        title={t('translation.postsTitle')}
        description={t('translation.postsDescription')}
      >
        <div className="flex flex-col">
          <SettingRow
            title={t('community.translation.autoTranslate')}
            description={t('translation.postsAutoDescription')}
            control={
              <Switch
                aria-label={t('community.translation.autoTranslate')}
                checked={config.autoTranslatePosts}
                onCheckedChange={(checked) => setTranslationConfig({ autoTranslatePosts: checked })}
              />
            }
          />
          <SettingRow
            title={t('translation.deviceToggle')}
            description={t('translation.deviceToggleDescription')}
            control={
              <Switch
                aria-label={t('translation.deviceToggle')}
                checked={device.enabled}
                onCheckedChange={setDeviceTranslationEnabled}
              />
            }
          />
        </div>
        {config.enabled && <TranslationStatus />}
      </SettingsSection>

      <SettingsSection
        icon={MessageSquare}
        title={t('translation.commentsTitle')}
        description={t('translation.commentsDescription')}
      >
        <SettingRow
          title={t('translation.commentsToggle')}
          description={t('translation.commentsToggleDescription')}
          control={
            <Switch
              aria-label={t('translation.commentsToggle')}
              checked={config.enabled && config.translateComments}
              onCheckedChange={(checked) => setTranslationConfig({ translateComments: checked })}
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        icon={MonitorPlay}
        title={t('translation.subtitlesTitle')}
        description={t('translation.subtitlesToggleDescription')}
      >
        <div className="flex flex-col">
          <SettingRow
            title={t('translation.subtitlesToggle')}
            control={
              <Switch
                aria-label={t('translation.subtitlesToggle')}
                checked={config.subtitleTranslate}
                onCheckedChange={(checked) => setTranslationConfig({ subtitleTranslate: checked })}
              />
            }
          />
          <SettingRow
            title={t('translation.subtitlesLanguage')}
            description={t('translation.subtitlesLanguageDescription')}
            control={
              <Select
                value={config.subtitleTargetLanguage || 'auto'}
                onValueChange={(value) =>
                  setTranslationConfig({ subtitleTargetLanguage: value === 'auto' ? '' : value })
                }
              >
                <SelectTrigger className="h-9 w-52 rounded-lg text-sm" aria-label={t('translation.subtitlesLanguage')}>
                  <SelectValue placeholder={t('translation.followTarget')} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="auto">{t('translation.followTarget')}</SelectItem>
                  {TRANSLATION_LANGUAGES.map((language) => (
                    <SelectItem key={language.code} value={language.code}>
                      {language.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection
        icon={ScrollText}
        title={t('translation.novelsTitle')}
        description={t('translation.novelsToggleDescription')}
      >
        <SettingRow
          title={t('translation.novelsToggle')}
          control={
            <Switch
              aria-label={t('translation.novelsToggle')}
              checked={config.enabled && config.translateNovels}
              onCheckedChange={(checked) => setTranslationConfig({ translateNovels: checked })}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}
