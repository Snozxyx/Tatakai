import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  SettingRow,
  SettingsBadge,
  SettingsSection,
} from '@/components/settings/SettingsPrimitives';
import { toast } from 'sonner';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

type FlareSolverrStatus = {
  enabled: boolean;
  url: string;
  available: boolean | null;
};

type BypassMode = 'playwright' | 'flaresolverr' | 'embedded';

function getRuntime() {
  return (typeof window !== 'undefined' ? window : {}) as any;
}

async function invokeFlaresolverr(channel: string, args?: unknown) {
  const w = getRuntime();
  const invoke = w.tatakaiRuntime?.invoke || w.electron?.invoke;
  if (!invoke) throw new Error(uiI18n.t('app.desktop_runtime_unavailable_75ddec8e'));
  return invoke(channel, args);
}

export function FlareSolverrSettings() {
  useUiTranslation();
  const isDesktop = useIsDesktopApp();
  const [url, setUrl] = useState('http://localhost:8191/v1');
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [bypassMode, setBypassMode] = useState<BypassMode>('playwright');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const status: FlareSolverrStatus = await invokeFlaresolverr('runtime:flaresolverr-status');
      if (status) {
        setEnabled(status.enabled);
        if (status.url) setUrl(status.url);
        setAvailable(status.available);
      }
    } catch {
      // not critical — leave defaults
    }
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    void loadStatus();
  }, [isDesktop, loadStatus]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invokeFlaresolverr('runtime:flaresolverr-config', { enabled, url });
      toast.success(enabled ? uiI18n.t('app.flaresolverr_enabled_and_configured_43dbf9e3') : uiI18n.t('app.flaresolverr_disabled_b66e9e44'));
      await loadStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : uiI18n.t('app.failed_to_save_flaresolverr_settings_10c62c36'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const status: FlareSolverrStatus = await invokeFlaresolverr('runtime:flaresolverr-status');
      const isAvailable = status?.available ?? false;
      setAvailable(isAvailable);
      if (isAvailable) {
        toast.success(uiI18n.t('app.flaresolverr_is_reachable_and_responding_b3d83d12'));
      } else {
        toast.error(uiI18n.t('app.flaresolverr_not_reachable_ensure_it_is_running__ea252544'));
      }
    } catch {
      setAvailable(false);
      toast.error(uiI18n.t('app.could_not_connect_to_flaresolverr_197a18e9'));
    } finally {
      setIsTesting(false);
    }
  };

  if (!isDesktop) return null;

  return (
    <SettingsSection
      title={uiI18n.t('app.flaresolverr_ea8e0b38')}
      description={uiI18n.t('app.route_cloudflare_blocked_requests_through_an_ext_d7b8e9f5')}
      bodyClassName="space-y-5"
      action={
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={uiI18n.t('app.enable_flaresolverr_73072f92')} />
      }
    >
      <div className="flex flex-col">

        <SettingRow
          title={uiI18n.t('app.flaresolverr_url_600050da')}
          description={uiI18n.t('app.address_of_your_running_flaresolverr_instance_c346c45b')}
        >
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:8191/v1"
                className="font-mono text-sm bg-white/5 border-white/10"
                disabled={!enabled}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!enabled || isTesting}
                onClick={handleTest}
                className="shrink-0 gap-1.5"
              >
                {isTesting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : available === true ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                ) : available === false ? (
                  <XCircle className="w-3.5 h-3.5 text-destructive" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {uiI18n.t('app.test_640ab2ba')}
              </Button>
            </div>
            {available === true && (
              <SettingsBadge tone="success">{uiI18n.t('app.reachable_at_f496030a')} {url}</SettingsBadge>
            )}
            {available === false && (
              <SettingsBadge tone="danger">{uiI18n.t('app.not_reachable_is_flaresolverr_running_82997a82')}</SettingsBadge>
            )}
          </div>
        </SettingRow>

        <SettingRow
          title={uiI18n.t('app.bypass_mode_a3abee93')}
          description={
            bypassMode === 'playwright'
              ? uiI18n.t('app.uses_the_built_in_playwright_browser_to_solve_ch_5b9f5a0e')
              : bypassMode === 'flaresolverr'
              ? uiI18n.t('app.routes_through_your_external_flaresolverr_instan_12d8c8a6')
              : uiI18n.t('app.uses_the_bundled_embedded_flaresolverr_start_it__e3be63d2')
          }
        >
          <div className="flex flex-wrap gap-2">
            {(['playwright', 'flaresolverr', 'embedded'] as BypassMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBypassMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${bypassMode === mode
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10'}`}
              >
                {mode === 'playwright' ? uiI18n.t('app.playwright_default_2dd4c308') : mode === 'flaresolverr' ? uiI18n.t('app.external_flaresolverr_72477c30') : uiI18n.t('app.embedded_0fd17b94')}
              </button>
            ))}
          </div>
        </SettingRow>
      </div>

      {enabled && bypassMode === 'flaresolverr' && available === false && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber/10 border border-amber/20">
          <AlertTriangle className="w-4 h-4 text-amber shrink-0 mt-0.5" />
          <p className="text-xs text-amber">
            {uiI18n.t('app.flaresolverr_is_enabled_but_unreachable_requests_ae7ad15e')}
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="gap-2"
        >
          {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
          {uiI18n.t('app.save_efc007a3')}
        </Button>
        <a
          href="https://github.com/FlareSolverr/FlareSolverr"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {uiI18n.t('app.installation_guide_5127b355')}
        </a>
      </div>
    </SettingsSection>
  );
}
