import { Capacitor } from '@capacitor/core';
import { isTV } from '@/core/tv/device';
import { supabase } from '@/integrations/supabase/client';
import { randomUUID } from '@/lib/uuid';
import { getReleaseChannel } from './release-channel';
export function updatePlatform(): string {
  if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === 'android' && isTV() ? 'android-tv' : Capacitor.getPlatform();
  const p = (window as unknown as { electron?: { platform?: string } }).electron?.platform;
  return p === 'win32' ? 'windows' : p === 'darwin' ? 'macos' : p === 'linux' ? 'linux' : 'web';
}
let fallbackId: string | undefined;
export function updateDeviceId(): string {
  try { const id = localStorage.getItem('tatakai:update-device'); if (id && /^[0-9a-f-]{36}$/i.test(id)) return id; const fresh = randomUUID(); localStorage.setItem('tatakai:update-device', fresh); return fresh; } catch { return fallbackId ??= randomUUID(); }
}
const recent = new Map<string, number>();
/** Best-effort, bounded, client-reported telemetry. Never blocks an update. */
export function reportUpdateEvent(event: string, version = __APP_VERSION__, channel = getReleaseChannel()) {
  if (import.meta.env.DEV) return;
  const key = `${channel}:${event}:${version}`; const now = Date.now();
  if (now - (recent.get(key) || 0) < 60_000) return;
  if (recent.size > 100) recent.clear(); recent.set(key, now);
  void Promise.resolve(supabase.rpc('record_app_update_event' as never, { p_device: updateDeviceId(), p_platform: updatePlatform(), p_channel: channel === 'beta' ? 'beta' : 'production', p_version: version, p_event: event } as never)).catch(() => {});
}
