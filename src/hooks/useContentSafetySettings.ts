import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
}

const STORAGE_KEY = "tatakai_content_safety";
const UPDATE_EVENT = "tatakai-content-safety-updated";

const DEFAULT_SETTINGS: ContentSafetySettings = {
  showAdultEverywhere: false,
  warnBeforeAdultOpen: true,
  blurAdultInSearch: true,
};

const areSettingsEqual = (
  left: ContentSafetySettings,
  right: ContentSafetySettings,
) =>
  left.showAdultEverywhere === right.showAdultEverywhere &&
  left.warnBeforeAdultOpen === right.warnBeforeAdultOpen &&
  left.blurAdultInSearch === right.blurAdultInSearch;

const hasContentSafetyPayload = (value: unknown) => {
  if (typeof value !== "object" || value === null) return false;
  const raw = value as Record<string, unknown>;
  return (
    "showAdultEverywhere" in raw ||
    "warnBeforeAdultOpen" in raw ||
    "blurAdultInSearch" in raw
  );
};

const sanitizeSettings = (raw: Partial<ContentSafetySettings> | null | undefined): ContentSafetySettings => ({
  showAdultEverywhere: Boolean(raw?.showAdultEverywhere),
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
    return DEFAULT_SETTINGS;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const cookieSettings = readGuestSettingsFromCookie().contentSafety;
      if (cookieSettings) {
        return sanitizeSettings(cookieSettings as Partial<ContentSafetySettings>);
      }
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<ContentSafetySettings>;
    return sanitizeSettings(parsed);
  } catch {
    const cookieSettings = readGuestSettingsFromCookie().contentSafety;
    if (cookieSettings) {
      return sanitizeSettings(cookieSettings as Partial<ContentSafetySettings>);
    }
    return DEFAULT_SETTINGS;
  }
}

const persistSettings = (settings: ContentSafetySettings): ContentSafetySettings => {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    writeGuestSettingsCookie({ contentSafety: settings });
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
  return settings;
};

export function patchContentSafetySettings(
  patch: Partial<ContentSafetySettings>
): ContentSafetySettings {
  const current = getContentSafetySettings();
  const next = sanitizeSettings({ ...current, ...patch });
  return persistSettings(next);
}

export function resetContentSafetySettings(): ContentSafetySettings {
  return persistSettings(DEFAULT_SETTINGS);
}

export function useContentSafetySettings() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<ContentSafetySettings>(() =>
    getContentSafetySettings()
  );
  const seededAccountRef = useRef<string | null>(null);

  const accountContentSafety = useMemo(
    () => readProfileAppSettings(profile).contentSafety,
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

    window.addEventListener("storage", handleStorage);
    window.addEventListener(UPDATE_EVENT, handleInternalUpdate);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(UPDATE_EVENT, handleInternalUpdate);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    if (!hasContentSafetyPayload(accountContentSafety)) return;

    const normalized = sanitizeSettings(
      accountContentSafety as Partial<ContentSafetySettings>,
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

    void saveAccountSettingsPatch(user.id, { contentSafety: settings }).catch(() => {
      seededAccountRef.current = null;
    });
  }, [user?.id, accountContentSafety, settings]);

  const updateSettings = useCallback((patch: Partial<ContentSafetySettings>) => {
    const next = patchContentSafetySettings(patch);
    setSettings(next);

    if (user?.id) {
      void saveAccountSettingsPatch(user.id, { contentSafety: next }).catch(() => undefined);
    }

    return next;
  }, [user?.id]);

  const resetSettings = useCallback(() => {
    const next = resetContentSafetySettings();
    setSettings(next);

    if (user?.id) {
      void saveAccountSettingsPatch(user.id, { contentSafety: next }).catch(() => undefined);
    }

    return next;
  }, [user?.id]);

  return {
    settings,
    updateSettings,
    resetSettings,
  };
}
