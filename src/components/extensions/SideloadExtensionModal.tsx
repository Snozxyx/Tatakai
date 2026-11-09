import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { downloadExtensionKai } from '@/core/extensions/marketplace-client';
import { detectEcosystem, normalizeManifestUrl, migrateExtensionStorage, INSTALLED_MANIFESTS_KEY, EXTENSION_INSTALLED_EVENT } from '@/core/extensions/ecosystems';
import { installRemoteExtension, listRemoteExtensions, type RemoteExtension } from '@/core/extensions/remote/installed';
import { extensionFetch } from '@/core/extensions/remote/transport';
import type { ExtensionManifest } from '@/pages/base/ExtensionHubPage';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { CompatibilityExtensionsPanel } from './CompatibilityExtensionsPanel';
import { isSoraRepositoryMetadata } from '@/core/extensions/sora/repository';
import { isMangayomiRepositoryMetadata } from '@/core/extensions/mangayomi/repository';
import { isAniyomiRepositoryMetadata } from '@/core/extensions/compatibility/repository-metadata';
import type { CompatibilityEcosystem } from '@/core/extensions/compatibility/client';
import { addonConfiguration } from '@/core/extensions/remote/configuration';
import { isTV } from '@/core/tv/device';

interface Props { isOpen: boolean; onClose(): void; onSuccess?(extension: ExtensionManifest): void; initialUrl?: string; existingId?: string; initialManifest?: Record<string, any>; expectedAddonId?: string }
export function AddExtensionModal({ isOpen, onClose, onSuccess, initialUrl, existingId, initialManifest, expectedAddonId }: Props) {
  useUiTranslation();
  const native = useIsNativeApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [flow, setFlow] = useState('package');
  const [repository, setRepository] = useState<{ url: string; ecosystem: CompatibilityEcosystem }>();
  const [url, setUrl] = useState('');
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [manifest, setManifest] = useState<Record<string, any> | null>(null);
  const [origin, setOrigin] = useState('');
  const [isKai, setIsKai] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ecosystem = manifest ? detectEcosystem(manifest) : null;
  useEffect(() => {
    if (isOpen && !busy) {
      const panel = urlInput.current?.closest('[role="dialog"]');
      if (panel && (!panel.contains(document.activeElement) || document.activeElement === panel)) urlInput.current?.focus();
    }
  }, [isOpen, busy]);
  const close = () => { generation.current += 1; setBusy(false); setUrl(''); setFileName(''); setBuffer(null); setManifest(null); setOrigin(''); setError(''); setFlow('package'); setRepository(undefined); setPreferences({}); onClose(); };
  const inspect = useCallback(async (data: ArrayBuffer, endpoint: string, current: number) => {
    if (data.byteLength > 30 * 1024 * 1024) throw new Error(uiI18n.t('app.extension_must_be_under_30_mb_5d742e85'));
    const bytes = new Uint8Array(data);
    const archive = bytes[0] === 80 && bytes[1] === 75;
    let parsed: Record<string, any>;
    if (archive) {
      const zip = await JSZip.loadAsync(data);
      const entry = zip.file('manifest.json'); if (!entry) throw new Error(uiI18n.t('app.package_is_missing_manifest_json_9c8df761'));
      parsed = JSON.parse(await entry.async('string'));
    } else parsed = JSON.parse(new TextDecoder().decode(data));
    if (current !== generation.current) return;
    if (expectedAddonId && parsed.id !== expectedAddonId) throw new Error(uiI18n.t('extensionSetup.wrongAddon'));
    if (native && (Array.isArray(parsed.pluginLists) || parsed.index_v2 || parsed.meta?.signingKeyFingerprint || isSoraRepositoryMetadata(parsed) || isMangayomiRepositoryMetadata(parsed) || isAniyomiRepositoryMetadata(parsed))) {
      if (!endpoint) throw new Error('Paste the original repository URL so its package links and updates can be resolved.');
      setRepository({ url: endpoint, ecosystem: Array.isArray(parsed.pluginLists) ? 'cloudstream' : isAniyomiRepositoryMetadata(parsed) ? 'aniyomi' : isMangayomiRepositoryMetadata(parsed) ? 'mangayomi' : isSoraRepositoryMetadata(parsed) ? 'sora' : 'mihon' }); setFlow('repositories'); return;
    }
    if (!parsed.id || !parsed.name || !parsed.version) throw new Error(uiI18n.t('app.manifest_needs_id_name_and_version_c2a74f2a'));
    const previous = existingId ? (await listRemoteExtensions()).find(row => row.id === existingId) : undefined;
    if (current !== generation.current) return;
    if (previous && previous.manifest.id !== parsed.id) throw new Error(uiI18n.t('extensionSetup.wrongAddon'));
    setPreferences(previous?.preferences || Object.fromEntries((parsed.userConfig?.fields || []).map((f: any) => [f.name, f.default || ""])));
    setBuffer(data); setManifest(parsed); setOrigin(endpoint); setIsKai(archive);
  }, [native, expectedAddonId, existingId]);
  const read = useCallback(async (action: (current: number) => Promise<void>) => {
    const current = ++generation.current;
    setBusy(true); setError(''); setManifest(null);
    try { await action(current); } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : uiI18n.t('app.could_not_read_extension_1fc1a37c')); }
    finally { if (current === generation.current) setBusy(false); }
  }, []);
  const previewUrl = useCallback((value: string) => read(async current => {
    const endpoint = normalizeManifestUrl(value);
    const response = await extensionFetch(endpoint);
    if (!response.ok) throw new Error(uiI18n.t('app.manifest_download_failed_i18n_value_0_3fd30c4e', { value0: response.status }));
    await inspect(new TextEncoder().encode(await response.text()).buffer, endpoint, current);
  }), [read, inspect]);
  useEffect(() => {
    if (!isOpen) return;
    if (initialUrl) {
      setUrl(initialUrl);
      if (initialManifest) void read(current => inspect(new TextEncoder().encode(JSON.stringify(initialManifest)).buffer, initialUrl, current));
      else void previewUrl(initialUrl);
    }
    return () => { generation.current += 1; };
  }, [isOpen, initialUrl, initialManifest, read, inspect, previewUrl]);
  const install = async () => {
    if (!manifest || !buffer) return;
    setBusy(true); setError('');
    try {
      let canonicalId = String(manifest.id);
      let remoteRecord: RemoteExtension | undefined;
      if (ecosystem === 'stremio' || ecosystem === 'seanime') {
        const installed = await installRemoteExtension(manifest, origin || manifest.manifestURI, existingId, preferences);
        remoteRecord = installed;
        canonicalId = installed.id;
      } else {
        if (ecosystem !== 'tatakai') throw new Error(uiI18n.t('app.this_ecosystem_requires_its_original_application_6a67a66e'));
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(canonicalId) || canonicalId.includes('..')) throw new Error(uiI18n.t('app.invalid_extension_identifier_f02729e5'));
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
          if (executable) throw new Error(uiI18n.t('app.install_the_kai_package_containing_this_extensio_356ffd6b'));
          const installManifest = runtime?.installManifest || runtime?.sideloadManifest;
          result = installManifest ? await installManifest(manifest) : { success: true };
        }
        if (!result?.success) throw new Error(result?.error || 'Extension runtime unavailable');
        canonicalId = result.extensionId || canonicalId;
      }
      const installed = { ...manifest, name: String(manifest.name), description: String(manifest.description || ""), version: String(manifest.version), payload: undefined, upstreamType: manifest.type, id: canonicalId, ecosystem, manifestUrl: origin || manifest.manifestURI,
        ...(remoteRecord ? { enabled: remoteRecord.enabled } : {}),
        author: manifest.author || 'Community', icon: manifest.logo || manifest.icon, banner: manifest.background || manifest.banner || manifest.bannerUrl,
        type: ecosystem === 'stremio' || manifest.type === 'onlinestream-provider' ? 'onlinestream' : manifest.type === 'anime-torrent-provider' ? 'torrent' : ['torrent','onlinestream','custom'].includes(manifest.type) ? manifest.type : 'custom',
        categories: manifest.categories || [], permissions: manifest.permissions || [], isApproved: true, status: 'approved' } as ExtensionManifest;
      migrateExtensionStorage();
      const records = JSON.parse(localStorage.getItem(INSTALLED_MANIFESTS_KEY) || '[]');
      localStorage.setItem(INSTALLED_MANIFESTS_KEY, JSON.stringify([installed, ...records.filter((row: ExtensionManifest) => row.id !== canonicalId)]));
      const ids = JSON.parse(localStorage.getItem('tatakai_installed_extensions') || '[]');
      localStorage.setItem('tatakai_installed_extensions', JSON.stringify([...new Set([...ids, canonicalId])]));
      window.dispatchEvent(new CustomEvent(EXTENSION_INSTALLED_EVENT));
      onSuccess?.(installed); toast.success(uiI18n.t('app.extension_installed_f2a980fc')); close();
    } catch (e) { setError(e instanceof Error ? e.message : uiI18n.t('app.installation_failed_346500a9')); }
    finally { setBusy(false); }
  };
  const configure = async () => {
    if (!origin || !manifest) return;
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      const configured = await addonConfiguration.start({ manifestUrl: origin, expectedAddonId: String(manifest.id), existingId });
      if (current !== generation.current) return;
      if (configured) {
        setUrl(configured.manifestUrl);
        await inspect(new TextEncoder().encode(JSON.stringify(configured.manifest)).buffer, configured.manifestUrl, current);
      } else if (!native) setError(uiI18n.t('app.configure_this_addon_then_paste_its_configured_m_0e3d6bac'));
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : uiI18n.t('app.could_not_open_addon_configuration_7d290941'));
    } finally { if (current === generation.current) setBusy(false); }
  };
  return <Dialog open={isOpen} onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent className={`${isTV() ? 'tv-dialog ' : ''}max-h-[85dvh] min-w-0 w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto`}
      onOpenAutoFocus={event => {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (urlInput.current && !urlInput.current.disabled) { event.preventDefault(); urlInput.current.focus(); }
      }}
      onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}><DialogHeader><DialogTitle>{uiI18n.t('app.add_extension_11500bcc')}</DialogTitle>
      <DialogDescription>{native ? 'Add a Tatakai package, an addon manifest, or a local extension repository on this device.' : uiI18n.t('app.choose_a_tatakai_package_or_a_stremio_seanime_ma_c3bb252a')}</DialogDescription></DialogHeader>
      <Tabs value={flow} onValueChange={setFlow}>
      {native && <TabsList className="grid h-auto w-full grid-cols-2"><TabsTrigger value="package" disabled={busy} className="whitespace-normal">Packages &amp; manifests</TabsTrigger><TabsTrigger value="repositories" disabled={busy} className="whitespace-normal">Local repositories</TabsTrigger></TabsList>}
      <TabsContent value="package" className="space-y-4">
      <div className="flex flex-col gap-2 text-sm"><span>{uiI18n.t('app.extension_file_8c5c396c')}</span>
        <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-label="Choose extension package or manifest" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (file) void read(async current => {
            if (!/\.(kai|json)$/i.test(file.name)) throw new Error('Choose a .kai package or .json manifest');
            if (file.size > 30 * 1024 * 1024) throw new Error('Extension must be under 30 MB');
            setFileName(file.name); await inspect(await file.arrayBuffer(), '', current);
          });
        }} />
        <Button type="button" variant="outline" disabled={busy} onClick={() => {
          const picker = (window as any).electron?.pickExtensionPackage;
          if (!picker) { fileInput.current?.click(); return; }
          void read(async current => {
            const file = await picker();
            if (!file) return;
            if (current !== generation.current) return;
            setFileName(file.name); await inspect(new Uint8Array(file.bytes).buffer, '', current);
          });
        }}>Install from file</Button>
        {fileName && <span className="truncate text-muted-foreground">{fileName}</span>}
        <span className="text-xs text-muted-foreground">Choose a .kai package or .json manifest (up to 30 MB).</span>
      </div>
      <label className="block space-y-2 text-sm">{uiI18n.t('app.manifest_or_package_url_cfe49ad9')}<Input ref={urlInput} data-tv-key="extension-manifest-url" value={url} onChange={event => { setUrl(event.target.value); setManifest(null); }} placeholder="https://…/manifest.json" disabled={busy} /></label>
      <Button variant="outline" disabled={busy || !url.trim()} onClick={() => void read(async current => {
        const endpoint = normalizeManifestUrl(url);
        if (native && /\.pb$/i.test(new URL(endpoint).pathname)) { setRepository({ url: endpoint, ecosystem: 'mihon' }); setFlow('repositories'); return; }
        if (/\.(cs3|apk)$/i.test(new URL(endpoint).pathname)) throw new Error('Open Local repositories and add this extension’s repository, then install the package there.');
        if (new URL(endpoint).pathname.endsWith('.json')) {
          const response = await extensionFetch(endpoint);
          if (!response.ok) throw new Error(uiI18n.t('app.manifest_download_failed_i18n_value_0_3fd30c4e', { value0: response.status }));
          await inspect(new TextEncoder().encode(await response.text()).buffer, endpoint, current);
        } else await inspect(await downloadExtensionKai(endpoint), endpoint, current);
      })}>{busy ? uiI18n.t('app.reading_extension_537266ad') : uiI18n.t('app.read_extension_38c19101')}</Button>
      {manifest && <div className="space-y-2 rounded-lg border border-border p-4"><p className="font-semibold">{manifest.name} <span className="text-sm text-muted-foreground">{manifest.version}</span></p><p className="text-sm capitalize">{ecosystem}</p><p className="text-sm text-muted-foreground">{manifest.description}</p>
        {(manifest.userConfig?.fields || []).map((field: any) => <label key={field.name} className="block text-sm">{field.label || field.name}<Input value={String(preferences[field.name] || '')} onChange={e => setPreferences(p => ({ ...p, [field.name]: e.target.value }))} /></label>)}
        {(manifest.behaviorHints?.configurable || manifest.behaviorHints?.configurationRequired) && <Button data-tv-key="extension-configure" variant="outline" disabled={busy} onClick={configure}>{uiI18n.t('app.configure_addon_2aa4830c')}</Button>}
        {manifest.behaviorHints?.configurationRequired && <p className="text-sm">{uiI18n.t('app.configure_this_addon_then_paste_its_configured_m_0e3d6bac')}</p>}</div>}
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button data-tv-key="extension-cancel" variant="ghost" disabled={busy} onClick={close}>{uiI18n.t('app.cancel_77dfd213')}</Button><Button data-tv-key="extension-install" disabled={busy || !manifest || !!manifest.behaviorHints?.configurationRequired} onClick={() => void install()}>{busy ? uiI18n.t('app.installing_8d278823') : existingId ? uiI18n.t('extensionSetup.saveConfiguration') : uiI18n.t('app.install_fd6c3ebf')}</Button></div>
      </TabsContent>
      {native && <TabsContent value="repositories"><CompatibilityExtensionsPanel key={`${repository?.ecosystem}:${repository?.url}`} embedded initialRepository={repository} /></TabsContent>}
      </Tabs>
    </DialogContent>
  </Dialog>;
}
/** Compatibility export for existing callers. */
export const SideloadExtensionModal = AddExtensionModal;
