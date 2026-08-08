import { supabase } from "@/integrations/supabase/client";

const GUEST_SETTINGS_COOKIE_KEY = "tatakai_guest_settings_v1";
const GUEST_SETTINGS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const ACCOUNT_SETTINGS_LOCAL_PREFIX = "tatakai_account_settings_v1:";

export interface PersistedAppSettings {
  contentSafety?: {
    showAdultEverywhere?: boolean;
    warnBeforeAdultOpen?: boolean;
    blurAdultInSearch?: boolean;
  };
  video?: Record<string, unknown>;
  theme?: {
    theme?: string;
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

const mergeSettings = (
  base: PersistedAppSettings,
  patch: Partial<PersistedAppSettings>,
): PersistedAppSettings => ({
  ...base,
  ...patch,
  contentSafety: {
    ...(isObject(base.contentSafety) ? base.contentSafety : {}),
    ...(isObject(patch.contentSafety) ? patch.contentSafety : {}),
  },
  video: {
    ...(isObject(base.video) ? base.video : {}),
    ...(isObject(patch.video) ? patch.video : {}),
  },
  theme: {
    ...(isObject(base.theme) ? base.theme : {}),
    ...(isObject(patch.theme) ? patch.theme : {}),
  },
});

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

function readAccountSettingsFromLocal(userId: string): PersistedAppSettings {
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

export async function saveAccountSettingsPatch(
  userId: string,
  patch: Partial<PersistedAppSettings>,
): Promise<PersistedAppSettings> {
  // App settings are currently local-only while the backend schema is being rewritten.
  return writeAccountSettingsToLocal(userId, patch);

  // Kept below for future re-enablement once profiles.app_settings exists again.
  // eslint-disable-next-line no-unreachable
  const profileTable = supabase.from("profiles" as any);

  const { data: profileRow, error: selectError } = await profileTable
    .select("app_settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    if (isMissingAppSettingsColumnError(selectError)) {
      return mergeSettings({}, patch);
    }
    throw selectError;
  }

  const current = isObject(profileRow?.app_settings)
    ? (profileRow.app_settings as PersistedAppSettings)
    : {};

  const next = mergeSettings(current, patch);

  const { error: updateError } = await profileTable
    .update({ app_settings: next })
    .eq("user_id", userId);

  if (updateError) {
    if (isMissingAppSettingsColumnError(updateError)) {
      return next;
    }
    throw updateError;
  }

  return next;
}
