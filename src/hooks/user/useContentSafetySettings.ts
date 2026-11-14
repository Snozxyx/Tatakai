import { disableAdultMode, getAdultMode, invalidateContentRequests, requestAdultMode, subscribeAdultMode } from '@/lib/adultMode';
import { normalizeAdultCategories, type AdultCategoryPreferences } from '@/lib/adultContentPolicy';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AccountContentSafetyState } from '@/lib/contentSafetyAccount';
import {
  readGuestSettingsFromCookie,
  readProfileAppSettings,
  saveAccountSettingsPatch,
  writeGuestSettingsCookie,
} from "@/lib/appSettingsPersistence";

export interface ContentSafetySettings {
  showAdultEverywhere: boolean;
  warnBeforeAdultOpen: boolean;
  blurAdultInSearch: boolean;
  adultCategories?: AdultCategoryPreferences;
  hideAdultChapterSpoilers?: boolean;
}

const STORAGE_KEY = "tatakai_content_safety";
const UPDATE_EVENT = "tatakai-content-safety-updated";
const accountState = new AccountContentSafetyState();

const DEFAULT_SETTINGS: ContentSafetySettings = {
  showAdultEverywhere: false,
  warnBeforeAdultOpen: true,
  blurAdultInSearch: true,
  adultCategories: normalizeAdultCategories(null),
  hideAdultChapterSpoilers: true,
};

const areSettingsEqual = (
  left: ContentSafetySettings,
  right: ContentSafetySettings,
) =>
  left.showAdultEverywhere === right.showAdultEverywhere &&
  left.warnBeforeAdultOpen === right.warnBeforeAdultOpen &&
  left.blurAdultInSearch === right.blurAdultInSearch &&
  left.hideAdultChapterSpoilers === right.hideAdultChapterSpoilers &&
  JSON.stringify(left.adultCategories) === JSON.stringify(right.adultCategories);

const hasContentSafetyPayload = (value: unknown) => {
  if (typeof value !== "object" || value === null) return false;
  const raw = value as Record<string, unknown>;
  return (
    "showAdultEverywhere" in raw ||
    "warnBeforeAdultOpen" in raw ||
    "blurAdultInSearch" in raw ||
    "adultCategories" in raw ||
    "hideAdultChapterSpoilers" in raw
  );
};

const sanitizeSettings = (raw: Partial<ContentSafetySettings> | null | undefined): ContentSafetySettings => ({
  showAdultEverywhere: getAdultMode() === 'adult',
  adultCategories: normalizeAdultCategories(raw?.adultCategories),
  hideAdultChapterSpoilers: typeof raw?.hideAdultChapterSpoilers === 'boolean' ? raw.hideAdultChapterSpoilers : true,
  warnBeforeAdultOpen:
    typeof raw?.warnBeforeAdultOpen === "boolean"
      ? raw.warnBeforeAdultOpen
      : DEFAULT_SETTINGS.warnBeforeAdultOpen,
  blurAdultInSearch:
    typeof raw?.blurAdultInSearch === "boolean"
      ? raw.blurAdultInSearch
      : DEFAULT_SETTINGS.blurAdultInSearch,
});

export function getContentSafetySettings(): ContentSafetySettings {
  if (typeof window === "undefined") {
    return sanitizeSettings(DEFAULT_SETTINGS);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const cookieSettings = readGuestSettingsFromCookie().contentSafety;
      if (cookieSettings) {
        return sanitizeSettings(cookieSettings as Partial<ContentSafetySettings>);
      }
      return sanitizeSettings(DEFAULT_SETTINGS);
    }
    const parsed = JSON.parse(raw) as Partial<ContentSafetySettings>;
    return sanitizeSettings(parsed);
  } catch {
    const cookieSettings = readGuestSettingsFromCookie().contentSafety;
    if (cookieSettings) {
      return sanitizeSettings(cookieSettings as Partial<ContentSafetySettings>);
    }
    return sanitizeSettings(DEFAULT_SETTINGS);
  }
}

