import { afterEach, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { DEFAULT_READING_TITLE_LANGUAGE, READING_TITLE_LANGUAGE_STORAGE_KEY, getPreferredReadingTitleLanguage, getPreferredTitleLanguage,
  selectReadingTitle, setAccountReadingTitleLanguage, setAccountTitleLanguage, setPreferredReadingTitleLanguage, setPreferredTitleLanguage, projectReadingHomeTitles, withReadingTitle } from '../src/lib/titleLanguage';

const originalWindow = globalThis.window;
const titles = { canonicalTitle: 'Honzuki no Gekokujou', title: { english: 'Ascendance of a Bookworm', romaji: 'Honzuki no Gekokujou', native: '本好きの下剋上' } };
afterEach(() => { setAccountReadingTitleLanguage(undefined); setAccountTitleLanguage(undefined); setPreferredReadingTitleLanguage('english'); setPreferredTitleLanguage('romaji'); globalThis.window = originalWindow; });

test('reading titles start in English independently of the anime preference', () => {
  expect(DEFAULT_READING_TITLE_LANGUAGE).toBe('english');
  setAccountTitleLanguage('romaji');
  expect(getPreferredReadingTitleLanguage()).toBe('english');
  expect(selectReadingTitle(titles)).toBe('Ascendance of a Bookworm');
  expect(getPreferredTitleLanguage()).toBe('romaji');
});
test('reading language persists and native / romaji remain available', () => {
  const dom = new JSDOM('', { url: 'https://tatakai.test' }); globalThis.window = dom.window as any;
  setPreferredReadingTitleLanguage('native');
  expect(dom.window.localStorage.getItem(READING_TITLE_LANGUAGE_STORAGE_KEY)).toBe('native');
  expect(selectReadingTitle(titles)).toBe('本好きの下剋上');
  setPreferredReadingTitleLanguage('romaji'); expect(selectReadingTitle(titles)).toBe('Honzuki no Gekokujou');
  dom.window.close();
});
test('account reading preferences release to the device preference on sign-out', () => {
  setPreferredReadingTitleLanguage('native'); setAccountReadingTitleLanguage('romaji');
  expect(getPreferredReadingTitleLanguage()).toBe('romaji');
  setAccountReadingTitleLanguage(undefined); expect(getPreferredReadingTitleLanguage()).toBe('native');
});
test('untranslated and provider-only titles have usable fallbacks', () => {
  expect(selectReadingTitle({ title: { english: ' ', romaji: 'Only Romaji' } }, 'english')).toBe('Only Romaji');
  expect(selectReadingTitle({ canonicalTitle: 'Provider title' }, 'english')).toBe('Provider title');
  expect(selectReadingTitle({ titleEnglish: 'English title', titleRomaji: 'Romaji title' }, 'english')).toBe('English title');
  expect(selectReadingTitle(undefined)).toBe('');
});
test('title projection preserves canonical cached metadata and non-title fields', () => {
  const source = { ...titles, score: 90, poster: 'cover.jpg' };
  expect(withReadingTitle(source, 'english')).toMatchObject({ canonicalTitle: 'Ascendance of a Bookworm', score: 90 });
  expect(source.canonicalTitle).toBe('Honzuki no Gekokujou');
  const feed = { trending: [source], genres: ['Fantasy'], fetchedAt: 20 };
  const english = projectReadingHomeTitles(feed, 'english');
  expect(english.trending[0].canonicalTitle).toBe('Ascendance of a Bookworm');
  expect(english.genres).toEqual(['Fantasy']); expect(feed.trending[0].canonicalTitle).toBe('Honzuki no Gekokujou');
  expect(projectReadingHomeTitles(feed, 'native').trending[0].canonicalTitle).toBe('本好きの下剋上');
});
