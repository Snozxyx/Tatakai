export type TitleLanguage = 'romaji' | 'english' | 'native';
export const TITLE_LANGUAGE_STORAGE_KEY = 'tatakai:title-language';
export const READING_TITLE_LANGUAGE_STORAGE_KEY = 'tatakai:reading-title-language';
export const DEFAULT_READING_TITLE_LANGUAGE: TitleLanguage = 'english';

type Titles = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
};

let accountLanguage: TitleLanguage | undefined;
let deviceLanguage: TitleLanguage = 'romaji';
let accountReadingLanguage: TitleLanguage | undefined;
let deviceReadingLanguage: TitleLanguage = DEFAULT_READING_TITLE_LANGUAGE;
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

/** Reading titles have an English default independent of the anime preference. */
export function getPreferredReadingTitleLanguage(): TitleLanguage {
  if (accountReadingLanguage) return accountReadingLanguage;
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(READING_TITLE_LANGUAGE_STORAGE_KEY);
      if (isTitleLanguage(stored)) return stored;
    } catch { /* The in-memory choice also works with restricted storage. */ }
  }
  return deviceReadingLanguage;
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

export function setPreferredReadingTitleLanguage(value: TitleLanguage): void {
  if (!isTitleLanguage(value)) return;
  deviceReadingLanguage = value;
  try { window.localStorage.setItem(READING_TITLE_LANGUAGE_STORAGE_KEY, value); } catch { /* SSR or restricted storage. */ }
  notify();
}

export function setAccountReadingTitleLanguage(value: unknown): void {
  const next = isTitleLanguage(value) ? value : undefined;
  if (next === accountReadingLanguage) return;
  accountReadingLanguage = next;
  notify();
}

function onStorage(event: StorageEvent) {
  if (event.key === TITLE_LANGUAGE_STORAGE_KEY || event.key === READING_TITLE_LANGUAGE_STORAGE_KEY || event.key === null) notify();
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

export interface ReadingTitleRecord {
  canonicalTitle?: string | null;
  title?: Titles | string | null;
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
  name?: string | null;
}

/** Select for display without replacing the canonical metadata used by providers. */
export function selectReadingTitle(record?: ReadingTitleRecord | null, language = getPreferredReadingTitleLanguage()): string {
  if (!record) return '';
  const titles = typeof record.title === 'object' && record.title ? record.title : {
    english: record.titleEnglish, romaji: record.titleRomaji, native: record.titleNative,
  };
  return selectPreferredTitle(titles, language) || record.canonicalTitle?.trim() || (typeof record.title === 'string' ? record.title.trim() : '') || record.name?.trim() || '';
}

/** Query selectors project titles from cached records; the cached source stays intact. */
export function withReadingTitle<T extends ReadingTitleRecord>(record: T, language: TitleLanguage): T {
  return { ...record, canonicalTitle: selectReadingTitle(record, language) };
}

export function projectReadingHomeTitles<T extends object>(feed: T, language: TitleLanguage): T {
  return Object.fromEntries(Object.entries(feed).map(([key, value]) => [key,
    Array.isArray(value) && key !== 'genres' ? value.map(row => row && typeof row === 'object' ? withReadingTitle(row as ReadingTitleRecord, language) : row) : value])) as T;
}
