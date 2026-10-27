import { lazy, Suspense, useEffect, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EXTENSION_INSTALLED_EVENT } from '@/core/extensions/ecosystems';
import { compatibilityRequest, hasCompatibilityBridge, hasCompatibilityRuntime, COMPATIBILITY_ECOSYSTEMS, compatibilityLabel, type CompatibilityPackage } from '@/core/extensions/compatibility/client';
import { ExtensionLogo, compatibilityPackageIcon } from './ExtensionLogo';

const CompatibilityExtensionsPanel = lazy(() => import('./CompatibilityExtensionsPanel').then(module => ({ default: module.CompatibilityExtensionsPanel })));

/** Reads installed metadata, without refreshing repository catalogs or using the JS installer. */
export function InstalledCompatibilityExtensions({ search, ecosystem, type, compatibility }: { search: string; ecosystem: string; type: string; compatibility: string }) {
  const client = useQueryClient();
  const bridge = hasCompatibilityBridge();
  const [selected, setSelected] = useState<CompatibilityPackage>();
  const [limit, setLimit] = useState(36);
  useEffect(() => setLimit(36), [search, ecosystem, type, compatibility]);
  const inventories = useQueries({ queries: COMPATIBILITY_ECOSYSTEMS.map(kind => ({
    queryKey: ['compatibility', 'installedPackages', kind],
    queryFn: ({ signal }: { signal: AbortSignal }) => compatibilityRequest<CompatibilityPackage[]>({ op: 'installedPackages', ecosystem: kind }, signal),
    enabled: bridge && hasCompatibilityRuntime(kind), retry: false, staleTime: 30000,
  })) });
  useEffect(() => {
    const refresh = () => { void client.invalidateQueries({ queryKey: ['compatibility', 'installedPackages'] }); };
    window.addEventListener(EXTENSION_INSTALLED_EVENT, refresh);
    return () => window.removeEventListener(EXTENSION_INSTALLED_EVENT, refresh);
  }, [client]);
  if (!bridge) return null;
  const query = search.trim().toLowerCase();
  const visibleKinds = COMPATIBILITY_ECOSYSTEMS.filter(kind => (ecosystem === 'all' || ecosystem === kind) &&
    (type === 'all' || (kind === 'mihon' ? type === 'manga' : kind === 'sora' || kind === 'mangayomi' || kind === 'aniyomi' ? type === 'manga' || type === 'onlinestream' : type === 'onlinestream')) && (compatibility === 'all' || compatibility === 'limited'));
  if (!visibleKinds.length) return null;
  const packages = inventories.flatMap(q => q.data || []).filter(pkg => visibleKinds.includes(pkg.ecosystem) && (type === 'all' || !pkg.kind || (type === 'manga' ? pkg.kind === 'read' : pkg.kind === 'watch')) && `${pkg.name} ${pkg.id} ${pkg.ecosystem}`.toLowerCase().includes(query));
  const errors = inventories.flatMap((q, index) => q.error && visibleKinds.includes(COMPATIBILITY_ECOSYSTEMS[index]) ? [q.error.message] : []);
  const loading = inventories.some((q, index) => q.isPending && q.fetchStatus !== 'idle' && visibleKinds.includes(COMPATIBILITY_ECOSYSTEMS[index]));
  if (!packages.length && !loading && !errors.length) return null;
  return <section className="mt-8 flex min-w-0 flex-col gap-4" aria-label="Installed repository extensions">
    <div><h2 className="text-xl font-semibold">Installed repository extensions</h2><p className="text-sm text-muted-foreground">{packages.length} installed{query && ' matching your search'} · Stored on this device</p></div>
    {loading && <p role="status" className="text-sm text-muted-foreground">Checking installed packages…</p>}
    {errors.map((error, index) => <p key={index} role="alert" className="break-words text-sm text-destructive">Could not read installed packages: {error}</p>)}
    <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{packages.slice(0, limit).map(pkg => <div key={`${pkg.ecosystem}:${pkg.repository}:${pkg.id}`} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3"><ExtensionLogo name={pkg.name} src={compatibilityPackageIcon(pkg)} /><div className="min-w-0 flex-1"><p className="truncate font-semibold" title={pkg.name}>{pkg.name.replace(/Provider$/, '')}</p><p className="truncate text-xs text-muted-foreground">{compatibilityLabel(pkg.ecosystem)} · v{pkg.version}</p></div></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap gap-1.5"><Badge variant="outline">{pkg.kind === 'read' || pkg.ecosystem === 'mihon' ? 'Read' : 'Watch'}</Badge>{pkg.sources?.length ? <Badge variant="secondary">{[...new Set(pkg.sources.map(source => source.lang).filter(Boolean))].length} languages</Badge> : null}{pkg.hasUpdate && <Badge variant="outline">Update available</Badge>}</div><Button size="sm" variant="outline" data-tv-key={`native-extension-${pkg.ecosystem}-${pkg.id}`} aria-label={`Manage ${pkg.name}`} onClick={() => setSelected(pkg)}>Manage</Button></div>
      {pkg.error && <p className="break-words text-sm text-destructive">{pkg.error}</p>}
    </div>)}</div>
    {packages.length > limit && <Button variant="outline" className="self-center" onClick={() => setLimit(count => count + 36)}>Show more ({packages.length - limit} remaining)</Button>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(undefined); }}><DialogContent className="max-h-[85dvh] min-w-0 w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle className="break-words">Manage {selected?.name}</DialogTitle><DialogDescription>Manage this package and its sources on this device.</DialogDescription></DialogHeader>{selected && <Suspense fallback={<p role="status">Loading source tools…</p>}><CompatibilityExtensionsPanel key={`${selected.ecosystem}:${selected.id}`} embedded initialRepository={{ url: '', ecosystem: selected.ecosystem }} initialFilter={selected.id} /></Suspense>}</DialogContent></Dialog>
  </section>;
}
