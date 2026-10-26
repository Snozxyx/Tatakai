import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { compatibilityRequest, compatibilityMutation, notifyCompatibilityChange, hasCompatibilityBridge, COMPATIBILITY_ECOSYSTEMS, compatibilityLabel, type CompatibilityStatus, type CompatibilityEcosystem, type CompatibilityPackage, type CompatibilityRepository, type CompatibilitySource } from '@/core/extensions/compatibility/client';
import { useIsNativeApp } from '@/hooks/ui/useIsNativeApp';
import { CompatibilitySettings } from './CompatibilitySettings';
import { Progress } from '@/components/ui/progress';
import { installCompatibilityBatch, enableCompatibilityBatch, type BulkActionProgress } from '@/core/extensions/compatibility/bulk-install';
import { compatibilityProviders } from '@/core/extensions/compatibility/providers';
import { ExtensionLogo, compatibilityPackageIcon } from './ExtensionLogo';
import { CompatibilityProviderRow } from './CompatibilityProviderRow';

export function CompatibilityExtensionsPanel({ embedded = false, initialRepository, initialFilter = '' }: { embedded?: boolean; initialRepository?: { url: string; ecosystem: CompatibilityEcosystem }; initialFilter?: string } = {}) {
  const isNative = useIsNativeApp();
  const panelId = useId();
  const client = useQueryClient();
  const [ecosystem, setEcosystem] = useState<CompatibilityEcosystem>(initialRepository?.ecosystem || (Capacitor.getPlatform() === 'ios' ? 'sora' : Capacitor.getPlatform() === 'android' ? 'cloudstream' : 'mihon'));
  const [filter, setFilter] = useState(initialFilter);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settingsSource, setSettingsSource] = useState<CompatibilitySource>();
  const preparation = useRef<AbortController>();
  const batch = useRef<AbortController>();
  const [bulkProgress, setBulkProgress] = useState<BulkActionProgress>();
  const [bulkAction, setBulkAction] = useState<'install' | 'enable' | 'disable'>('install');
  useEffect(() => () => { preparation.current?.abort(); batch.current?.abort(); }, []);
  const form = useForm({ defaultValues: { url: initialRepository?.url || '' } });
  const bridge = hasCompatibilityBridge();
  const status = useQuery({ queryKey: ['compatibility', 'status'], queryFn: () => compatibilityRequest<CompatibilityStatus>({ op: 'status' }), enabled: bridge,
    refetchInterval: query => busy || query.state.data?.runtimes.some(r => r.preparing) ? 1000 : false });
  const runtime = status.data?.runtimes.find(r => r.ecosystem === ecosystem);
  const active = bridge && !!runtime?.available && !!runtime?.ready;
  const repositories = useQuery({ queryKey: ['compatibility', 'repositories', ecosystem], queryFn: () => compatibilityRequest<CompatibilityRepository[]>({ op: 'repositories', ecosystem }), enabled: active, retry: false });
  const packages = useQuery({ queryKey: ['compatibility', 'packages', ecosystem], queryFn: () => compatibilityRequest<CompatibilityPackage[]>({ op: 'packages', ecosystem }), enabled: active, retry: false, staleTime: 60000 });
  const installed = useQuery({ queryKey: ['compatibility', 'installedPackages', ecosystem], queryFn: ({ signal }) => compatibilityRequest<CompatibilityPackage[]>({ op: 'installedPackages', ecosystem }, signal), enabled: active, retry: false, staleTime: 30000 });
  const sources = useQuery({ queryKey: ['compatibility', 'sources', ecosystem], queryFn: () => compatibilityRequest<CompatibilitySource[]>({ op: 'sources', ecosystem }), enabled: active, retry: false });
  async function mutate(payload: Record<string, unknown>, signal?: AbortSignal) {
    setBusy(true); setError('');
    try { await compatibilityMutation({ ecosystem, ...payload }, signal); await client.invalidateQueries({ queryKey: ['compatibility'] }); await client.invalidateQueries({ queryKey: ['custom-sources'] }); }
    catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Extension operation failed'); }
    finally { setBusy(false); if (payload.op === 'prepare') void client.invalidateQueries({ queryKey: ['compatibility'] }); }
  }
  async function installAll(candidates: CompatibilityPackage[]) {
    if (busy || batch.current) return;
    const controller = new AbortController(); batch.current = controller; setBusy(true); setError(''); setBulkAction('install');
    try { await installCompatibilityBatch(candidates, pkg => compatibilityRequest({ ecosystem, op: 'install', packageId: pkg.id }, controller.signal), controller.signal, ({ installed, ...progress }) => setBulkProgress({ ...progress, succeeded: installed })); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Batch installation failed'); }
    finally {
      batch.current = undefined;
      notifyCompatibilityChange();
      try { await client.invalidateQueries({ queryKey: ['compatibility'] }); await client.invalidateQueries({ queryKey: ['custom-sources'] }); }
      finally { setBusy(false); }
    }
  }
  async function enableAll(enabled: boolean, targets = visibleSources) {
    if (busy || batch.current) return;
    const controller = new AbortController(); batch.current = controller; setBusy(true); setError(''); setBulkAction(enabled ? 'enable' : 'disable');
    try { await enableCompatibilityBatch(targets, enabled, source => compatibilityRequest({ op: 'setEnabled', ecosystem, sourceId: source.id, enabled }, controller.signal), controller.signal, setBulkProgress); }
    catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not change source enablement'); }
    finally { batch.current = undefined; notifyCompatibilityChange(); try { await client.invalidateQueries({ queryKey: ['compatibility'] }); await client.invalidateQueries({ queryKey: ['custom-sources'] }); } finally { setBusy(false); } }
  }
  const progress = runtime?.preparation;
  const progressLabel = ({ checking: 'Checking local files', downloading: 'Downloading runtime', verifying: 'Verifying downloaded files', extracting: 'Extracting runtime files', java: 'Preparing Java runtime', engine: 'Downloading and verifying extension runtime', license: 'Verifying runtime license', cancelled: 'Runtime preparation cancelled', error: 'Runtime preparation failed', ready: 'Runtime ready' } as Record<string, string>)[progress?.stage || ''] || 'Preparing local runtime';
  const progressPercent = progress?.totalBytes ? Math.min(100, Math.round((progress.receivedBytes || 0) / progress.totalBytes * 100)) : undefined;
  if (!isNative) return null;
  const inventory = new Map((packages.data || []).map(pkg => [pkg.repository + '\0' + pkg.id, pkg]));
  for (const pkg of installed.data || []) {
    const key = pkg.repository + '\0' + pkg.id, catalog = inventory.get(key);
    inventory.set(key, catalog ? { ...catalog, installed: true, error: pkg.error || catalog.error } : pkg);
  }
  const list = [...inventory.values()].filter(p => `${p.name} ${p.id}`.toLowerCase().includes(filter.toLowerCase()));
  const installable = list.filter(pkg => !pkg.installed);
  const packageIds = new Set(list.map(pkg => pkg.id));
  const visibleSources = (sources.data || []).filter(source => source.ecosystem === ecosystem && (!filter || packageIds.has(source.packageId) || `${source.name} ${source.lang}`.toLowerCase().includes(filter.toLowerCase())));
  const enabledCount = visibleSources.filter(source => source.enabled).length;
  const providers = compatibilityProviders(visibleSources);
  return <section className={embedded ? 'flex min-w-0 flex-col gap-4' : 'mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-8'} aria-labelledby={`${panelId}-heading`}>
    <div><h2 id={`${panelId}-heading`} className="text-xl font-semibold">Local extension repositories <Badge variant="secondary">Preview</Badge></h2><p className="text-sm text-muted-foreground">Local compatibility runtimes. Enabled sources join search and appear in watch/read pages when a title matches.</p></div>
    {Capacitor.getPlatform() === 'ios' && <Alert><AlertDescription>iOS supports local Sora and Mangayomi JavaScript execution. Verify the bundled runtime below before adding repositories. Original CloudStream .cs3, Mihon/Aniyomi APKs and Dart sources need hosts that are not included in this iOS build. iPhone/iPad validation is pending.</AlertDescription></Alert>}
    <Tabs value={ecosystem} onValueChange={v => { setEcosystem(v as CompatibilityEcosystem); setError(''); setFilter(''); setBulkProgress(undefined); }}>
      <TabsList className="h-auto w-full flex-wrap justify-start">{COMPATIBILITY_ECOSYSTEMS.map(kind => <TabsTrigger key={kind} value={kind} disabled={busy}>{compatibilityLabel(kind)}</TabsTrigger>)}</TabsList>
      {COMPATIBILITY_ECOSYSTEMS.map(kind => <TabsContent key={kind} value={kind} className="flex flex-col gap-4">
        {!bridge && <Alert><AlertDescription>{Capacitor.getPlatform() === 'ios' ? 'The local iOS bytecode runtime is not available yet. Original CloudStream/Mihon packages cannot run here until that host is implemented.' : 'This app build does not contain a compatibility bridge yet.'}</AlertDescription></Alert>}
        {status.isPending && bridge && <p role="status">Checking local runtime…</p>}
        {runtime && !runtime.available && <Alert><AlertDescription>{runtime.message}</AlertDescription></Alert>}
        {runtime?.available && runtime.ready && Capacitor.getPlatform() === 'ios' && <p className="text-sm text-muted-foreground">{runtime.message}</p>}
        {runtime?.available && !runtime.ready && <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{runtime.downloadBytes === 0 ? 'Prepare the runtime included with this app.' : `Download the upstream runtime onto this device (${Math.ceil((runtime.downloadBytes || 0) / 1024 / 1024)} MB).`} Only add repositories you trust; their extensions execute code locally.</p>
          {(busy || runtime.preparing) && <div className="w-full space-y-2"><p className="text-sm" role="status">{progressLabel}{progressPercent !== undefined ? ` — ${progressPercent}% (${Math.round((progress?.receivedBytes || 0) / 1024 / 1024)} / ${Math.ceil((progress?.totalBytes || 0) / 1024 / 1024)} MB)` : '…'}</p>{progressPercent !== undefined && <Progress value={progressPercent} aria-label={`${compatibilityLabel(ecosystem)} runtime preparation`} />}</div>}
          <div className="flex flex-wrap gap-2"><Button disabled={busy || runtime.preparing} onClick={() => { const controller = new AbortController(); preparation.current = controller; void mutate({ op: 'prepare' }, controller.signal).finally(() => { if (preparation.current === controller) preparation.current = undefined; }); }}>{busy || runtime.preparing ? 'Preparing local runtime…' : runtime.downloadBytes === 0 ? 'Prepare local runtime' : 'Download local runtime'}</Button>{busy && preparation.current && <Button variant="outline" onClick={() => preparation.current?.abort()}>Cancel preparation</Button>}</div>
        </div>}
        {active && <>
          {ecosystem === 'sora' && <p className="text-sm text-muted-foreground">Original Sora anime and manga modules run on this device. Modules provide search; browsing and advanced host features depend on the module. Only add repositories you trust.</p>}
          {ecosystem === 'mangayomi' && <p className="text-sm text-muted-foreground">Mangayomi JavaScript anime and manga sources run locally. Dart and novel sources, XPath, WebView and video extractor helpers still need additional host support. Only add repositories you trust.</p>}
          {ecosystem === 'aniyomi' && <p className="text-sm text-muted-foreground">Original Aniyomi anime and manga APKs run locally. Add an index.min.json or index.pb repository. Package signatures are verified and each package’s signing certificate is pinned for updates. WebView flows, downloads and device validation remain incomplete. Only add repositories you trust.</p>}
          {ecosystem === 'cloudstream' && <p className="text-sm text-muted-foreground">Original extensions run locally. Compatibility depends on the host APIs used by each extension.{runtime?.updates === false && ' Package updates are not available in this host yet.'}</p>}
          <Form {...form}><form className="flex flex-col gap-3" onSubmit={form.handleSubmit(async values => { await mutate({ op: 'addRepository', url: values.url.trim() }); })}>
            <FormField control={form.control} name="url" rules={{ required: 'Enter a repository URL', validate: value => { try { const u = new URL(value); return (u.protocol === 'https:' && !u.username && !u.password) || 'Use an HTTPS URL without login credentials'; } catch { return 'Enter a valid repository URL'; } } }} render={({ field }) => <FormItem><FormLabel>Repository URL</FormLabel><FormControl><Input {...field} type="url" placeholder="https://…/repo.json" disabled={busy} /></FormControl><FormMessage /></FormItem>} />
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Working…' : 'Add repository'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void client.invalidateQueries({ queryKey: ['compatibility'] })}>Refresh</Button></div>
          </form></Form>
          {(repositories.data || []).map(repo => <div key={repo.url} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="font-medium">{repo.name}</p><p className="break-all text-xs text-muted-foreground">{repo.url}</p></div><Button variant="outline" size="sm" disabled={busy} onClick={() => void mutate({ op: 'removeRepository', url: repo.url })}>Remove repository</Button></div>)}
          <div className="flex flex-wrap items-center gap-2"><Input className="min-w-0 flex-1" aria-label="Filter extension packages" placeholder="Find an extension…" disabled={busy} value={filter} onChange={e => setFilter(e.target.value)} /><Button variant="outline" disabled={busy || packages.isFetching || installable.length === 0} onClick={() => void installAll(installable)}>Install all ({installable.length})</Button></div>
          {bulkProgress && <div className="flex min-w-0 flex-col gap-2"><p role="status" className="break-words text-sm">{bulkProgress.current ? `${bulkAction === 'install' ? 'Installing' : bulkAction === 'enable' ? 'Enabling' : 'Disabling'} ${bulkProgress.current} — ` : bulkProgress.cancelled ? 'Operation stopped. ' : 'Operation finished. '}{bulkProgress.succeeded} {bulkAction === 'install' ? 'installed' : bulkAction === 'enable' ? 'enabled' : 'disabled'}, {bulkProgress.failed} failed; {bulkProgress.completed} of {bulkProgress.total} processed.</p><Progress value={bulkProgress.total ? bulkProgress.completed / bulkProgress.total * 100 : 0} aria-label="Extension operation progress" />{batch.current && <Button className="self-start" variant="outline" onClick={() => batch.current?.abort()}>{bulkAction === 'install' ? 'Cancel installation' : 'Cancel changes'}</Button>}{bulkProgress.failures.length > 0 && <Alert variant="destructive"><AlertDescription>{bulkProgress.failures.map((failure, index) => <p className="break-words" key={index}>{failure.name}: {failure.error}</p>)}</AlertDescription></Alert>}</div>}
          {packages.isFetching && <p role="status" className="text-sm text-muted-foreground">Loading repository packages…</p>}
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            {list.length === 0 && !packages.isFetching && <p className="p-4 text-sm text-muted-foreground">No packages found. Add a repository or change your filter.</p>}
            {list.slice(0, 100).map(pkg => <div key={pkg.repository + pkg.id} className="flex flex-wrap items-center justify-between gap-3 border-b p-3 last:border-0"><ExtensionLogo name={pkg.name} src={compatibilityPackageIcon(pkg)} className="size-10" /><div className="min-w-0 flex-1"><p className="break-words font-medium">{pkg.name}</p><p className="text-xs text-muted-foreground">{pkg.version} {pkg.installed && '· Installed'} {pkg.hasUpdate && runtime?.updates === false && '· Update available; host upgrade support pending'}</p>{pkg.error && <p className="break-words text-sm text-destructive">{pkg.error}</p>}</div><div className="flex flex-wrap gap-2">{(!pkg.installed || pkg.hasUpdate) && <Button size="sm" disabled={busy || (pkg.installed && runtime?.updates === false)} onClick={() => void mutate({ op: 'install', packageId: pkg.id, update: pkg.installed })}>{pkg.installed ? 'Update' : 'Install'}</Button>}{pkg.installed && <Button size="sm" variant="outline" disabled={busy} onClick={() => void mutate({ op: 'remove', packageId: pkg.id })}>Remove</Button>}</div></div>)}
          </div>
          {list.length > 100 && <p className="text-xs text-muted-foreground">Showing the first 100 packages. Use the filter to find more.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Installed providers</h3><p className="text-sm text-muted-foreground">{providers.length} providers · {enabledCount} of {visibleSources.length} language sources enabled</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy || sources.isFetching || enabledCount === visibleSources.length} onClick={() => void enableAll(true)}>Enable all ({visibleSources.length - enabledCount})</Button><Button variant="ghost" size="sm" disabled={busy || sources.isFetching || enabledCount === 0} onClick={() => void enableAll(false)}>Disable all</Button></div></div><p className="text-sm text-muted-foreground">Each provider contains its languages. Enabled sources join search and watch/read matching.</p>
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">{providers.map(provider => <CompatibilityProviderRow key={provider.id} id={`${panelId}-${provider.sources[0].id}`} name={provider.name} sources={provider.sources} busy={busy} icon={(() => { const pkg = list.find(pkg => pkg.id === provider.sources[0].packageId); return pkg ? compatibilityPackageIcon(pkg) : undefined; })()} onEnabled={(targets, enabled) => void enableAll(enabled, targets)} onSettings={setSettingsSource} />)}</div>
          {sources.isPending && <p role="status">Loading installed sources…</p>}
        </>}
        {(error || status.error || repositories.error || packages.error || installed.error || sources.error) && <Alert variant="destructive"><AlertDescription>{error || String(status.error?.message || repositories.error?.message || packages.error?.message || installed.error?.message || sources.error?.message)}</AlertDescription></Alert>}
      </TabsContent>)}
    </Tabs>
    {settingsSource && <CompatibilitySettings key={settingsSource.id} source={settingsSource} authentication={status.data?.runtimes.find(r => r.ecosystem === settingsSource.ecosystem)?.authentication === true} onClose={() => setSettingsSource(undefined)} />}
  </section>;
}
