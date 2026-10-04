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
  type ExtensionUpdate,
} from '@/hooks/api/useExtensionStore';

export function ExtensionUpdateSheet() {
  const { pendingUpdates, dismiss } = useExtensionUpdates();
  const installer = useExtensionInstaller();

  const [open, setOpen] = useState(false);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const autoOpenedRef = useRef(false);

  const idOf = (update: ExtensionUpdate) =>
    String(update.extension.slug || update.extension.id).toLowerCase();

  // Open once per session the first time there is something to show. The user
  // closing it (which defers these versions) must not re-trigger the auto-open.
  useEffect(() => {
    if (!autoOpenedRef.current && pendingUpdates.length > 0) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [pendingUpdates.length]);

  // Everything got updated while the sheet was open — nothing left to show.
  useEffect(() => {
    if (open && pendingUpdates.length === 0 && busyIds.length === 0) setOpen(false);
  }, [open, pendingUpdates.length, busyIds.length]);

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

  const updateAll = useCallback(async () => {
    for (const update of pendingUpdates) {
      // Sequential: the installer tracks a single pending id at a time.
      // eslint-disable-next-line no-await-in-loop
      await runUpdate(update);
    }
  }, [pendingUpdates, runUpdate]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      // Closing with updates still outstanding defers them to the next release.
      if (!next && pendingUpdates.length > 0) dismiss(pendingUpdates);
    },
    [dismiss, pendingUpdates],
  );

  if (pendingUpdates.length === 0 && !open) return null;

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
            Extension update{pendingUpdates.length === 1 ? '' : 's'} available
          </SheetTitle>
          <SheetDescription>
            {pendingUpdates.length === 1
              ? 'A newer version of an installed extension is ready.'
              : `${pendingUpdates.length} installed extensions have newer versions ready.`}
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
                      {busy ? 'Updating' : 'Update'}
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

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={anyBusy}>
            Later
          </Button>
          {pendingUpdates.length > 1 && (
            <Button onClick={updateAll} disabled={anyBusy}>
              {anyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Update all
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
