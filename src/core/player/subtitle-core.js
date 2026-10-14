export function getSubtitleSelectionKey(subtitle, index) {
    const baseKey = subtitle.url || subtitle.label || subtitle.lang || `subtitle-${index}`;
    return `${subtitle.lang === 'custom' ? 'custom' : 'sub'}:${baseKey}`;
}
function parseTimestamp(value) {
    const match = String(value || '').trim().match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/);
    if (!match)
        return null;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const ms = Number(match[4] || 0);
    const total = hours * 3600 + minutes * 60 + seconds + ms / 1000;
    return Number.isFinite(total) ? total : null;
}
function formatTimestamp(value) {
    const totalMs = Math.max(0, Math.round(value * 1000));
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1000);
    const ms = totalMs % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
function normalizeParsedCues(rawText) {
    const blocks = String(rawText || '')
        .replace(/\r/g, '')
        .replace(/^\uFEFF/, '')
        .split(/\n{2,}/);
    const cues = [];
    const seen = new Set();
    for (const block of blocks) {
        const lines = block
            .split('\n')
            .map((line) => line.trimEnd())
            .filter((line) => line.trim() !== '');
        if (lines.length === 0)
            continue;
        if (/^(WEBVTT|STYLE|REGION|NOTE)(\s|$)/i.test(lines[0]))
            continue;
        let timingIndex = lines.findIndex((line) => line.includes('-->'));
        if (timingIndex < 0)
            continue;
        const timingLine = lines[timingIndex].replace(/,/g, '.');
        const [leftRaw, rightRaw = ''] = timingLine.split('-->');
        const rightParts = rightRaw.trim().split(/\s+/);
        const start = parseTimestamp(leftRaw);
        const end = parseTimestamp(rightParts[0] || '');
        if (start == null || end == null || end <= start)
            continue;
        const settings = rightParts.slice(1).join(' ');
        const text = lines.slice(timingIndex + 1).join('\n').trim();
        if (!text)
            continue;
        const key = JSON.stringify([start, end, settings, text]);
        if (seen.has(key))
            continue;
        seen.add(key);
        cues.push({ start, end, settings, text });
    }
    cues.sort((left, right) => left.start - right.start || left.end - right.end);
    for (let index = 0; index < cues.length - 1; index += 1) {
        const current = cues[index];
        const next = cues[index + 1];
        const overlap = current.end - next.start;
        if (overlap > 0 && next.start > current.start + 0.05) {
            current.end = Math.max(current.start + 0.001, next.start - 0.05);
        }
    }
    return cues;
}
const ASS_TIME = /^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{2,3})$/;
function parseAssTimestamp(value) {
    const match = ASS_TIME.exec(String(value || '').trim());
    if (!match)
        return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const fractionRaw = match[4];
    const fraction = fractionRaw.length === 2 ? Number(fractionRaw) * 10 : Number(fractionRaw.padEnd(3, '0'));
    const total = hours * 3600 + minutes * 60 + seconds + fraction / 1000;
    return Number.isFinite(total) ? total : null;
}
function cleanAssText(text) {
    return String(text || '')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\N|\\n/gi, '\n')
        .replace(/\\h/gi, ' ')
        .trim();
}
function isAssScript(text) {
    const head = String(text || '').slice(0, 2000);
    return /\[Script Info\]/i.test(head) || /\[V4\+?\s*Styles\]/i.test(head) || /^\s*Dialogue:/im.test(head);
}
function normalizeAssToCues(text) {
    const cues = [];
    const seen = new Set();
    for (const rawLine of String(text || '').replace(/\r/g, '').split('\n')) {
        const line = rawLine.trim();
        if (!/^Dialogue:/i.test(line))
            continue;
        const parts = line.slice('Dialogue:'.length).split(',');
        if (parts.length < 10)
            continue;
        const start = parseAssTimestamp(parts[1]);
        const end = parseAssTimestamp(parts[2]);
        if (start == null || end == null || end <= start)
            continue;
        const body = cleanAssText(parts.slice(9).join(','));
        if (!body)
            continue;
        const key = JSON.stringify([start, end, body]);
        if (seen.has(key))
            continue;
        seen.add(key);
        cues.push({ start, end, settings: '', text: body });
    }
    cues.sort((left, right) => left.start - right.start || left.end - right.end);
    return cues;
}
function cuesToVtt(cues) {
    if (cues.length === 0)
        return '';
    return [
        'WEBVTT',
        '',
        ...cues.map((cue) => {
            const settings = cue.settings ? ` ${cue.settings}` : '';
            return `${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}${settings}\n${cue.text}`;
        }),
    ].join('\n\n');
}
export function normalizeSubtitleToVtt(rawText) {
    const text = String(rawText || '');
    const trimmed = text.trim();
    if (!trimmed)
        return '';
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
export function parseVttCues(rawText) {
    const cues = normalizeParsedCues(rawText);
    return cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }));
}
export function sanitizeCueText(raw) {
    const text = String(raw || '');
    if (!text)
        return '';
    const stripped = text
        .replace(/<[^>]*>/g, '')
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
function isSameOriginUrl(value) {
    try {
        if (typeof window === 'undefined' || !window.location)
            return false;
        const origin = window.location.origin;
        if (!origin || origin === 'null')
            return false;
        return new URL(value, origin).origin === origin;
    }
    catch {
        return false;
    }
}
export function isBrowserReadyVttUrl(url) {
    const value = String(url || '').trim();
    if (!value)
        return false;
    if (/^(blob|data):/i.test(value))
        return true;
    if (/^asset:/i.test(value) || value.includes('asset.localhost'))
        return true;
    if (/\/api\/proxy\/subtitle\b/i.test(value))
        return true;
    // Local servers also serve raw SRT/ASS and extensionless subtitle files.
    // Only known VTT files can bypass normalization.
    if (/\.vtt(?:$|[?#])/i.test(value) &&
        (/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\//i.test(value) || isSameOriginUrl(value)))
        return true;
    return false;
}
export function buildSubtitleFetchCandidates(subtitleUrl, referer, offline, proxiedSubtitleUrlFn) {
    const candidates = [];
    const addCandidate = (value) => {
        const normalized = String(value || '').trim();
        if (!normalized)
            return;
        if (!candidates.includes(normalized))
            candidates.push(normalized);
    };
    addCandidate(subtitleUrl);
    if (!offline) {
        const proxied = proxiedSubtitleUrlFn ? proxiedSubtitleUrlFn(subtitleUrl, referer) : undefined;
        addCandidate(proxied);
    }
    return candidates;
}
