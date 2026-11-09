import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { EXTENSION_INSTALLED_EVENT } from '@/core/extensions/ecosystems';
import { listRemoteExtensions, setRemoteEnabled, removeRemoteExtension, installRemoteExtension, updateRemoteExtension, type RemoteExtension } from '@/core/extensions/remote/installed';
import { ExtensionLogo } from './ExtensionLogo';
import { Link } from 'react-router-dom';
import { customDescriptors } from '@/core/extensions/remote/custom';
import { customSourceBase } from '@/core/content/custom-source-model';
import { AddExtensionModal } from './SideloadExtensionModal';
import { cn } from '@/lib/utils';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { isExplicitExtensionContent } from '@/lib/contentSafety';
import { registeredExtensionAliases } from '@/hooks/api/useExtensionStore';

export function RemoteExtensionsPanel({ search = '', type = 'all', extensionId, tv = false }: { search?: string; type?: string; extensionId?: string; tv?: boolean }) {
  useUiTranslation();
  const { settings: safety } = useContentSafetySettings();
  const [rows, setRows] = useState<RemoteExtension[]>([]);
  const [busy, setBusy] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const [configuring, setConfiguring] = useState<RemoteExtension>();
  const refresh = () => { void listRemoteExtensions().then(setRows); };
  useEffect(() => { refresh(); window.addEventListener(EXTENSION_INSTALLED_EVENT, refresh); return () => window.removeEventListener(EXTENSION_INSTALLED_EVENT, refresh); }, []);
  const run = async (row: RemoteExtension, action: () => Promise<unknown>) => {
    setBusy(row.id); try { await action(); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : uiI18n.t('app.extension_action_failed_e61657dd')); } finally { setBusy(undefined); }
  };
  const visible = rows.filter(row => {
    if (!safety.showAdultEverywhere && isExplicitExtensionContent(row.manifest)) return false;
    const category = row.ecosystem === 'stremio' || row.manifest.type === 'onlinestream-provider' ? 'onlinestream' : row.manifest.type === 'anime-torrent-provider' ? 'torrent' : 'custom';
    return (!extensionId || [row.id, row.manifest.id].some(id => registeredExtensionAliases(extensionId).includes(String(id).toLowerCase()))) &&
      (type === 'all' || type === category) && `${row.manifest.name} ${row.manifest.description || ''} ${row.manifest.author || ''}`.toLowerCase().includes(search.toLowerCase());
  });
  return <><section className={cn('space-y-3', tv && 'tv-remote-extensions')} aria-label={uiI18n.t('app.stremio_and_seanime_extensions_6b715b83')}>{visible.map(row => <div key={row.id} className="space-y-3 rounded-lg border border-border p-4">
    <div className="flex min-w-0 items-center gap-3"><ExtensionLogo name={row.manifest.name} src={row.manifest.logo || row.manifest.icon} /><div className="min-w-0"><p className="break-words font-medium">{row.manifest.name}</p><p className="text-sm capitalize text-muted-foreground">{row.ecosystem} · {row.manifest.version} · {row.enabled ? uiI18n.t('app.enabled_df174a3f') : uiI18n.t('app.disabled_f4f4473d')}</p></div></div>
    <div className="flex flex-wrap gap-2">
      <Button data-tv-key={`remote-enable-${row.id}`} size="sm" variant="outline" disabled={busy === row.id} onClick={() => void run(row, () => setRemoteEnabled(row.id, !row.enabled))}>{row.enabled ? uiI18n.t('app.disable_9a7d4e06') : uiI18n.t('app.enable_20063ad9')}</Button>
      <Button data-tv-key={`remote-update-${row.id}`} size="sm" variant="outline" disabled={busy === row.id || !row.manifestUrl} onClick={() => void run(row, () => installRemoteExtension(row.manifestUrl, undefined, row.id))}>{uiI18n.t('app.update_fb91e24f')}</Button>
      {row.ecosystem === 'stremio' && (row.manifest.behaviorHints?.configurable || row.manifest.behaviorHints?.configurationRequired) &&
        <Button id={`remote-configure-${row.id}`} data-tv-key={`remote-configure-${row.id}`} size="sm" variant="outline" disabled={busy === row.id} onClick={() => setConfiguring(row)}>{uiI18n.t('app.configure_addon_2aa4830c')}</Button>}
      {customDescriptors(row).map(source => <Button key={source.id} size="sm" variant="outline" asChild>
        <Link data-tv-key={`remote-browse-${row.id}-${source.id}`} to={customSourceBase(source)}>{source.id === 'series' ? uiI18n.t('extensionSetup.browseSeries') : source.id === 'movie' ? uiI18n.t('extensionSetup.browseMovies') : uiI18n.t('extensionSetup.browse', { type: source.id })}</Link>
      </Button>)}
      {row.ecosystem === 'seanime' && <Button size="sm" variant="outline" onClick={() => { setEditing(editing === row.id ? undefined : row.id); setPreferences(row.preferences); }}>{uiI18n.t('app.preferences_9dfd349e')}</Button>}
      <Button data-tv-key={`remote-remove-${row.id}`} size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void run(row, () => removeRemoteExtension(row.id))}>{uiI18n.t('app.remove_e963907d')}</Button>
    </div>
    {editing === row.id && <div className="space-y-3">{(Array.isArray(row.manifest.userConfig) ? row.manifest.userConfig : row.manifest.userConfig?.fields || []).map((field: any) => <label key={field.name || field.name || field.key || field.id} className="block space-y-1 text-sm">{field.label || field.name || field.key}<Input value={String(preferences[field.name || field.key || field.id] ?? field.default ?? '')} onChange={event => setPreferences(p => ({ ...p, [field.name || field.key || field.id]: event.target.value }))} /></label>)}
      <Button size="sm" onClick={() => void run(row, async () => { await updateRemoteExtension({ ...row, preferences }); setEditing(undefined); })}>{uiI18n.t('app.save_preferences_d8ab74e1')}</Button>
      <Button size="sm" variant="outline" onClick={() => void run(row, () => updateRemoteExtension({ ...row, matches: {} }))}>{uiI18n.t('app.reset_title_matches_5af8e65d')}</Button>
    </div>}
  </div>)}</section>{configuring && <AddExtensionModal isOpen initialUrl={configuring.manifestUrl} existingId={configuring.id}
    onClose={() => { document.getElementById(`remote-configure-${configuring.id}`)?.focus(); setConfiguring(undefined); }} />}</>;
}
