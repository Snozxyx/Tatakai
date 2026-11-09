import { useEffect, useState } from 'react';
import { useCustomization, useCustomizationScope } from '@/hooks/ui/useCustomization';
import { getThemeCustomization } from '@/lib/customization';
import { ThemedSelect } from '@/components/ui/themed-select';
import { Button } from '@/components/ui/button';
import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { brandLogoSource, getBrandingBridge, resolveLogoVariant, saveLauncherSelection, type BrandingCapabilities, type LauncherMode, type LauncherSelection } from '@/lib/branding';

export function LauncherIconSelector() {
  useUiTranslation();
  const { themeId: theme } = useCustomizationScope();
  const { settings } = useCustomization();
  const [capabilities, setCapabilities] = useState<BrandingCapabilities | null>(null);
  const [saved, setSaved] = useState<LauncherSelection | null>(null);
  const [draft, setDraft] = useState<LauncherMode>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const bridge = getBrandingBridge(); if (!bridge) return;
    let alive = true;
    void Promise.all([bridge.getCapabilities(), bridge.getSelection()]).then(([caps, selection]) => { if (alive) { setCapabilities(caps); setSaved(selection); setDraft(selection.mode); } }).catch(() => { if (alive) setError(uiI18n.t('customization.launcherUnavailable')); });
    return () => { alive = false; };
  }, []);
  if (!capabilities?.supported) return null;
  const changed = draft !== saved?.mode;
  const variant = resolveLogoVariant(draft === 'auto' ? getThemeCustomization(settings, theme).logo : draft, theme);
  return <div className="rounded-2xl border border-border p-4 space-y-3">
    <div className="flex items-center gap-3"><img alt="" src={brandLogoSource(variant)} className="size-12 object-contain" /><div><h3 className="font-semibold">{uiI18n.t('customization.launcherTitle')}</h3><p className="text-sm text-muted-foreground">{uiI18n.t('customization.launcherDeviceLocal')}</p></div></div>
    <ThemedSelect value={draft} onChange={event => setDraft(event.target.value as LauncherMode)} aria-label={uiI18n.t('customization.launcherTitle')}>
      {(['auto', 'light', 'dark', 'monochrome', 'legacy'] as const).map(choice => <option key={choice} value={choice}>{uiI18n.t(`customization.logos.${choice}`)}</option>)}
    </ThemedSelect>
    {capabilities.limitations.map(key => <p key={key} className="text-xs text-muted-foreground">{uiI18n.t(key)}</p>)}
    <div className="flex gap-2"><Button disabled={!changed || busy} onClick={async () => { setBusy(true); setError(''); try { const result = await saveLauncherSelection(draft, variant); if (result.success) setSaved(result); else setError(result.error ? uiI18n.t(result.error, { defaultValue: result.error }) : uiI18n.t('customization.launcherUnavailable')); } catch { setError(uiI18n.t('customization.launcherUnavailable')); } finally { setBusy(false); } }}>{uiI18n.t('common.save')}</Button><Button variant="outline" disabled={!changed || busy} onClick={() => { setDraft(saved?.mode ?? 'auto'); setError(''); }}>{uiI18n.t('common.cancel')}</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
