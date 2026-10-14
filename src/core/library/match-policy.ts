export interface MatchCandidate { mediaId: string; title: string; confidence: number; seasonConflict: boolean }
export function chooseAutomaticMatch(candidates: MatchCandidate[]): MatchCandidate | undefined {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  return sorted[0]?.confidence >= 95 && !sorted[0].seasonConflict && sorted[0].confidence - (sorted[1]?.confidence ?? 0) >= 10 ? sorted[0] : undefined;
}
