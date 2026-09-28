/**
 * deviceInfo.ts — stable per-device identity for session recording + device-ban
 * enforcement.
 *
 * There is no server-issued device id in the web/Electron client, so we mint a
 * stable random id on first run and persist it in localStorage. The RPCs
 * (`record_user_session`, `is_device_banned`, `admin_ban_device`) treat this as
 * an advisory text token — it only needs to be stable per browser/device.
 *
 * `getDeviceName()` produces a short human-readable label ("Chrome on Windows")
 * for the sessions list / admin user page. Best-effort UA parsing, never throws.
 */

const DEVICE_ID_KEY = 'tatakai_device_id';

/** Stable per-device id (localStorage-persisted). Returns '' if storage is unavailable. */
export function getOrCreateDeviceId(): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

/** Short "Browser on OS" label from the UA string; falls back to 'Unknown device'. */
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Unknown device';
  const ua = navigator.userAgent || '';

  const os =
    /Windows/i.test(ua) ? 'Windows'
    : /Android/i.test(ua) ? 'Android'
    : /(iPhone|iPad|iPod)/i.test(ua) ? 'iOS'
    : /Mac OS X/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux'
    : 'Unknown OS';

  const browser =
    /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) || /Opera/i.test(ua) ? 'Opera'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari'
    : 'Browser';

  const isDesktopApp = typeof window !== 'undefined' && !!(window as any).electron;
  return `${browser} on ${os}${isDesktopApp ? ' (App)' : ''}`;
}
