import type { SubtitleInput, VttCue } from './subtitle-utils';
export function getSubtitleSelectionKey(subtitle: SubtitleInput, index: number): string;
export function normalizeSubtitleToVtt(rawText: string): string;
export function parseVttCues(rawText: string): VttCue[];
export function sanitizeCueText(raw: string): string;
export function isBrowserReadyVttUrl(url: string): boolean;
export function buildSubtitleFetchCandidates(url: string, referer?: string, offline?: boolean, proxy?: (url: string, referer?: string) => string): string[];
