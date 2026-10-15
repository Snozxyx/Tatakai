import { afterEach, beforeEach, describe, expect, test, mock } from 'bun:test';
import { JSDOM } from 'jsdom';
import { preparePostTranslation } from '../src/lib/community/translationDocument';
import { detectPostLanguage } from '../src/lib/community/detectLanguage';
import {
  setDeviceTranslationEnabled,
  translateOnDevice,
  setDeviceTranslationMode,
  prepareDeviceTranslation,
  getDeviceTranslationState,
} from '../src/lib/community/onDeviceTranslation';

const originalParser = globalThis.DOMParser;
const originalTranslator = (globalThis as any).Translator;
const originalDetector = (globalThis as any).LanguageDetector;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.DOMParser = new JSDOM('').window.DOMParser;
});
afterEach(() => {
  setDeviceTranslationMode('auto');
  setDeviceTranslationEnabled(false);
  globalThis.DOMParser = originalParser;
  (globalThis as any).Translator = originalTranslator;
  (globalThis as any).LanguageDetector = originalDetector;
  globalThis.fetch = originalFetch;
});

describe('on-device community translation', () => {
  test('Lite mode never falls back to the large worker model',async()=>{
    (globalThis as any).Translator=undefined;
    (globalThis as any).LanguageDetector=undefined;
    setDeviceTranslationMode('browser');
    setDeviceTranslationEnabled(true);
    await expect(translateOnDevice(['I really enjoyed watching this anime with my friends last night.'],'es')).rejects.toThrow('browser-unavailable');
    await expect(prepareDeviceTranslation('es')).rejects.toThrow('browser-unavailable');
    expect(getDeviceTranslationState().engine).toBe('native');
  });
  test('preserves markup, mentions, hashtags, links, code, and spoilers', () => {
    const html =
      '<p>Hello <strong>everyone</strong> <span data-mention data-label="alice">@alice</span> <span data-hashtag data-tag="anime">#anime</span> <a href="https://tatakai.me">read more</a></p><p><code>const value = 1;</code><span data-spoiler>secret ending</span></p>';
    const prepared = preparePostTranslation('A new post', html);
    expect(prepared.texts).not.toContain('@alice');
    expect(prepared.texts).not.toContain('#anime');
    expect(prepared.texts).not.toContain('read more');
    expect(prepared.texts).not.toContain('const value = 1;');
    const result = prepared.render(
      prepared.texts.map((text) => 'ES ' + text.trim())
    );
    const doc = new DOMParser().parseFromString(result.content, 'text/html');
    expect(doc.querySelector('[data-mention]')?.textContent).toBe('@alice');
    expect(doc.querySelector('[data-hashtag]')?.textContent).toBe('#anime');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe(
      'https://tatakai.me'
    );
    expect(doc.querySelector('[data-spoiler]')?.textContent).toBe(
      'ES secret ending'
    );
    expect(doc.querySelector('strong')?.textContent).toBe('ES everyone');
  });

  test('engine output is text and cannot inject HTML into rich or legacy posts', () => {
    for (const content of ['Hello everyone', '<p>Hello everyone</p>']) {
      const prepared = preparePostTranslation('', content);
      const result = prepared.render(
        prepared.texts.map(() => '<img src=x onerror=alert(1)>')
      );
      const doc = new DOMParser().parseFromString(result.content, 'text/html');
      expect(doc.querySelector('img')).toBeNull();
      expect(doc.body.textContent).toContain('<img');
    }
  });

  test('legacy social tokens and line breaks survive translation', () => {
    const prepared = preparePostTranslation(
      '',
      'Hello @alice #anime\nhttps://tatakai.me'
    );
    const result = prepared.render(prepared.texts.map(() => 'Hola'));
    const doc = new DOMParser().parseFromString(result.content, 'text/html');
    expect(doc.querySelector('[data-mention]')?.textContent).toBe('@alice');
    expect(doc.querySelector('[data-hashtag]')?.textContent).toBe('#anime');
    expect(doc.querySelector('br')).not.toBeNull();
    expect(doc.body.textContent).toContain('https://tatakai.me');
  });

  test('bounds long segments without dropping source text', () => {
    const source = 'Long sentence with many words. '.repeat(200);
    const prepared = preparePostTranslation('', source);
    expect(prepared.texts.join('')).toBe(source);
    expect(prepared.texts.every((text) => text.length <= 241)).toBe(true);
  });

  test('detects English, Spanish, and Japanese posts locally', () => {
    expect(
      detectPostLanguage(
        'I really enjoyed watching this anime with my friends last night.'
      )
    ).toBe('en');
    expect(
      detectPostLanguage(
        'Me encantó ver este anime con mis amigos anoche. La historia es maravillosa.'
      )
    ).toBe('es');
    expect(
      detectPostLanguage(
        'このアニメを友達と一緒に観るのがとても楽しかったです。'
      )
    ).toBe('ja');
  });

  test('uses the native engine without uploading text or making network requests', async () => {
    const fetchSpy = mock(() => {
      throw new Error('Text must stay on-device');
    });
    globalThis.fetch = fetchSpy as any;
    (globalThis as any).LanguageDetector = {
      availability: async () => 'available',
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'en', confidence: 0.99 }],
      }),
    };
    const translate = mock(async () => 'Hola, ¿cómo estás?');
    (globalThis as any).Translator = {
      availability: async () => 'available',
      create: async () => ({ translate }),
    };
    setDeviceTranslationEnabled(true);
    const result = await translateOnDevice(['Hello, how are you?'], 'es');
    expect(result.engine).toBe('native');
    expect(result.texts).toEqual(['Hola, ¿cómo estás?']);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(translate).toHaveBeenCalledTimes(1);
  });

  test('requires opt-in and a gesture for a native language-pack download', async () => {
    await expect(
      translateOnDevice(['Hello, how are you?'], 'es')
    ).rejects.toThrow('translation-disabled');
    (globalThis as any).LanguageDetector = undefined;
    const create = mock(async () => ({ translate: async () => 'Hola' }));
    (globalThis as any).Translator = {
      availability: async () => 'downloadable',
      create,
    };
    setDeviceTranslationEnabled(true);
    await expect(
      translateOnDevice(
        ['I really enjoyed watching this anime with my friends last night.'],
        'es'
      )
    ).rejects.toThrow('language-pack-required');
    expect(create).not.toHaveBeenCalled();
    await translateOnDevice(
      ['I really enjoyed watching this anime with my friends last night.'],
      'es',
      { userGesture: true }
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
