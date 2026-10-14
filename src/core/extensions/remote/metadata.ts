/** Keep routing identifiers separate from labels, and never infer audio from UI mode. */
export function languageLabel(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Language not specified';
  const aliases: Record<string, string> = { eng: 'en', jpn: 'ja', jp: 'ja', por: 'pt', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', kor: 'ko', chi: 'zh', zho: 'zh' };
  const code = aliases[raw.toLowerCase()] || raw.toLowerCase();
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || raw; } catch { return raw; }
}

export function streamMetadata(stream: any) {
  const text = [stream.name, stream.title, stream.description].filter(Boolean).join(' ');
  const quality = text.match(/\b(2160|1440|1080|720|480|360)p\b/i)?.[0] || (/\b4k\b/i.test(text) ? '2160p' : 'auto');
  const explicit = stream.audioLanguage || stream.language;
  const audioLanguage = explicit || (/\b(?:english dub|eng dub)\b/i.test(text) ? 'en' : /\b(?:japanese audio|jpn audio)\b/i.test(text) ? 'ja' : undefined);
  return { quality, audioLanguage, language: languageLabel(audioLanguage), languageLabel: languageLabel(audioLanguage),
    ...(audioLanguage ? { isDub: !/^(ja|jpn|japanese)$/i.test(audioLanguage) } : {}) };
}
