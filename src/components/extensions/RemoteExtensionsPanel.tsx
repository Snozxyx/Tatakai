import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { EXTENSION_INSTALLED_EVENT } from '@/core/extensions/ecosystems';
import { listRemoteExtensions, setRemoteEnabled, removeRemoteExtension, installRemoteExtension, updateRemoteExtension, type RemoteExtension } from '@/core/extensions/remote/installed';

export function RemoteExtensionsPanel() {
  const [rows, setRows] = useState<RemoteExtension[]>([]);
  const [busy, setBusy] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const refresh = () => { void listRemoteExtensions().then(setRows); };
  useEffect(() => { refresh(); window.addEventListener(EXTENSION_INSTALLED_EVENT, refresh); return () => window.removeEventListener(EXTENSION_INSTALLED_EVENT, refresh); }, []);
  const run = async (row: RemoteExtension, action: () => Promise<unknown>) => {
    setBusy(row.id); try { await action(); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Extension action failed'); } finally { setBusy(undefined); }
  };
  return <section className="space-y-3" aria-label="Stremio and Seanime extensions">{rows.map(row => <div key={row.id} className="space-y-3 rounded-lg border border-border p-4">
    <div><p className="font-medium">{row.manifest.name}</p><p className="text-sm capitalize text-muted-foreground">{row.ecosystem} · {row.manifest.version} · {row.enabled ? 'Enabled' : 'Disabled'}</p></div>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => void run(row, () => setRemoteEnabled(row.id, !row.enabled))}>{row.enabled ? 'Disable' : 'Enable'}</Button>
      <Button size="sm" variant="outline" disabled={busy === row.id || !row.manifestUrl} onClick={() => void run(row, () => installRemoteExtension(row.manifestUrl, undefined, row.id))}>Update</Button>
      {row.ecosystem === 'seanime' && <Button size="sm" variant="outline" onClick={() => { setEditing(editing === row.id ? undefined : row.id); setPreferences(row.preferences); }}>Preferences</Button>}
      <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void run(row, () => removeRemoteExtension(row.id))}>Remove</Button>
    </div>
    {editing === row.id && <div className="space-y-3">{(Array.isArray(row.manifest.userConfig) ? row.manifest.userConfig : row.manifest.userConfig?.fields || []).map((field: any) => <label key={field.name || field.name || field.key || field.id} className="block space-y-1 text-sm">{field.label || field.name || field.key}<Input value={String(preferences[field.name || field.key || field.id] ?? field.default ?? '')} onChange={event => setPreferences(p => ({ ...p, [field.name || field.key || field.id]: event.target.value }))} /></label>)}
      <Button size="sm" onClick={() => void run(row, async () => { await updateRemoteExtension({ ...row, preferences }); setEditing(undefined); })}>Save preferences</Button>
      <Button size="sm" variant="outline" onClick={() => void run(row, () => updateRemoteExtension({ ...row, matches: {} }))}>Reset title matches</Button>
    </div>}
  </div>)}</section>;
}
