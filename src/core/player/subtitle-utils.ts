export type SubtitleInput = {
  lang: string;
  url: string;
  label?: string;
};

export function getSubtitleSelectionKey(subtitle: SubtitleInput, index: number): string {
  const baseKey = subtitle.url || subtitle.label || subtitle.lang || `subtitle-${index}`;
  return `${subtitle.lang === 'custom' ? 'custom' : 'sub'}:${baseKey}`;
}

function parseTimestamp(value: string): number | null {
  const match = String(value || '').trim().match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const ms = Number(match[4] || 0);
  const total = hours * 3600 + minutes * 60 + seconds + ms / 1000;
  return Number.isFinite(total) ? total : null;
}

function formatTimestamp(value: number): string {
  const totalMs = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

type ParsedCue = {
  start: number;
  end: number;
  settings: string;
  text: string;
};

export type VttCue = {
  start: number;
  end: number;
  text: string;
};

function normalizeParsedCues(rawText: string): ParsedCue[] {
  const blocks = String(rawText || '')
    .replace(/\r/g, '')
    .replace(/^\uFEFF/, '')
    .split(/\n{2,}/);

  const cues: ParsedCue[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== '');

    if (lines.length === 0) continue;
    if (/^(WEBVTT|STYLE|REGION|NOTE)(\s|$)/i.test(lines[0])) continue;

    let timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;

    const timingLine = lines[timingIndex].replace(/,/g, '.');
    const [leftRaw, rightRaw = ''] = timingLine.split('-->');
    const rightParts = rightRaw.trim().split(/\s+/);
    const start = parseTimestamp(leftRaw);
    const end = parseTimestamp(rightParts[0] || '');
    if (start == null || end == null || end <= start) continue;

    const settings = rightParts.slice(1).join(' ');
    const text = lines.slice(timingIndex + 1).join('\n').trim();
    if (!text) continue;

    const key = `${start.toFixed(3)}|${end.toFixed(3)}|${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cues.push({ start, end, settings, text });
  }

  cues.sort((left, right) => left.start - right.start || left.end - right.end);

  for (let index = 0; index < cues.length - 1; index += 1) {
    const current = cues[index];
    const next = cues[index + 1];
    const overlap = current.end - next.start;
    if (overlap > 0 && overlap <= 0.5) {
      current.end = Math.max(current.start + 0.25, next.start - 0.05);
    }
  }

  return cues;
}

/**
 * SubStation Alpha → VTT.
 *
 * ASS carries no `-->`, so without this branch `normalizeSubtitleToVtt` fell
 * through to its plaintext case and wrapped the *entire script* in a single
 * 99-hour cue — the track loaded, `readyState` was 2, and Chromium rendered
 * `[Script Info] / V4+ Styles / Dialogue: …` as one enormous block for the
 * whole episode. Providers that serve `.ass` (Nebula and most fansub CDNs)
 * therefore looked like "subtitles present but broken".
 *
 * A `Dialogue:` line is `Layer, Start, End, Style, Name, MarginL, MarginR,
 * MarginV, Effect, Text` — nine commas before the payload, and the payload
 * itself may contain commas, so the split has to be bounded.
 */
const ASS_TIME = /^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{2,3})$/;

function parseAssTimestamp(value: string): number | null {
  const match = ASS_TIME.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  // Two-digit fields are centiseconds, three are milliseconds.
  const fractionRaw = match[4];
  const fraction =
    fractionRaw.length === 2 ? Number(fractionRaw) * 10 : Number(fractionRaw.padEnd(3, '0'));
  const total = hours * 3600 + minutes * 60 + seconds + fraction / 1000;
  return Number.isFinite(total) ? total : null;
}

/** Strip `{\an8}`-style override blocks and collapse ASS line breaks. */
function cleanAssText(text: string): string {
  return String(text || '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N|\\n/gi, '\n')
    .replace(/\\h/gi, ' ')
    .trim();
}

function isAssScript(text: string): boolean {
  const head = String(text || '').slice(0, 2000);
  return /\[Script Info\]/i.test(head) || /\[V4\+?\s*Styles\]/i.test(head) || /^\s*Dialogue:/im.test(head);
}

function normalizeAssToCues(text: string): ParsedCue[] {
  const cues: ParsedCue[] = [];
  const seen = new Set<string>();

  for (const rawLine of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (!/^Dialogue:/i.test(line)) continue;

    // 10 fields: everything after the ninth comma is the text, commas included.
    const parts = line.slice('Dialogue:'.length).split(',');
    if (parts.length < 10) continue;
    const start = parseAssTimestamp(parts[1]);
    const end = parseAssTimestamp(parts[2]);
    if (start == null || end == null || end <= start) continue;

    const body = cleanAssText(parts.slice(9).join(','));
    if (!body) continue;

    const key = `${start.toFixed(3)}|${end.toFixed(3)}|${body.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cues.push({ start, end, settings: '', text: body });
  }

  cues.sort((left, right) => left.start - right.start || left.end - right.end);
  return cues;
}

function cuesToVtt(cues: ParsedCue[]): string {
  if (cues.length === 0) return '';
  return [
    'WEBVTT',
    '',
    ...cues.map((cue) => {
      const settings = cue.settings ? ` ${cue.settings}` : '';
      return `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}${settings}\n${cue.text}`;
    }),
  ].join('\n\n');
}

export function normalizeSubtitleToVtt(rawText: string): string {
  const text = String(rawText || '');
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
    return '';
  }

  if (trimmed.includes('-->')) {
    return cuesToVtt(normalizeParsedCues(text));
  }

  if (isAssScript(text)) {
    return cuesToVtt(normalizeAssToCues(text));
  }

  return '';
}

