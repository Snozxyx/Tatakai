import { useEffect } from 'react';
import {
  ingestUpdaterEvent,
  markInstalling,
  type UpdaterEvent,
} from './update-monitor';

/**
 * App-lifetime driver for the silent desktop-update flow. Mounted once (from the
 * TitleBar, which only renders on the desktop shell), it:
 *
 *   1. subscribes to the main-process `updater-event` broadcast and folds each
 *      event into the shared update-monitor store, and
 *   2. kicks off a SILENT background download the moment a non-mandatory update
 *      becomes available — the user never has to press "Download".
 *
 * Mandatory updates are left alone: update-manager.cjs downloads and installs
 * those itself. Downloaded updates install on the next natural quit
 * (autoInstallOnAppQuit), with the Dynamic Island offering an optional
 * "Restart to update" shortcut.
 */

interface ElectronUpdaterBridge {
  onUpdaterEvent?: (cb: (data: UpdaterEvent) => void) => (() => void) | void;
  updateDownload?: () => void;
  updateInstall?: () => void;
}

function bridge(): ElectronUpdaterBridge | null {
  const el = (window as unknown as { electron?: ElectronUpdaterBridge }).electron;
  return el && typeof el.onUpdaterEvent === 'function' ? el : null;
}

export function useUpdateOrchestrator(): void {
  useEffect(() => {
    const el = bridge();
    if (!el?.onUpdaterEvent) return;

    // Guard so a burst of `available`/`downloading` events can't fire multiple
    // parallel downloads; reset only matters within one app run.
    let downloadStarted = false;

    const unsubscribe = el.onUpdaterEvent((data: UpdaterEvent) => {
      ingestUpdaterEvent(data);

      // Silent auto-download: the standard/recommended feed reports `available`
      // with autoDownload off, so we start the download ourselves. Mandatory
      // updates are downloaded+installed by the main process — don't double-fire.
      if (data.type === 'available' && !downloadStarted) {
        downloadStarted = true;
        try {
          el.updateDownload?.();
        } catch {
          /* best-effort; the manual button in Settings remains a fallback */
        }
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);
}

/** Trigger the quit-and-install now (used by the Dynamic Island restart pill). */
export function installUpdateNow(): void {
  const el = bridge();
  try {
    el?.updateInstall?.();
    markInstalling();
  } catch {
    /* ignore */
  }
}