const persistSettings = (settings: ContentSafetySettings): ContentSafetySettings => {
  if (typeof window !== "undefined") {
    const preferences = { ...settings, showAdultEverywhere: false };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    writeGuestSettingsCookie({ contentSafety: preferences });
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
  return settings;
};

export function patchContentSafetySettings(
  patch: Partial<ContentSafetySettings>
): ContentSafetySettings {
  const current = getContentSafetySettings();
  if (patch.showAdultEverywhere === true) requestAdultMode();
  else if (patch.showAdultEverywhere === false) disableAdultMode();
  const next = sanitizeSettings({ ...current, ...patch });
  persistSettings(next);
  if (JSON.stringify(current.adultCategories) !== JSON.stringify(next.adultCategories)) {
    invalidateContentRequests();
  }
  return next;
}

export function resetContentSafetySettings(): ContentSafetySettings {
  disableAdultMode();
  return persistSettings(DEFAULT_SETTINGS);
}

export function useContentSafetySettings() {
  const { user, profile, refreshProfile } = useAuth();
  const [settings, setSettings] = useState<ContentSafetySettings>(() =>
    getContentSafetySettings()
  );
  const seededAccountRef = useRef<string | null>(null);

  const accountContentSafety = useMemo(
    () => readProfileAppSettings({ app_settings: profile?.app_settings }).contentSafety,
    [profile?.app_settings],
  );

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      setSettings(getContentSafetySettings());
    };

    const handleInternalUpdate = () => {
      setSettings(getContentSafetySettings());
    };

    const unsubscribe = subscribeAdultMode(handleInternalUpdate);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(UPDATE_EVENT, handleInternalUpdate);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(UPDATE_EVENT, handleInternalUpdate);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    if (!hasContentSafetyPayload(accountContentSafety)) return;

    const normalized = sanitizeSettings(
      accountState.read(user.id, sanitizeSettings(accountContentSafety as Partial<ContentSafetySettings>)),
    );

    setSettings((current) => {
      if (areSettingsEqual(current, normalized)) return current;
      persistSettings(normalized);
      return normalized;
    });
  }, [user?.id, accountContentSafety]);

  useEffect(() => {
    if (!user?.id) {
      seededAccountRef.current = null;
      return;
    }

    if (hasContentSafetyPayload(accountContentSafety)) {
      seededAccountRef.current = user.id;
      return;
    }

    if (seededAccountRef.current === user.id) return;
    seededAccountRef.current = user.id;

    void saveAccountSettingsPatch(user.id, { contentSafety: { ...settings, showAdultEverywhere: false } }).catch(() => {
      seededAccountRef.current = null;
    });
  }, [user?.id, accountContentSafety, settings]);

  const updateSettings = useCallback((patch: Partial<ContentSafetySettings>) => {
    const next = patchContentSafetySettings(patch);
    setSettings(next);

    if (user?.id && (
      patch.warnBeforeAdultOpen !== undefined ||
      patch.blurAdultInSearch !== undefined ||
      patch.hideAdultChapterSpoilers !== undefined ||
      patch.adultCategories !== undefined
    )) {
      const revision = accountState.choose(user.id, sanitizeSettings(accountContentSafety), next);
      void saveAccountSettingsPatch(user.id, { contentSafety: { ...next, showAdultEverywhere: false } }).then(() => {
        accountState.settled(user.id, revision);
        return refreshProfile();
      }).catch(() => accountState.settled(user.id, revision));
    }

    return next;
  }, [user?.id, accountContentSafety, refreshProfile]);

  const resetSettings = useCallback(() => {
    const next = resetContentSafetySettings();
    setSettings(next);

    if (user?.id) {
      const revision = accountState.choose(user.id, sanitizeSettings(accountContentSafety), next);
      void saveAccountSettingsPatch(user.id, { contentSafety: { ...next, showAdultEverywhere: false } }).then(() => {
        accountState.settled(user.id, revision);
        return refreshProfile();
      }).catch(() => accountState.settled(user.id, revision));
    }

    return next;
  }, [user?.id, accountContentSafety, refreshProfile]);

  return {
    settings,
    updateSettings,
    resetSettings,
  };
}