export function parseVttCues(rawText: string): VttCue[] {
  const cues = normalizeParsedCues(rawText);
  return cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }));
}

/**
 * Strip WebVTT/SRT/ASS inline markup from a cue string.
 *
 * Our custom overlay renders cue text as plain `textContent` (so it can style
 * color/outline/position itself), which means any markup the source leaves in
 * `cue.text` — `<i>…</i>`, `<b>`, `<u>`, `<c.class>`, `<v Speaker>`, `<ruby>`,
 * `<rt>`, `<lang>`, inline `<00:00:01.000>` timestamps — paints on screen as
 * literal `<i>` characters instead of being applied or hidden. Remove the tag
 * spans, decode the handful of entities WebVTT allows, and collapse the
 * whitespace the removals leave behind. Real line breaks in multi-line cues are
 * preserved. Entity-escaped tags (`&lt;i&gt;`) are decoded to literal text after
 * stripping, matching the WebVTT rule that escaped markup is not markup.
 */
export function sanitizeCueText(raw: string): string {
  const text = String(raw || '');
  if (!text) return '';

  const stripped = text
    // Drop every `<…>` span: formatting, voice/lang tags, timestamps.
    .replace(/<[^>]*>/g, '')
    // Decode WebVTT entity escapes. `&amp;` is decoded last so a double-escaped
    // sequence like `&amp;lt;` resolves to `&lt;`, not `<`.
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lrm;/gi, '')
    .replace(/&rlm;/gi, '')
    .replace(/&amp;/gi, '&');

  return stripped
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
    .trim();
}

/**
 * Can this URL be handed to a `<track>` element as-is?
 *
 * Chromium's text-track loader only understands WebVTT. Anything else — SRT,
 * ASS, or a CDN that answers 403 because the Referer was dropped — puts the
 * TextTrack into ERROR with `cues === null`, and from then on `mode = 'showing'`
 * silently renders nothing. The player therefore has to know which of its
 * subtitle URLs still need normalizing before they reach the element.
 *
 * A `.vtt` suffix is NOT sufficient: a *cross-origin* `.vtt` cannot be fetched
 * by the renderer (CORS) and `<track>` has no way to send a Referer, so direct
 * use is a guaranteed silent failure for the many CDNs that gate on it. Those
 * must go through the fetch→proxy→blob path instead. Only URLs we can reach
 * without a cross-origin barrier are "ready": blob/data, app assets, the local
 * proxy (loopback / `/api/proxy/subtitle`, which replays Referer and sends
 * `Access-Control-Allow-Origin: *`), and same-origin files.
 */
function isSameOriginUrl(value: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.location) return false;
    const origin = window.location.origin;
    if (!origin || origin === 'null') return false;
    return new URL(value, origin).origin === origin;
  } catch {
    return false;
  }
}

export function isBrowserReadyVttUrl(url: string): boolean {
  const value = String(url || '').trim();
  if (!value) return false;
  // Inline / app-local payloads are always safe.
  if (/^(blob|data):/i.test(value)) return true;
  if (/^asset:/i.test(value) || value.includes('asset.localhost')) return true;
  // The local proxy (loopback stream tokens or the subtitle endpoint) replays
  // Referer and sends ACAO:*, so it loads directly regardless of .vtt suffix.
  if (/\/api\/proxy\/subtitle\b/i.test(value)) return true;
  if (/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//i.test(value)) return true;
  // Same-origin (incl. relative) files have no CORS barrier.
  if (isSameOriginUrl(value)) return true;
  // A cross-origin raw URL — even a .vtt — must be fetched+proxied, never
  // handed to <track> directly.
  return false;
}

export function buildSubtitleFetchCandidates(
  subtitleUrl: string,
  referer?: string,
  offline?: boolean,
  proxiedSubtitleUrlFn?: (url: string, referer?: string) => string | undefined,
): string[] {
  const candidates: string[] = [];

  const addCandidate = (value?: string) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  addCandidate(subtitleUrl);

  if (!offline) {
    const proxied = proxiedSubtitleUrlFn ? proxiedSubtitleUrlFn(subtitleUrl, referer) : undefined;
    addCandidate(proxied);
  }

  return candidates;
}

