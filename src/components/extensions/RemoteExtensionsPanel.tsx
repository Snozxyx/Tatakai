import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { EXTENSION_INSTALLED_EVENT } from '@/core/extensions/ecosystems';
import { listRemoteExtensions, setRemoteEnabled, removeRemoteExtension, installRemoteExtension, updateRemoteExtension, type RemoteExtension } from '@/core/extensions/remote/installed';
import { ExtensionLogo } from './ExtensionLogo';

export function RemoteExtensionsPanel() {
  useUiTranslation();
  const [rows, setRows] = useState<RemoteExtension[]>([]);
  const [busy, setBusy] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const refresh = () => { void listRemoteExtensions().then(setRows); };
  useEffect(() => { refresh(); window.addEventListener(EXTENSION_INSTALLED_EVENT, refresh); return () => window.removeEventListener(EXTENSION_INSTALLED_EVENT, refresh); }, []);
  const run = async (row: RemoteExtension, action: () => Promise<unknown>) => {
    setBusy(row.id); try { await action(); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : uiI18n.t('app.extension_action_failed_e61657dd')); } finally { setBusy(undefined); }
  };
  return <section className="space-y-3" aria-label={uiI18n.t('app.stremio_and_seanime_extensions_6b715b83')}>{rows.map(row => <div key={row.id} className="space-y-3 rounded-lg border border-border p-4">
    <div className="flex min-w-0 items-center gap-3"><ExtensionLogo name={row.manifest.name} src={row.manifest.logo || row.manifest.icon} /><div className="min-w-0"><p className="break-words font-medium">{row.manifest.name}</p><p className="text-sm capitalize text-muted-foreground">{row.ecosystem} · {row.manifest.version} · {row.enabled ? uiI18n.t('app.enabled_df174a3f') : uiI18n.t('app.disabled_f4f4473d')}</p></div></div>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => void run(row, () => setRemoteEnabled(row.id, !row.enabled))}>{row.enabled ? uiI18n.t('app.disable_9a7d4e06') : uiI18n.t('app.enable_20063ad9')}</Button>
      <Button size="sm" variant="outline" disabled={busy === row.id || !row.manifestUrl} onClick={() => void run(row, () => installRemoteExtension(row.manifestUrl, undefined, row.id))}>{uiI18n.t('app.update_fb91e24f')}</Button>
      {row.ecosystem === 'seanime' && <Button size="sm" variant="outline" onClick={() => { setEditing(editing === row.id ? undefined : row.id); setPreferences(row.preferences); }}>{uiI18n.t('app.preferences_9dfd349e')}</Button>}
      <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void run(row, () => removeRemoteExtension(row.id))}>{uiI18n.t('app.remove_e963907d')}</Button>
    </div>
    {editing === row.id && <div className="space-y-3">{(Array.isArray(row.manifest.userConfig) ? row.manifest.userConfig : row.manifest.userConfig?.fields || []).map((field: any) => <label key={field.name || field.name || field.key || field.id} className="block space-y-1 text-sm">{field.label || field.name || field.key}<Input value={String(preferences[field.name || field.key || field.id] ?? field.default ?? '')} onChange={event => setPreferences(p => ({ ...p, [field.name || field.key || field.id]: event.target.value }))} /></label>)}
      <Button size="sm" onClick={() => void run(row, async () => { await updateRemoteExtension({ ...row, preferences }); setEditing(undefined); })}>{uiI18n.t('app.save_preferences_d8ab74e1')}</Button>
      <Button size="sm" variant="outline" onClick={() => void run(row, () => updateRemoteExtension({ ...row, matches: {} }))}>{uiI18n.t('app.reset_title_matches_5af8e65d')}</Button>
    </div>}
  </div>)}</section>;
}
