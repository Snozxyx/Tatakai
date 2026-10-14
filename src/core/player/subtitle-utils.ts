export type SubtitleInput = { lang: string; url: string; label?: string };
export type VttCue = { start: number; end: number; text: string };
export { getSubtitleSelectionKey, normalizeSubtitleToVtt, parseVttCues, sanitizeCueText, isBrowserReadyVttUrl, buildSubtitleFetchCandidates } from './subtitle-core.js';
