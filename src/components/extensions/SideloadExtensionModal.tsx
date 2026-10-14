import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { downloadExtensionKai } from '@/core/extensions/marketplace-client';
import { detectEcosystem, normalizeManifestUrl, migrateExtensionStorage, INSTALLED_MANIFESTS_KEY, EXTENSION_INSTALLED_EVENT } from '@/core/extensions/ecosystems';
import { installRemoteExtension } from '@/core/extensions/remote/installed';
import { extensionFetch } from '@/core/extensions/remote/transport';
import type { ExtensionManifest } from '@/pages/base/ExtensionHubPage';

interface Props { isOpen: boolean; onClose(): void; onSuccess?(extension: ExtensionManifest): void }
export function AddExtensionModal({ isOpen, onClose, onSuccess }: Props) {
  const [url, setUrl] = useState('');
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [manifest, setManifest] = useState<Record<string, any> | null>(null);
  const [origin, setOrigin] = useState('');
  const [isKai, setIsKai] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ecosystem = manifest ? detectEcosystem(manifest) : null;
  const close = () => { setUrl(''); setBuffer(null); setManifest(null); setOrigin(''); setError(''); onClose(); };
  const inspect = async (data: ArrayBuffer, endpoint = '') => {
    if (data.byteLength > 30 * 1024 * 1024) throw new Error('Extension must be under 30 MB');
    const bytes = new Uint8Array(data);
    const archive = bytes[0] === 80 && bytes[1] === 75;
    let parsed: Record<string, any>;
    if (archive) {
      const zip = await JSZip.loadAsync(data);
      const entry = zip.file('manifest.json'); if (!entry) throw new Error('Package is missing manifest.json');
      parsed = JSON.parse(await entry.async('string'));
    } else parsed = JSON.parse(new TextDecoder().decode(data));
    if (!parsed.id || !parsed.name || !parsed.version) throw new Error('Manifest needs id, name, and version');
    setPreferences(Object.fromEntries((parsed.userConfig?.fields || []).map((f: any) => [f.name, f.default || ""])));
    setBuffer(data); setManifest(parsed); setOrigin(endpoint); setIsKai(archive);
  };
  const read = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setManifest(null);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not read extension'); }
    finally { setBusy(false); }
  };
  const previewUrl = (value: string) => read(async () => {
    const endpoint = normalizeManifestUrl(value);
    const response = await extensionFetch(endpoint);
    if (!response.ok) throw new Error(`Manifest download failed (${response.status})`);
    await inspect(new TextEncoder().encode(await response.text()).buffer, endpoint);
  });
  useEffect(() => {
    if (!isOpen) return;
    return (window as any).electron?.onConfiguredExtension?.((value: string) => {
      setUrl(value); void previewUrl(value);
    });
  }, [isOpen]);
  const install = async () => {
    if (!manifest || !buffer) return;
    setBusy(true); setError('');
    try {
      let canonicalId = String(manifest.id);
      if (ecosystem === 'stremio' || ecosystem === 'seanime') {
        const installed = await installRemoteExtension(manifest, origin || manifest.manifestURI, undefined, preferences);
        canonicalId = installed.id;
      } else {
        if (ecosystem !== 'tatakai') throw new Error('This ecosystem requires its original application');
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(canonicalId) || canonicalId.includes('..')) throw new Error('Invalid extension identifier');
        const runtime = (window as any).tatakaiRuntime;
        let result: any;
        if (isKai) {
          if (runtime?.loadKaiExtension) result = await runtime.loadKaiExtension(buffer, true);
          else {
            const { installMobileKaiExtension } = await import('@/core/extensions/mobile/mobileExtensionInstaller');
            result = await installMobileKaiExtension(buffer);
          }
        } else {
          const executable = manifest.apiServer || manifest.contributes?.rendererEntry || manifest.capabilities?.some((c: string) => ['manga','custom-source','service','module'].includes(c));
          if (executable) throw new Error('Install the .kai package containing this extension’s executable bundle');
          const installManifest = runtime?.installManifest || runtime?.sideloadManifest;
          result = installManifest ? await installManifest(manifest) : { success: true };
        }
        if (!result?.success) throw new Error(result?.error || 'Extension runtime unavailable');
        canonicalId = result.extensionId || canonicalId;
      }
      const installed = { ...manifest, name: String(manifest.name), description: String(manifest.description || ""), version: String(manifest.version), payload: undefined, upstreamType: manifest.type, id: canonicalId, ecosystem, manifestUrl: origin || manifest.manifestURI,
        author: manifest.author || 'Community', icon: manifest.logo || manifest.icon, banner: manifest.background || manifest.banner || manifest.bannerUrl,
        type: ecosystem === 'stremio' || manifest.type === 'onlinestream-provider' ? 'onlinestream' : manifest.type === 'anime-torrent-provider' ? 'torrent' : ['torrent','onlinestream','custom'].includes(manifest.type) ? manifest.type : 'custom',
        categories: manifest.categories || [], permissions: manifest.permissions || [], isApproved: true, status: 'approved' } as ExtensionManifest;
      migrateExtensionStorage();
      const records = JSON.parse(localStorage.getItem(INSTALLED_MANIFESTS_KEY) || '[]');
      localStorage.setItem(INSTALLED_MANIFESTS_KEY, JSON.stringify([installed, ...records.filter((row: ExtensionManifest) => row.id !== canonicalId)]));
      const ids = JSON.parse(localStorage.getItem('tatakai_installed_extensions') || '[]');
      localStorage.setItem('tatakai_installed_extensions', JSON.stringify([...new Set([...ids, canonicalId])]));
      window.dispatchEvent(new CustomEvent(EXTENSION_INSTALLED_EVENT));
      onSuccess?.(installed); toast.success('Extension installed'); close();
    } catch (e) { setError(e instanceof Error ? e.message : 'Installation failed'); }
    finally { setBusy(false); }
  };
  const configure = async () => {
    if (!origin) return;
    const target = new URL(origin); target.pathname = target.pathname.replace(/manifest.json$/, 'configure');
    const native = (window as any).electron?.configureExtension;
    if (native) { try { await native(target.href); } catch { setError('Could not open addon configuration'); } }
    else window.open(target.href, '_blank', 'noopener,noreferrer');
  };
  return <Dialog open={isOpen} onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent><DialogHeader><DialogTitle>Add extension</DialogTitle>
      <DialogDescription>Choose a Tatakai package or a Stremio/Seanime manifest. Review the extension, then install it.</DialogDescription></DialogHeader>
      <label className="space-y-2 text-sm">Extension file<Input type="file" accept=".kai,.json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void read(async () => inspect(await file.arrayBuffer())); }} /></label>
      <label className="space-y-2 text-sm">Manifest or package URL<Input value={url} onChange={event => { setUrl(event.target.value); setManifest(null); }} placeholder="https://…/manifest.json" disabled={busy} /></label>
      <Button variant="outline" disabled={busy || !url.trim()} onClick={() => void read(async () => {
        const endpoint = normalizeManifestUrl(url);
        if (new URL(endpoint).pathname.endsWith('.json')) {
          const response = await extensionFetch(endpoint);
          if (!response.ok) throw new Error(`Manifest download failed (${response.status})`);
          await inspect(new TextEncoder().encode(await response.text()).buffer, endpoint);
        } else await inspect(await downloadExtensionKai(endpoint), endpoint);
      })}>{busy ? 'Reading extension…' : 'Read extension'}</Button>
      {manifest && <div className="space-y-2 rounded-lg border border-border p-4"><p className="font-semibold">{manifest.name} <span className="text-sm text-muted-foreground">{manifest.version}</span></p><p className="text-sm capitalize">{ecosystem}</p><p className="text-sm text-muted-foreground">{manifest.description}</p>
        {(manifest.userConfig?.fields || []).map((field: any) => <label key={field.name} className="block text-sm">{field.label || field.name}<Input value={String(preferences[field.name] || '')} onChange={e => setPreferences(p => ({ ...p, [field.name]: e.target.value }))} /></label>)}
        {manifest.behaviorHints?.configurable && <Button variant="outline" onClick={configure}>Configure addon</Button>}
        {manifest.behaviorHints?.configurationRequired && <p className="text-sm">Configure this addon, then paste its configured manifest URL.</p>}</div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy || !manifest || !!manifest.behaviorHints?.configurationRequired} onClick={() => void install()}>{busy ? 'Installing…' : 'Install'}</Button></div>
    </DialogContent>
  </Dialog>;
}
/** Compatibility export for existing callers. */
export const SideloadExtensionModal = AddExtensionModal;
