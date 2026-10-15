import { afterEach, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import {
  getPreferredTitleLanguage,
  setPreferredTitleLanguage,
  setAccountTitleLanguage,
  selectPreferredTitle,
  subscribeTitleLanguage,
  TITLE_LANGUAGE_STORAGE_KEY,
} from '../src/lib/titleLanguage';
import {
  toAnimeCard,
  toSpotlightAnime,
  type TatakaiMedia,
} from '../src/core/content/types';

const originalWindow = globalThis.window;
afterEach(() => {
  setAccountTitleLanguage(undefined);
  setPreferredTitleLanguage('romaji');
  globalThis.window = originalWindow;
});

describe('preferred anime title language', () => {
  test('guests can save a language and restore it from local storage', () => {
    const dom = new JSDOM('', { url: 'https://tatakai.test/' });
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    setPreferredTitleLanguage('native');
    expect(dom.window.localStorage.getItem(TITLE_LANGUAGE_STORAGE_KEY)).toBe(
      'native'
    );
    expect(getPreferredTitleLanguage()).toBe('native');
    dom.window.localStorage.setItem(TITLE_LANGUAGE_STORAGE_KEY, 'english');
    expect(getPreferredTitleLanguage()).toBe('english');
    dom.window.close();
  });

  test('account preferences apply while signed in and release back to the guest choice', () => {
    setPreferredTitleLanguage('native');
    setAccountTitleLanguage('english');
    expect(getPreferredTitleLanguage()).toBe('english');
    setAccountTitleLanguage(undefined);
    expect(getPreferredTitleLanguage()).toBe('native');
  });

  test('notifies views and leaves the title choice usable when storage is blocked', () => {
    globalThis.window = {
      get localStorage() {
        throw new Error('Storage blocked');
      },
      addEventListener() {},
      removeEventListener() {},
    } as unknown as Window & typeof globalThis;
    let updates = 0;
    const unsubscribe = subscribeTitleLanguage(() => updates++);
    setPreferredTitleLanguage('english');
    expect(getPreferredTitleLanguage()).toBe('english');
    expect(updates).toBe(1);
    unsubscribe();
  });

  test('adapters use the chosen title and fall back when it is unavailable', () => {
    const titles = {
      romaji: 'Shingeki no Kyojin',
      english: 'Attack on Titan',
      native: '進撃の巨人',
    };
    expect(selectPreferredTitle(titles, 'native')).toBe(titles.native);
    expect(selectPreferredTitle({ ...titles, native: '  ' }, 'native')).toBe(
      titles.romaji
    );
    expect(selectPreferredTitle({ english: 'Only title' }, 'romaji')).toBe(
      'Only title'
    );
    const media = {
      anilistId: 16498,
      titleRomaji: titles.romaji,
      titleEnglish: titles.english,
      titleNative: titles.native,
    } as TatakaiMedia;
    setPreferredTitleLanguage('english');
    expect(toAnimeCard(media).name).toBe(titles.english);
    setPreferredTitleLanguage('native');
    expect(toSpotlightAnime(media, 1).name).toBe(titles.native);
  });
});
