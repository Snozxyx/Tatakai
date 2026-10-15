import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
/**
 * ExtensionUpdateSheet — a bottom sheet that surfaces available updates for the
 * extensions the user has installed, on both desktop and mobile.
 *
 * It mounts once at the app root and opens itself on launch when there is at
 * least one update the user has not already deferred (see `useExtensionUpdates`).
 * Each row shows the version jump and the published changelog with an Update
 * button; "Update all" walks them in order. Closing the sheet defers the shown
 * versions so it stays quiet until something newer ships.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, ArrowRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ExtensionIcon } from '@/components/extensions/store/StorePrimitives';
import {
  useExtensionInstaller,
  useExtensionUpdates,
  useRemoteExtensionUpdates,
  type ExtensionUpdate,
  type RemoteExtensionUpdate,
} from '@/hooks/api/useExtensionStore';

function remoteHost(manifestUrl: string): string | null {
  try {
    return new URL(manifestUrl).hostname;
  } catch {
    return null;
  }
}

export function ExtensionUpdateSheet() {
  useUiTranslation();
  const { pendingUpdates, dismiss } = useExtensionUpdates();
  const { pendingRemote, dismissRemote, applyRemoteUpdate } =
    useRemoteExtensionUpdates();
  const installer = useExtensionInstaller();

  const [open, setOpen] = useState(false);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const autoOpenedRef = useRef(false);

  const totalPending = pendingUpdates.length + pendingRemote.length;

  const idOf = (update: ExtensionUpdate) =>
    String(update.extension.slug || update.extension.id).toLowerCase();

  // Open once per session the first time there is something to show. The user
  // closing it (which defers these versions) must not re-trigger the auto-open.
  useEffect(() => {
    if (!autoOpenedRef.current && totalPending > 0) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [totalPending]);

  // Everything got updated while the sheet was open — nothing left to show.
  // Unconditional: the sheet must never sit open with zero updates.
  useEffect(() => {
    if (totalPending === 0 && busyIds.length === 0) setOpen(false);
  }, [totalPending, busyIds.length]);

  const runUpdate = useCallback(
    async (update: ExtensionUpdate) => {
      const id = idOf(update);
      setBusyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      try {
        await installer.install.mutateAsync({ extension: update.extension });
      } catch {
        /* the installer surfaces its own error toast */
      } finally {
        setBusyIds((prev) => prev.filter((value) => value !== id));
      }
    },
    [installer.install],
  );

  const runRemoteUpdate = useCallback(
    async (update: RemoteExtensionUpdate) => {
      const id = update.row.id;
      setBusyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      try {
        await applyRemoteUpdate(update);
      } catch {
        /* installRemoteExtension callers surface their own error toast */
      } finally {
        setBusyIds((prev) => prev.filter((value) => value !== id));
      }
    },
    [applyRemoteUpdate]
  );

  const updateAll = useCallback(async () => {
    for (const update of pendingUpdates) {
      // Sequential: the installer tracks a single pending id at a time.
      await runUpdate(update);
    }
    for (const update of pendingRemote) {
      await runRemoteUpdate(update);
    }
  }, [pendingUpdates, pendingRemote, runUpdate, runRemoteUpdate]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      // Closing with updates still outstanding defers them to the next release.
      if (!next) {
        if (pendingUpdates.length > 0) dismiss(pendingUpdates);
        if (pendingRemote.length > 0) dismissRemote(pendingRemote);
      }
    },
    [dismiss, dismissRemote, pendingUpdates, pendingRemote]
  );

  // No updates, no sheet — not even an empty frame while state settles.
  if (totalPending === 0) return null;

  const anyBusy = busyIds.length > 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader className="pr-10">
          <SheetTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            {uiI18n.t('app.extension_update_ed536a67')}{totalPending === 1 ? '' : 's'} {uiI18n.t('app.available_7b231a50')}
          </SheetTitle>
          <SheetDescription>
            {totalPending === 1
              ? uiI18n.t('app.a_newer_version_of_an_installed_extension_is_rea_71dbda28')
              : uiI18n.t('app.i18n_value_0_installed_extensions_have_newer_ver_e307e7e7', { value0: totalPending })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-3">
          {pendingUpdates.map((update) => {
            const id = idOf(update);
            const busy = busyIds.includes(id);
            const changelog = update.latestStoreVersion?.changelog?.trim();
            return (
              <div
                key={id}
                className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <ExtensionIcon extension={update.extension} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold text-foreground">
                      {update.extension.name}
                    </p>
                    <Button size="sm" onClick={() => runUpdate(update)} disabled={busy || anyBusy}>
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {busy ? uiI18n.t('app.updating_ec6952e0') : uiI18n.t('app.update_fb91e24f')}
                    </Button>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-mono">v{update.installedVersion}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-mono text-primary">v{update.latestVersion}</span>
                  </div>
                  {changelog && (
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                      {changelog}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {pendingRemote.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {uiI18n.t('app.installed_add_ons_amp_providers_23778851')}
            </p>
            <div className="flex flex-col gap-3">
              {pendingRemote.map((update) => {
                const id = update.row.id;
                const busy = busyIds.includes(id);
                const host = remoteHost(update.row.manifestUrl);
                return (
                  <div
                    key={id}
                    className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <ExtensionIcon
                      extension={{
                        name: update.row.manifest.name || update.row.id,
                        icon: update.row.manifest.icon,
                        type: 'custom',
                      }}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold text-foreground">
                          {update.row.manifest.name || uiI18n.t('app.unnamed_add_on_f8c844cb')}
                        </p>
                        <Button
                          size="sm"
                          onClick={() => runRemoteUpdate(update)}
                          disabled={busy || anyBusy}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          {busy ? uiI18n.t('app.updating_ec6952e0') : uiI18n.t('app.update_fb91e24f')}
                        </Button>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">v{update.installedVersion}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-mono text-primary">v{update.latestVersion}</span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground/70">
                        {update.row.ecosystem === 'stremio' ? uiI18n.t('app.stremio_add_on_33add510') : uiI18n.t('app.seanime_provider_5f4a728d')}
                        {host ? uiI18n.t('app.i18n_value_0_92e4cd32', { value0: host }) : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={anyBusy}>
            {uiI18n.t('app.later_56e2f5d3')}
          </Button>
          {totalPending > 1 && (
            <Button onClick={updateAll} disabled={anyBusy}>
              {anyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {uiI18n.t('app.update_all_bca6296d')}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
