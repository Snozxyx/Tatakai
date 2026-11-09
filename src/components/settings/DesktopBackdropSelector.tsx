import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemedSelect } from '@/components/ui/themed-select';
import { Button } from '@/components/ui/button';
import { getDesktopBackdropBridge, saveDesktopBackdrop, useDesktopBackdrop, type DesktopBackdropMode } from '@/lib/desktopBackdrop';

export function DesktopBackdropSelector() {
  const { t } = useTranslation();
  const native = useDesktopBackdrop();
  const [draft, setDraft] = useState<DesktopBackdropMode>('solid');
  const [opacity, setOpacity] = useState(0.82);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { if (native.selection) { setDraft(native.selection.mode); setOpacity(native.selection.opacity ?? 0.82); } }, [native.selection?.mode, native.selection?.opacity]);
  if (typeof window === 'undefined' || !window.electron) return null;
  if (!getDesktopBackdropBridge()) return <section data-desktop-backdrop-settings className="space-y-2 rounded-xl border border-border bg-card p-4"><h3 className="font-semibold">{t('customization.backdrop.title')}</h3><p className="text-sm text-muted-foreground">{t('customization.backdrop.unavailable')}</p></section>;
  const dirty = draft !== (native.selection?.mode ?? 'solid') || opacity !== (native.selection?.opacity ?? 0.82);
  const transparency = draft !== 'solid' ? Math.round((1 - opacity) * 100) : 0;
  const draftSupported = draft === 'transparent' ? native.capabilities?.transparentSupported === true : draft === 'system-blur' ? native.capabilities?.supported === true : true;
  return <section data-desktop-backdrop-settings className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div><h3 className="font-semibold">{t('customization.backdrop.title')}</h3><p className="text-sm text-muted-foreground">{t('customization.backdrop.description')}</p></div>
    <ThemedSelect aria-label={t('customization.backdrop.title')} value={draft} disabled={!native.ready || busy} onChange={event => setDraft(event.target.value as DesktopBackdropMode)}><option value="solid">{t('customization.backdrop.solid')}</option><option value="transparent" disabled={!native.capabilities?.transparentSupported}>{t('customization.backdrop.transparent')}</option><option value="system-blur" disabled={!native.capabilities?.supported}>{t('customization.backdrop.systemBlur')}</option></ThemedSelect>
    <label className="block space-y-2"><span className="flex justify-between text-sm"><span>{t('customization.backdrop.transparency')}</span><output>{transparency}%</output></span><input aria-label={t('customization.backdrop.transparency')} type="range" min={0} max={100} step={1} value={transparency} disabled={draft === 'solid' || !draftSupported || busy} onChange={event => setOpacity(Math.round((1 - Number(event.target.value) / 100) * 100) / 100)} className="w-full accent-primary disabled:opacity-50" /></label>
    {native.capabilities && !native.capabilities.supported && native.capabilities.reason && <p className="text-xs text-muted-foreground">{t(native.capabilities.reason, { defaultValue: native.capabilities.reason })}</p>}
    {native.error && !message && <p role="status" className="text-xs text-muted-foreground">{t(native.error, { defaultValue: native.error })}</p>}
    <div className="flex gap-2"><Button disabled={!dirty || busy || !draftSupported} onClick={async () => { setBusy(true); setMessage(''); try { const result = await saveDesktopBackdrop(draft, opacity); setMessage(result.success ? t(result.restartRequired ? 'customization.backdrop.restartRequired' : 'customization.saved') : t(result.error || 'customization.backdrop.failed', { defaultValue: result.error })); } catch { setMessage(t('customization.backdrop.failed')); } finally { setBusy(false); } }}>{t('customization.backdrop.apply')}</Button><Button variant="outline" disabled={!dirty || busy} onClick={() => { setDraft(native.selection?.mode ?? 'solid'); setOpacity(native.selection?.opacity ?? 0.82); setMessage(t('customization.cancelled')); }}>{t('customization.cancel')}</Button></div>
    {native.selection?.restartRequired && !message && <p role="status" className="text-xs text-muted-foreground">{t('customization.backdrop.restartRequired')}</p>}
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
  </section>;
}
