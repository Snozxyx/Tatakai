/**
 * mobileDownloadService.ts — keep mobile downloads alive + visible.
 *
 * Two jobs while any anime/manga download is active on Capacitor Android:
 *
 *  1. Foreground service (via `@capawesome-team/capacitor-android-foreground-service`):
 *     keeps the process alive when the user backgrounds the app AND shows a
 *     persistent status-bar notification with live progress ("Downloading 2
 *     items · Frieren Ep 5 — 42%"). Updates are throttled so the notification
 *     manager isn't spammed by per-segment progress.
 *  2. Wake lock: the screen may still sleep, but the CPU stays awake so
 *     JS-driven segment downloads (HLS/manga) keep flowing in the background.
 *
 * On completion the service stops and a one-shot LocalNotifications notice
 * ("Download complete") fires. Everything is best-effort and guarded — if the
 * native pieces are missing (web preview, iOS, denied permission) the in-app
 * download UI + navbar badge still carry the status.
 */

import { isAndroid, isCapacitor } from '@/lib/platform/platform';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { loadMobileConfig } from '@/hooks/ui/useMobileConfig';

const NOTIFICATION_ID = 1701;
const CHANNEL_ID = 'tatakai-downloads';
const SMALL_ICON = 'ic_notification';

type ActiveEntry = { label: string; progress: number };

const active = new Map<string, ActiveEntry>();
let serviceRunning = false;
let lastPushAt = 0;
let lastBody = '';
let channelReady = false;

function summarize(): { count: number; body: string; topProgress: number } {
  const entries = [...active.values()];
  const count = entries.length;
  if (!count) return { count: 0, body: '', topProgress: 100 };
  const avg = Math.round(entries.reduce((s, e) => s + e.progress, 0) / count);
  const top = entries[0];
  const body =
    count === 1
      ? `Downloading · ${top.label} — ${Math.round(top.progress)}%`
      : `Downloading ${count} items · ${top.label} — ${avg}%`;
  return { count, body, topProgress: avg };
}

async function ensureChannel(): Promise<void> {
  if (channelReady || !isAndroid()) return;
  try {
    const { ForegroundService } = await import(
      '@capawesome-team/capacitor-android-foreground-service'
    );
    try {
      await ForegroundService.createNotificationChannel({
        id: CHANNEL_ID,
        name: 'Downloads',
        description: 'Shows anime & manga download progress.',
      });
    } catch {
      /* channel may already exist */
    }
    channelReady = true;
  } catch {
    /* plugin missing — degrade silently */
  }
}

async function pushServiceNotification(force = false): Promise<void> {
  if (!isAndroid()) return;
  const { count, body } = summarize();
  if (!count) return;
  const now = Date.now();
  // Throttle native updates: at most one every 2.5s unless forced (start/finish).
  if (!force && (body === lastBody || now - lastPushAt < 2500)) return;
  lastPushAt = now;
  lastBody = body;
  try {
    await ensureChannel();
    const { ForegroundService } = await import(
      '@capawesome-team/capacitor-android-foreground-service'
    );
    if (!serviceRunning) {
      try {
        const perm = await ForegroundService.checkPermissions();
        if (perm.display !== 'granted') {
          await ForegroundService.requestPermissions();
        }
      } catch {
        /* pre-Android-13 needs no runtime permission */
      }
      await ForegroundService.startForegroundService({
        id: NOTIFICATION_ID,
        title: 'Tatakai downloads',
        body,
        smallIcon: SMALL_ICON,
        silent: true,
        notificationChannelId: CHANNEL_ID,
      });
      serviceRunning = true;
    } else {
      await ForegroundService.updateForegroundService({
        id: NOTIFICATION_ID,
        title: 'Tatakai downloads',
        body,
        smallIcon: SMALL_ICON,
        silent: true,
        notificationChannelId: CHANNEL_ID,
      });
    }
  } catch {
    /* notification is best-effort; downloads continue without it */
  }
}

async function stopService(): Promise<void> {
  if (!serviceRunning) return;
  serviceRunning = false;
  lastBody = '';
  try {
    const { ForegroundService } = await import(
      '@capawesome-team/capacitor-android-foreground-service'
    );
    await ForegroundService.stopForegroundService();
  } catch {
    /* ignore */
  }
  try {
    await KeepAwake.allowSleep();
  } catch {
    /* ignore */
  }
}

async function completionNotice(title: string, body: string): Promise<void> {
  if (!isCapacitor()) return;
  if (!loadMobileConfig().downloadCompleteNotifications) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
    } catch {
      /* pre-Android-13 needs no runtime permission */
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: Math.abs(
            [...`${title}:${body}:${Date.now()}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7),
          ) % 2147483647,
          smallIcon: SMALL_ICON,
        },
      ],
    });
  } catch {
    /* ignore */
  }
}

/** A download started — register it and raise the foreground service. */
export function downloadServiceStart(id: string, label: string): void {
  try {
    if (!isCapacitor() || !id) return;
    active.set(id, { label: String(label || 'Download'), progress: 0 });
    try {
      void KeepAwake.keepAwake().catch(() => {});
    } catch {
      /* ignore */
    }
    void pushServiceNotification(true);
  } catch {
    /* never break a download for a notification */
  }
}

/** Progress tick — cheap; native updates are throttled inside. */
export function downloadServiceProgress(id: string, label: string, progress: number): void {
  try {
    const entry = active.get(id);
    const pct = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
    if (entry) {
      entry.progress = pct;
      if (label) entry.label = String(label);
    } else {
      active.set(id, { label: String(label || 'Download'), progress: pct });
    }
    void pushServiceNotification(false);
  } catch {
    /* ignore */
  }
}

/** A download reached a terminal state — deregister; stop when the queue empties. */
export function downloadServiceFinish(
  id: string,
  outcome: { ok: boolean; cancelled?: boolean; label?: string },
): void {
  try {
    const entry = active.get(id);
    active.delete(id);
    const label = String(outcome.label || entry?.label || 'Download');
    if (active.size > 0) {
      void pushServiceNotification(true);
      return;
    }
    void stopService();
    if (outcome.cancelled) return;
    if (outcome.ok) {
      void completionNotice('Download complete', label);
    } else {
      void completionNotice('Download failed', label);
    }
  } catch {
    /* ignore */
  }
}

/** Snapshot for debugging / widgets. */
export function downloadServiceActiveCount(): number {
  return active.size;
}
