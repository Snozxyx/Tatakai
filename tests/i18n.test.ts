import { describe, expect, test } from 'bun:test';
import {
  getAcceptLanguageHeader,
  normalizeLanguageCode,
  toAcceptLanguageHeader,
  withLocaleHeaders,
  setActiveAppLanguage,
} from '../src/lib/api/localeHeaders';
import en from '../src/locales/en.json';
import es from '../src/locales/es.json';
import ja from '../src/locales/ja.json';

function leafKeys(obj: Record<string, unknown>, prefix = ''): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const sub of leafKeys(v as Record<string, unknown>, key)) out.add(sub);
    } else {
      out.add(key);
    }
  }
  return out;
}

describe('localeHeaders', () => {
  test('normalizes regional variants to base codes', () => {
    expect(normalizeLanguageCode('es-419')).toBe('es');
    expect(normalizeLanguageCode('es_MX')).toBe('es');
    expect(normalizeLanguageCode('en-US')).toBe('en');
    expect(normalizeLanguageCode('ja-JP')).toBe('ja');
  });

  test('builds Accept-Language with es-419 first for Spanish', () => {
    expect(toAcceptLanguageHeader('es')).toBe('es-419,es;q=0.9,en;q=0.8');
    expect(toAcceptLanguageHeader('es-419')).toBe('es-419,es;q=0.9,en;q=0.8');
    expect(toAcceptLanguageHeader('ja')).toBe('ja-JP,ja;q=0.9,en;q=0.8');
    expect(toAcceptLanguageHeader('en')).toBe('en-US,en;q=0.9');
  });

  test('withLocaleHeaders attaches Accept-Language without dropping headers', () => {
    const headers = withLocaleHeaders({ 'X-Tatakai-Client': 'web' }, 'es');
    expect(headers['X-Tatakai-Client']).toBe('web');
    expect(headers['Accept-Language']).toBe('es-419,es;q=0.9,en;q=0.8');
  });

  test('getAcceptLanguageHeader returns a non-empty value', () => {
    expect(getAcceptLanguageHeader().length).toBeGreaterThan(0);
  });

  test('API headers follow an effective account language without requiring local storage', () => {
    try {
      setActiveAppLanguage('ja-JP');
      expect(getAcceptLanguageHeader()).toBe('ja-JP,ja;q=0.9,en;q=0.8');
      setActiveAppLanguage('es-419');
      expect(getAcceptLanguageHeader()).toBe('es-419,es;q=0.9,en;q=0.8');
    } finally {
      setActiveAppLanguage('en');
    }
  });
});

describe('locale catalogs', () => {
  test('en/es/ja share the same key set', () => {
    const ke = leafKeys(en as Record<string, unknown>);
    const ks = leafKeys(es as Record<string, unknown>);
    const kj = leafKeys(ja as Record<string, unknown>);
    expect([...ke].filter((k) => !ks.has(k))).toEqual([]);
    expect([...ke].filter((k) => !kj.has(k))).toEqual([]);
    expect([...ks].filter((k) => !ke.has(k))).toEqual([]);
    expect([...kj].filter((k) => !ke.has(k))).toEqual([]);
  });

  test('issue-flagged strings are translated (not English) in es', () => {
    const t = (obj: any, path: string) => path.split('.').reduce((a, p) => a?.[p], obj);
    expect(t(es, 'nav.watchlist')).not.toBe(t(en, 'nav.watchlist'));
    expect(t(es, 'watchlist.addToList')).not.toBe(t(en, 'watchlist.addToList'));
    expect(t(es, 'privacy.clearWatchHistory')).not.toBe(t(en, 'privacy.clearWatchHistory'));
    expect(t(es, 'common.startWatching')).not.toBe(t(en, 'common.startWatching'));
    expect(t(es, 'common.retryDetails')).not.toBe(t(en, 'common.retryDetails'));
  });
});
