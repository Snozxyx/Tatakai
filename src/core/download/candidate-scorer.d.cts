import type { AutoDownloadCandidate, AutoDownloadRulePreferences, AutoDownloadScore } from './automation-matcher';
export function scoreAutoDownloadCandidate(rule: AutoDownloadRulePreferences, candidate: AutoDownloadCandidate, targetTitles?: string[]): AutoDownloadScore;
