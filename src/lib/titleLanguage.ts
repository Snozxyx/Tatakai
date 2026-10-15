export type TitleLanguage = 'romaji' | 'english' | 'native';
export const TITLE_LANGUAGE_STORAGE_KEY = 'tatakai:title-language';

type Titles = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
};

let accountLanguage: TitleLanguage | undefined;
let deviceLanguage: TitleLanguage = 'romaji';
const listeners = new Set<() => void>();

export function isTitleLanguage(value: unknown): value is TitleLanguage {
  return value === 'romaji' || value === 'english' || value === 'native';
}

export function getPreferredTitleLanguage(): TitleLanguage {
  if (accountLanguage) return accountLanguage;
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(TITLE_LANGUAGE_STORAGE_KEY);
      if (isTitleLanguage(stored)) return stored;
    } catch {
      /* The in-memory choice also works when storage is unavailable. */
    }
  }
  return deviceLanguage;
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function setPreferredTitleLanguage(value: TitleLanguage): void {
  if (!isTitleLanguage(value)) return;
  deviceLanguage = value;
  try {
    window.localStorage.setItem(TITLE_LANGUAGE_STORAGE_KEY, value);
  } catch {
    /* SSR or restricted storage */
  }
  notify();
}

export function setAccountTitleLanguage(value: unknown): void {
  const next = isTitleLanguage(value) ? value : undefined;
  if (next === accountLanguage) return;
  accountLanguage = next;
  notify();
}

function onStorage(event: StorageEvent) {
  if (event.key === TITLE_LANGUAGE_STORAGE_KEY || event.key === null) notify();
}

export function subscribeTitleLanguage(listener: () => void): () => void {
  if (!listeners.size && typeof window !== 'undefined')
    window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== 'undefined')
      window.removeEventListener('storage', onStorage);
  };
}

export function selectPreferredTitle(
  titles: Titles,
  language = getPreferredTitleLanguage()
): string {
  const order: TitleLanguage[] = [language, 'romaji', 'english', 'native'];
  for (const key of order) {
    const title = titles[key]?.trim();
    if (title) return title;
  }
  return '';
}

/** Canonical API records use explicit column names rather than the UI title object. */
export function selectMediaTitle(media: {
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
}): string {
  return selectPreferredTitle({
    romaji: media.titleRomaji,
    english: media.titleEnglish,
    native: media.titleNative,
  });
}
