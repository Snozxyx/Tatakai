import { supabase } from "@/integrations/supabase/client";
import { mergeCustomizationValue, type CustomizationSettings } from '@/lib/customization';

const GUEST_SETTINGS_COOKIE_KEY = "tatakai_guest_settings_v1";
const GUEST_SETTINGS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const ACCOUNT_SETTINGS_LOCAL_PREFIX = "tatakai_account_settings_v1:";

export interface PersistedAppSettings {
  readingTitleLanguage?: import('./titleLanguage').TitleLanguage;
  customization?: CustomizationSettings;
  locale?: string;
  readerPresets?: import('@/hooks/media/useReaderPresets').ReaderPresets;
  sidebar?: Record<string, unknown>;
  contentSafety?: {
    showAdultEverywhere?: boolean;
    warnBeforeAdultOpen?: boolean;
    blurAdultInSearch?: boolean;
  };
  video?: Record<string, unknown>;
  reader?: Record<string, unknown>;
  novelReader?: Record<string, unknown>;
  theme?: {
    theme?: string;
    mode?: 'manual' | 'system';
    lightTheme?: string;
    darkTheme?: string;
    reduceMotion?: boolean;
    highContrast?: boolean;
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isMissingAppSettingsColumnError = (error: any) => {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  return (
    error?.code === "42703" ||
    message.includes("app_settings") ||
    details.includes("app_settings")
  );
};

export const mergeAppSettings = (
  base: PersistedAppSettings,
  patch: Partial<PersistedAppSettings>,
): PersistedAppSettings => ({
  ...base,
  ...patch,
  ...((base.customization || patch.customization) ? {
    customization: mergeCustomizationValue(base.customization, patch.customization ?? {}) as CustomizationSettings,
  } : {}),
  ...(typeof patch.locale === 'string' ? { locale: patch.locale } : {}),
  contentSafety: {
    ...(isObject(base.contentSafety) ? base.contentSafety : {}),
    ...(isObject(patch.contentSafety) ? patch.contentSafety : {}),
  },
  video: {
    ...(isObject(base.video) ? base.video : {}),
    ...(isObject(patch.video) ? patch.video : {}),
  },
  reader: {
    ...(isObject(base.reader) ? base.reader : {}),
    ...(isObject(patch.reader) ? patch.reader : {}),
  },
  novelReader: {
    ...(isObject(base.novelReader) ? base.novelReader : {}),
    ...(isObject(patch.novelReader) ? patch.novelReader : {}),
  },
  theme: {
    ...(isObject(base.theme) ? base.theme : {}),
    ...(isObject(patch.theme) ? patch.theme : {}),
  },
});

const mergeSettings = mergeAppSettings;

const getCookieValue = (name: string): string | null => {
  if (typeof document === "undefined") return null;

  const segments = document.cookie ? document.cookie.split(";") : [];
  for (const segment of segments) {
    const [rawKey, ...rest] = segment.split("=");
    if (String(rawKey || "").trim() !== name) continue;
    return rest.join("=");
  }

  return null;
};

export function readGuestSettingsFromCookie(): PersistedAppSettings {
  const raw = getCookieValue(GUEST_SETTINGS_COOKIE_KEY);
  if (!raw) return {};

  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded);
    return isObject(parsed) ? (parsed as PersistedAppSettings) : {};
  } catch {
    return {};
  }
}

