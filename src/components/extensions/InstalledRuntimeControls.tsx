import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useExtensionInstaller, useExtensionUpdates } from '@/hooks/api/useExtensionStore';
type Installed = { id: string; name: string; version: string; enabled: boolean; loaded: boolean };
export function InstalledRuntimeControls() {
  const { t } = useTranslation(); const client = useQueryClient();
  const runtime = (window as any).tatakaiRuntime;
  const list = (window as any).electron?.listInstalledExtensions;
  const installed = useQuery<Installed[]>({ queryKey:['extension-runtime-management'], queryFn: () => list(), enabled: typeof list === 'function', refetchInterval:10000 });
  const toggle = useMutation({ mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
    const result = await runtime.setExtensionEnabled(id, enabled);
    if (!result?.success) throw new Error(result?.error || 'Could not change extension state');
  }, onSuccess: () => { void client.invalidateQueries({ queryKey:['extension-runtime-management'] }); window.dispatchEvent(new Event('tatakai:extension-installed')); } });
  const { updates } = useExtensionUpdates(); const installer = useExtensionInstaller();
  return <div className="my-5 space-y-3">
    {installed.isError && <div role="alert" className="text-destructive">{t('feedback.runtimeError')}<Button variant="ghost" onClick={() => void installed.refetch()}>{t('feedback.retry')}</Button></div>}
    {toggle.isError && <p role="alert" className="text-destructive">{toggle.error.message}</p>}
    {installed.data?.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground"><div><p className="font-semibold">{item.name || item.id} <span className="text-xs text-muted-foreground">{item.version}</span></p><p className="text-sm text-muted-foreground">{t(item.enabled === false ? 'feedback.disabled' : item.loaded ? 'feedback.loaded' : 'feedback.notLoaded')}</p></div><Switch aria-label={t('feedback.enableExtension', { name:item.name || item.id })} checked={item.enabled !== false} disabled={toggle.isPending} onCheckedChange={enabled => toggle.mutate({ id:item.id, enabled })}/></div>)}
    {updates.map(update => <div key={update.extension.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><span>{update.extension.name} · {update.installedVersion} → {update.latestVersion}</span><Button disabled={installer.install.isPending} onClick={() => installer.install.mutate({ extension:update.extension, version:update.latestStoreVersion })}>{t('feedback.update')}</Button></div>)}
  </div>;
}
