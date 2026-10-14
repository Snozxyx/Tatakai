import type { AutoDownloadCandidate, AutoDownloadRulePreferences } from './automation-matcher';
export type ScoringProfile = 'balanced' | 'best-quality' | 'data-saver';
export interface EvaluationCandidate { id: string; candidate: AutoDownloadCandidate; payload?: any }
export interface RankedCandidate extends EvaluationCandidate { score: number; reasons: string[]; rejected: string[]; accepted: boolean }
export function evaluateCandidates(rule: AutoDownloadRulePreferences & { scoringProfile?: ScoringProfile }, candidates: EvaluationCandidate[], episode: number, titles?: string[]): { ranked: RankedCandidate[]; selected: RankedCandidate | null };
