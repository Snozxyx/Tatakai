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

export function normalizeSubtitleToVtt(rawText: string): string {
  const text = String(rawText || '');
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
    return '';
  }

  if (trimmed.includes('-->')) {
    const cues = normalizeParsedCues(text);
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

  return `WEBVTT\n\n00:00:00.000 --> 99:59:59.000\n${text}`;
}

export function parseVttCues(rawText: string): VttCue[] {
  const cues = normalizeParsedCues(rawText);
  return cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }));
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