export function writeGuestSettingsCookie(
  patch: Partial<PersistedAppSettings>,
): PersistedAppSettings {
  const current = readGuestSettingsFromCookie();
  const next = mergeSettings(current, patch);
  // Large appearance maps and binary references are local/account-only.
  delete next.customization;

  if (typeof document !== "undefined") {
    document.cookie = `${GUEST_SETTINGS_COOKIE_KEY}=${encodeURIComponent(JSON.stringify(next))}; path=/; max-age=${GUEST_SETTINGS_COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  return next;
}

export function readProfileAppSettings(profile: any): PersistedAppSettings {
  const raw = profile?.app_settings;
  return isObject(raw) ? (raw as PersistedAppSettings) : {};
}

function getAccountSettingsLocalKey(userId: string): string {
  return `${ACCOUNT_SETTINGS_LOCAL_PREFIX}${userId}`;
}

export function readAccountSettingsFromLocal(userId: string): PersistedAppSettings {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(getAccountSettingsLocalKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? (parsed as PersistedAppSettings) : {};
  } catch {
    return {};
  }
}

function writeAccountSettingsToLocal(
  userId: string,
  patch: Partial<PersistedAppSettings>,
): PersistedAppSettings {
  const current = readAccountSettingsFromLocal(userId);
  const next = mergeSettings(current, patch);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(getAccountSettingsLocalKey(userId), JSON.stringify(next));
    } catch {
      // Ignore storage failures.
    }
  }

  return next;
}

const pendingSettingsWrites = new Map<string, Promise<PersistedAppSettings>>();
/** Retire one preference family without dropping unrelated queued settings. */
export function discardPendingAccountSettingsField(userId: string, field: 'customization' | 'theme' | 'sidebar'): void {
  if (typeof localStorage === 'undefined') return;
  const key = `${ACCOUNT_SETTINGS_LOCAL_PREFIX}pending:${userId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const pending = JSON.parse(raw);
    if (!isObject(pending) || !(field in pending)) return;
    delete pending[field];
    if (Object.keys(pending).length) localStorage.setItem(key, JSON.stringify(pending));
    else localStorage.removeItem(key);
  } catch { /* Do not change unrelated malformed outbox data. */ }
}
export function saveAccountSettingsPatch(userId: string, patch: Partial<PersistedAppSettings>): Promise<PersistedAppSettings> {
  // Persist before starting I/O; serialize read/merge/write to avoid lost patches.
  const local = writeAccountSettingsToLocal(userId, patch);
  const key = `${ACCOUNT_SETTINGS_LOCAL_PREFIX}pending:${userId}`;
  let pending: Partial<PersistedAppSettings> = {};
  try { pending = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* empty outbox */ }
  const combined = mergeSettings(pending, patch);
  try { localStorage.setItem(key, JSON.stringify(combined)); } catch { return saveAccountSettingsRemote(userId, combined); }
  const previous = pendingSettingsWrites.get(userId) || Promise.resolve(local);
  const task = previous.catch(() => local).then(async () => {
    const queued = localStorage.getItem(key);
    if (!queued) return local;
    const result = await saveAccountSettingsRemote(userId, JSON.parse(queued));
    if (localStorage.getItem(key) === queued) localStorage.removeItem(key);
    return result;
  });
  pendingSettingsWrites.set(userId, task);
  void task.finally(() => { if (pendingSettingsWrites.get(userId) === task) pendingSettingsWrites.delete(userId); }).catch(() => undefined);
  return task;
}
if (typeof window !== 'undefined') window.addEventListener('online', () => {
  void supabase.auth.getUser().then(({ data }) => {
    if (!data.user) return;
    const key = `${ACCOUNT_SETTINGS_LOCAL_PREFIX}pending:${data.user.id}`;
    try { const value = localStorage.getItem(key); if (value) void saveAccountSettingsPatch(data.user.id, JSON.parse(value)).catch(() => undefined); } catch { /* storage unavailable */ }
  }).catch(() => undefined);
});
export async function saveAccountSettingsRemote(
  userId: string,
  patch: Partial<PersistedAppSettings>,
  client: { from: (table: string) => any } = supabase as any,
): Promise<PersistedAppSettings> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
  const profileTable = client.from("profiles");
  const { data: profileRow, error: selectError } = await profileTable
    .select("app_settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    if (isMissingAppSettingsColumnError(selectError)) {
      throw selectError;
    }
    throw selectError;
  }

  if (!profileRow) throw new Error('Account settings are not available yet');

  const current = isObject(profileRow?.app_settings)
    ? (profileRow.app_settings as PersistedAppSettings)
    : {};

  const next = mergeSettings(current, patch);

  let update = client.from("profiles")
    .update({ app_settings: next })
    .eq("user_id", userId);
  update = profileRow.app_settings == null
    ? update.is('app_settings', null)
    : update.eq('app_settings', JSON.stringify(profileRow.app_settings));
  const { data: updated, error: updateError } = await update.select('app_settings').maybeSingle();

  if (updateError) {
    if (isMissingAppSettingsColumnError(updateError)) {
      throw updateError;
    }
    throw updateError;
  }

  if (updated) return next;
  }
  throw new Error('Account settings changed while saving. Your changes are queued for retry.');
}
