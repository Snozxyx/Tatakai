import { normalizeSubtitleToVtt } from './subtitle-utils';

const LANGUAGE_ALIASES: Record<string, string> = { eng: 'en', english: 'en', jpn: 'ja', jp: 'ja', japanese: 'ja', hin: 'hi', hindi: 'hi', spa: 'es', spanish: 'es', fre: 'fr', fra: 'fr', french: 'fr', ger: 'de', deu: 'de', german: 'de', ara: 'ar', chi: 'zh', zho: 'zh', por: 'pt', rus: 'ru', kor: 'ko' };
export function detectSubtitleLanguage(metadata?: string, filename = '', text = ''): string {
  const normalize = (raw: string) => {
    const value = raw.toLowerCase().trim().replace(/_/g, '-');
    if (LANGUAGE_ALIASES[value]) return LANGUAGE_ALIASES[value];
    return /^(en|ja|hi|es|fr|de|ar|zh|pt|ru|ko|it|tr|th|id)(-[a-z]{2})?$/.test(value) ? value : undefined;
  };
  const explicit = normalize(metadata || '');
  if (explicit) return explicit;
  for (const token of filename.split(/[\s_.\[\]()\-]+/)) { const language = normalize(token); if (language) return language; }
  // Conservative script evidence; Latin languages remain und without metadata.
  const letters = text.replace(/<[^>]*>|\{[^}]*\}|\d|[^\p{L}]/gu, '').slice(0, 4000);
  if (letters.length < 20) return 'und';
  const count = (pattern: RegExp) => (letters.match(pattern) || []).length / letters.length;
  if (count(/[\u3040-\u30ff]/g) > .1) return 'ja';
  if (count(/[\u0900-\u097f]/g) > .4) return 'hi';
  if (count(/[\uac00-\ud7af]/g) > .4) return 'ko';
  return 'und';
}

export function decodeSubtitle(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const encoding = view[0] === 0xff && view[1] === 0xfe ? 'utf-16le' : view[0] === 0xfe && view[1] === 0xff ? 'utf-16be' : 'utf-8';
  return new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, '');
}

export function prepareSubtitle(text: string, filename = '', language?: string) {
  const vtt = normalizeSubtitleToVtt(text);
  if (!vtt || !vtt.includes('-->')) throw new Error('No readable subtitle cues were found');
  const originalFormat = /\[Script Info\]|\[Events\]/i.test(text) ? 'ass' : /^WEBVTT/.test(text.trim()) ? 'vtt' : 'srt';
  return { vtt, original: text, originalFormat, lang: detectSubtitleLanguage(language, filename, text) };
}

export async function fetchSubtitle(url: string, options: { signal?: AbortSignal; headers?: Record<string, string>; read?: () => Promise<string> } = {}): Promise<string> {
  if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const text = options.read ? await options.read() : await (async () => {
    const response = await fetch(url, { headers: { Accept: 'text/vtt,text/plain,*/*', ...options.headers }, signal: options.signal });
    if (!response.ok) throw new Error(`Subtitle request failed (${response.status})`);
    return decodeSubtitle(await response.arrayBuffer());
  })();
  if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  return prepareSubtitle(text).vtt;
}

export async function uploadSubtitle(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Subtitle files must be smaller than 10 MB');
  const prepared = prepareSubtitle(decodeSubtitle(await file.arrayBuffer()), file.name);
  const url = URL.createObjectURL(new Blob([prepared.vtt], { type: 'text/vtt' }));
  return { ...prepared, url, label: file.name, dispose: () => URL.revokeObjectURL(url) };
}

export async function extractEmbeddedSubtitle(url: string, trackIndex: number) {
  if (!Number.isInteger(trackIndex) || trackIndex < 0) throw new Error('Invalid subtitle track');
  const desktop = (window as any).electron;
  if (desktop?.extractSubtitle) return desktop.extractSubtitle(url, trackIndex);
  const { Capacitor, registerPlugin } = await import('@capacitor/core');
  if (Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('TatakaiMux')) {
    return registerPlugin<{ extractSubtitle(input: { url: string; trackIndex: number }): Promise<{ success: boolean; url?: string; error?: string }> }>('TatakaiMux').extractSubtitle({ url, trackIndex });
  }
  return { success: false, error: 'Embedded extraction is unavailable. Add a subtitle file or use a player supporting embedded tracks.' };
}
